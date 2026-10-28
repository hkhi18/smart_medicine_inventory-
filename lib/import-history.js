// Parses and validates an uploaded demand-history file (xlsx or csv).
// Pure functions: no database access, so the same code can run in the API route and in tests.
import * as XLSX from 'xlsx';

export const MIN_DAYS = 120;

const ALIASES = {
  code: ['medicine_code', 'code', 'med_code', 'item_code'],
  day: ['date', 'day'],
  qty: ['quantity_issued', 'qty', 'quantity']
};

// Read an uploaded file (Buffer) into an array of raw row objects
export function parseUpload(buffer, fileName) {
  const isCsv = fileName.toLowerCase().endsWith('.csv');
  const wb = isCsv
    ? XLSX.read(buffer.toString('utf8').replace(/^\uFEFF/, ''), { type: 'string', cellDates: true })
    : XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
}

// Convert a cell value (Date, Excel serial number or text) to YYYY-MM-DD, or null if invalid
export function toIsoDay(v) {
  let iso = null;
  if (v instanceof Date) {
    // +12h avoids timezone shifts around midnight
    iso = new Date(v.getTime() + 12 * 3600 * 1000).toISOString().slice(0, 10);
  } else if (typeof v === 'number' && v > 20000) {
    iso = new Date(Math.round((v - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  } else {
    const s = String(v ?? '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) iso = s;
  }
  if (!iso) return null;
  return new Date(iso + 'T00:00:00Z').toISOString().slice(0, 10) === iso ? iso : null;
}

// Pick a column value from a row using the accepted header names
function pickField(row, names) {
  for (const key of Object.keys(row)) {
    if (names.includes(key.trim().toLowerCase())) return row[key];
  }
  return undefined;
}

// Validate raw rows. Returns { rows, errors } instead of throwing so the UI can show the problems.
export function validateRows(rawRows, idByCode, start, asOf) {
  const errors = [];
  const seen = new Set();
  const rows = [];
  if (!rawRows.length) errors.push('The file has no data rows');

  rawRows.forEach((row, i) => {
    const line = i + 2; // header is line 1
    const rawQty = pickField(row, ALIASES.qty);
    const code = String(pickField(row, ALIASES.code) ?? '').trim().toUpperCase();
    const day = toIsoDay(pickField(row, ALIASES.day));
    const qty = Number(rawQty);

    if (!code && !day && rawQty == null) return; // empty line
    if (!idByCode[code]) return errors.push(`Line ${line}: unknown medicine code "${code}"`);
    if (!day) return errors.push(`Line ${line}: invalid date`);
    if (day < start || day > asOf) return errors.push(`Line ${line}: date ${day} outside ${start}..${asOf}`);
    if (!Number.isFinite(qty) || qty < 0) return errors.push(`Line ${line}: invalid quantity`);

    const key = code + '|' + day;
    if (seen.has(key)) return errors.push(`Line ${line}: duplicate ${code} on ${day}`);
    seen.add(key);
    rows.push({ id: idByCode[code], code, day, qty: Math.round(qty) });
  });

  return { rows, errors };
}

// Per-medicine summary: day count, date range, missing days, and whether it can be trained
export function summarize(rows) {
  const byCode = new Map();
  for (const r of rows) {
    if (!byCode.has(r.code)) byCode.set(r.code, { code: r.code, id: r.id, days: [] });
    byCode.get(r.code).days.push(r.day);
  }
  return [...byCode.values()].map(({ code, id, days }) => {
    const sorted = [...days].sort();
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const span = (new Date(last) - new Date(first)) / 86400000 + 1;
    return {
      code, id, first, last,
      days: sorted.length,
      gaps: span - sorted.length,
      canTrain: sorted.length >= MIN_DAYS
    };
  });
}