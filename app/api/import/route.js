// POST /api/import  (multipart form, field "file")
// Validates the uploaded demand history, saves it to daily_demand, then starts background training.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as XLSX from 'xlsx';
import { query, transaction } from '@/lib/db';
import { ensureJobsTable, updateJob, startTraining } from '@/lib/training';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PROBLEMS = 30;

// Convert an Excel cell (Date, text or serial number) to YYYY-MM-DD, or null if invalid
function toIsoDate(v) {
  let d = null;
  if (v instanceof Date) d = new Date(v.getTime() + 12 * 3600 * 1000); // +12h avoids timezone off-by-one
  else if (typeof v === 'number' && v > 20000 && v < 60000) d = new Date(Math.round((v - 25569) * 86400000));
  else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) d = new Date(v.trim() + 'T00:00:00Z');
  if (!d || isNaN(d.getTime())) return null;
  const iso = d.toISOString().slice(0, 10);
  // Reject impossible dates such as 2026-02-31 (JavaScript would roll them over)
  if (typeof v === 'string' && iso !== v.trim()) return null;
  return iso;
}

// Normalize a header name: " Medicine Code " -> "medicine_code"
const norm = (k) => String(k).trim().toLowerCase().replace(/\s+/g, '_');

// Return the first matching column value of a row
function pick(row, names) {
  for (const n of names) if (n in row) return row[n];
  return undefined;
}

export async function POST(req) {
  await ensureJobsTable();

  // Only one job at a time (jobs older than 2 hours are treated as dead)
  const active = await query(
    `SELECT id FROM training_jobs
     WHERE status IN ('uploading', 'training') AND created_at > now() - interval '2 hours' LIMIT 1`
  );
  if (active.length) return NextResponse.json({ error: 'A training job is already running' }, { status: 409 });

  const form = await req.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
    return NextResponse.json({ error: 'Only .xlsx, .xls or .csv files' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File is larger than 10 MB' }, { status: 400 });

const actor = (await cookies()).get('role')?.value || 'unknown';

  // 1) Read the first sheet
  let raw;
  try {
    const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: 'buffer', cellDates: true });
    raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  } catch {
    return NextResponse.json({ error: 'Could not read the file' }, { status: 400 });
  }
  if (!raw.length) return NextResponse.json({ error: 'The sheet is empty' }, { status: 400 });

  // 2) Check the columns
  const rows = raw.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [norm(k), v])));
  const first = rows[0];
  const hasCode = 'code' in first || 'medicine_code' in first || 'item_code' in first;
  const hasDate = 'date' in first || 'day' in first;
  const hasQty = 'qty' in first || 'quantity' in first || 'quantity_issued' in first;
  if (!hasCode || !hasDate || !hasQty) {
    return NextResponse.json({ error: 'Missing columns. Required: code, date, qty' }, { status: 400 });
  }

  // 3) Data limits and medicine codes come from the database
  const settingRows = await query("SELECT key, value FROM app_settings WHERE key IN ('as_of', 'data_start')");
  const settings = Object.fromEntries(settingRows.map((r) => [r.key, r.value]));
  if (!settings.as_of || !settings.data_start) {
    return NextResponse.json({ error: 'app_settings is missing as_of / data_start' }, { status: 500 });
  }
  const meds = await query('SELECT id, code FROM medicines');
  const idByCode = new Map(meds.map((m) => [m.code, m.id]));

  // 4) Validate every row; collect problems instead of skipping silently
  const problems = [];
  let problemCount = 0;
  const fail = (msg) => { problemCount++; if (problems.length < MAX_PROBLEMS) problems.push(msg); };
  const unique = new Map();

  rows.forEach((r, i) => {
    const line = i + 2; // header is line 1
    const rawCode = pick(r, ['code', 'medicine_code', 'item_code']);
    const rawDay = pick(r, ['date', 'day']);
    const rawQty = pick(r, ['qty', 'quantity', 'quantity_issued']);
    if ([rawCode, rawDay, rawQty].every((v) => v === '' || v == null)) return; // blank line

    const code = String(rawCode ?? '').trim().toUpperCase();
    const id = idByCode.get(code);
    const day = toIsoDate(rawDay);
    const qty = Number(String(rawQty).replace(/,/g, ''));

    if (!id) return fail(`Line ${line}: unknown medicine code "${code}"`);
    if (!day) return fail(`Line ${line}: invalid date "${String(rawDay)}"`);
    if (day < settings.data_start || day > settings.as_of) {
      return fail(`Line ${line}: date ${day} is outside ${settings.data_start} .. ${settings.as_of}`);
    }
    if (!Number.isFinite(qty) || qty < 0) return fail(`Line ${line}: invalid qty "${String(rawQty)}"`);
    const key = `${id}|${day}`;
    if (unique.has(key)) return fail(`Line ${line}: duplicate ${code} on ${day}`);
    unique.set(key, [id, day, Math.round(qty)]);
  });

  if (problemCount) {
    return NextResponse.json(
      { error: `The file has ${problemCount} problem(s). Nothing was saved.`, problems },
      { status: 422 }
    );
  }
  const clean = [...unique.values()];
  if (!clean.length) return NextResponse.json({ error: 'No data rows found' }, { status: 400 });
  const medicineIds = [...new Set(clean.map((r) => r[0]))];

  const jobRows = await query(
    `INSERT INTO training_jobs (status, rows_imported, total, actor) VALUES ('uploading', $1, $2, $3) RETURNING id`,
    [clean.length, medicineIds.length, actor]
  );
  const jobId = jobRows[0].id;

  // 5) Save in batches (all or nothing); rows with the same medicine and day are overwritten
  try {
    await transaction(async (tx) => {
      const BATCH = 1000;
      for (let i = 0; i < clean.length; i += BATCH) {
        const chunk = clean.slice(i, i + BATCH);
        const values = [];
        const marks = chunk.map((row, j) => {
          values.push(row[0], row[1], row[2]);
          return `($${j * 3 + 1}, $${j * 3 + 2}::date, $${j * 3 + 3})`;
        });
        await tx.query(
          `INSERT INTO daily_demand (medicine_id, day, qty) VALUES ${marks.join(',')}
           ON CONFLICT (medicine_id, day) DO UPDATE SET qty = EXCLUDED.qty`,
          values
        );
      }
      for (const id of medicineIds) {
        await tx.query(
          'UPDATE medicines SET first_demand_date = (SELECT MIN(day) FROM daily_demand WHERE medicine_id = $1) WHERE id = $1',
          [id]
        );
      }
    });
  } catch (err) {
    await updateJob(jobId, { status: 'failed', error: String(err.message).slice(0, 500) });
    return NextResponse.json({ error: 'Database upload failed: ' + err.message }, { status: 500 });
  }

  // 6) Train only the imported medicines, in the background
  startTraining(jobId, { medicineIds, actor });
  return NextResponse.json({ jobId, rows: clean.length, medicines: medicineIds.length });
}