// Runs the forecasting pipeline for every medicine and saves results.
// Progress is stored in the training_jobs table so the UI can show a progress bar.
import { query, transaction } from './db';
import { forecastItem, MODELS, TRAIN_WINDOW, FOLDS, HORIZON } from './forecast';
import { RECOMPUTE_SQL } from './replenishment';

const FUTURE_DAYS = 90;
const WINDOW_DAYS = TRAIN_WINDOW + FOLDS * HORIZON; // days of history the backtest needs

// ---------- Job table ----------

export async function ensureJobsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS training_jobs (
      id            SERIAL PRIMARY KEY,
      status        TEXT NOT NULL DEFAULT 'uploading',
      total         INT  NOT NULL DEFAULT 0,
      processed     INT  NOT NULL DEFAULT 0,
      rows_imported INT  NOT NULL DEFAULT 0,
      error         TEXT,
      created_at    TIMESTAMP NOT NULL DEFAULT now(),
      finished_at   TIMESTAMP
    )`);
}

export async function updateJob(id, fields) {
  const keys = Object.keys(fields);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await query(`UPDATE training_jobs SET ${sets} WHERE id = $1`, [id, ...keys.map((k) => fields[k])]);
}

// ---------- Date helpers (all in UTC, ISO strings YYYY-MM-DD) ----------

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dowOf(iso) {
  return new Date(iso + 'T00:00:00Z').getUTCDay(); // 0 = Sunday
}

// Build a continuous daily series (days without a row count as zero demand)
function buildSeries(rows, asOf) {
  const byDay = new Map(rows.map((r) => [r.day, Number(r.qty)]));
  const y = [];
  const dow = [];
  for (let d = rows[0].day; d <= asOf; d = addDays(d, 1)) {
    y.push(byDay.get(d) ?? 0);
    dow.push(dowOf(d));
  }
  return { y, dow };
}

const round2 = (v) =>
  v === null || v === undefined || !Number.isFinite(v) ? null : Math.min(Math.round(v * 100) / 100, 999999);

// ---------- One medicine ----------

async function trainOne(id, rows, asOf, futureDates, futureDow) {
  let result = { status: 'insufficient_history', results: [], selected: null, forecast: [] };
  if (rows.length) {
    const { y, dow } = buildSeries(rows, asOf);
    result = forecastItem(y, dow, futureDow, FUTURE_DAYS);
  }

  await transaction(async (tx) => {
    await tx.query('DELETE FROM model_backtests WHERE medicine_id = $1', [id]);
    await tx.query('DELETE FROM forecasts WHERE medicine_id = $1', [id]);

    const insertScore = `INSERT INTO model_backtests
      (medicine_id, model, mape, rmse, mae, status, is_selected, params, training_cutoff)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`;

    if (result.status === 'insufficient_history') {
      for (const m of MODELS) {
        await tx.query(insertScore, [id, m.name, null, null, null, 'insufficient_history', false, m.params, asOf]);
      }
      return;
    }

    for (const r of result.results) {
      await tx.query(insertScore, [
        id, r.name, round2(r.mape), round2(r.rmse), round2(r.mae),
        r.status, r.key === result.selected.key, r.params, asOf
      ]);
    }

    // 90-day forecast of the selected model in one multi-row insert
    const values = [];
    const marks = result.forecast.map((v, i) => {
      values.push(id, futureDates[i], round2(v) ?? 0);
      return `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`;
    });
    await tx.query(`INSERT INTO forecasts (medicine_id, day, qty) VALUES ${marks.join(',')}`, values);
  });
}

// ---------- Whole run ----------

async function runTraining(jobId) {
  const asOfRow = (await query(`SELECT to_char(MAX(day), 'YYYY-MM-DD') AS d FROM daily_demand`))[0];
  const asOf = asOfRow && asOfRow.d;
  if (!asOf) throw new Error('daily_demand is empty');

  const meds = await query('SELECT id FROM medicines ORDER BY id');
  await updateJob(jobId, { status: 'training', total: meds.length, processed: 0 });

  const futureDates = Array.from({ length: FUTURE_DAYS }, (_, i) => addDays(asOf, i + 1));
  const futureDow = futureDates.map(dowOf);

  for (let i = 0; i < meds.length; i++) {
    const id = meds[i].id;
    const rows = await query(
      `SELECT to_char(day, 'YYYY-MM-DD') AS day, qty
       FROM daily_demand
       WHERE medicine_id = $1 AND day > $2::date - ${WINDOW_DAYS}
       ORDER BY day`,
      [id, asOf]
    );
    await trainOne(id, rows, asOf, futureDates, futureDow);

    if ((i + 1) % 5 === 0 || i === meds.length - 1) await updateJob(jobId, { processed: i + 1 });
    // Let the server answer status requests between medicines
    await new Promise((r) => setTimeout(r, 0));
  }

  // Move the "as of" date to the newest imported day, then recompute safety stock,
  // reorder points, coverage and status for every medicine from the new forecasts
  await query(
    `INSERT INTO app_settings (key, value) VALUES ('as_of', $1), ('training_cutoff', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [asOf]
  );
  await query(RECOMPUTE_SQL, [null]);

  await query(`UPDATE training_jobs SET status = 'done', finished_at = now() WHERE id = $1`, [jobId]);
}

// Fire and forget: the API route returns immediately, training continues in the background
export function startTraining(jobId) {
  runTraining(jobId).catch(async (err) => {
    try {
      await updateJob(jobId, { status: 'failed', error: String(err.message || err).slice(0, 500) });
    } catch {}
  });
}
