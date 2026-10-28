// Background training for imported medicines.
// For each medicine: 9 models + backtest -> store results -> recompute reorder point -> refresh alerts.
import { query, transaction } from './db.js';
import { forecastItem, MODELS } from './forecast.js';
import { recompute } from './replenishment.js';
import { audit } from './audit.js';

const HORIZON = 90;
const HISTORY_WINDOW = 365 + 84 + 10; // same training window as scripts/seed.mjs
const RISK_STATUSES = ['stockout', 'below_rop', 'at_risk'];
const ALERT_TYPES_SQL = "('stockout', 'below_rop', 'at_risk', 'insufficient_history')";

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---------- Jobs table ----------

let jobsTableReady = null;

// Create the table once per server process; extra columns are added if an older table exists
export function ensureJobsTable() {
  if (!jobsTableReady) {
    jobsTableReady = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS training_jobs (
        id SERIAL PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'uploading',
        created_at TIMESTAMP NOT NULL DEFAULT now()
      )`);
      const columns = [
        'rows_imported INT NOT NULL DEFAULT 0',
        'total INT NOT NULL DEFAULT 0',
        'processed INT NOT NULL DEFAULT 0',
        'error TEXT',
        'actor TEXT',
        'summary TEXT',
        'finished_at TIMESTAMP'
      ];
      for (const col of columns) await query(`ALTER TABLE training_jobs ADD COLUMN IF NOT EXISTS ${col}`);
    })().catch((err) => { jobsTableReady = null; throw err; });
  }
  return jobsTableReady;
}

const JOB_COLUMNS = new Set(['status', 'rows_imported', 'total', 'processed', 'error', 'summary', 'actor']);

export async function updateJob(jobId, fields) {
  const keys = Object.keys(fields).filter((k) => JOB_COLUMNS.has(k));
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${k} = $${i + 1}`);
  if (fields.status === 'done' || fields.status === 'failed') sets.push('finished_at = now()');
  await query(
    `UPDATE training_jobs SET ${sets.join(', ')} WHERE id = $${keys.length + 1}`,
    [...keys.map((k) => fields[k]), jobId]
  );
}

// ---------- Database helpers ----------

// Multi-row INSERT in chunks
async function insertRows(tx, table, cols, rows, chunk = 500) {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const params = [];
    const values = part.map((r) => '(' + r.map((v) => { params.push(v); return '$' + params.length; }).join(',') + ')');
    await tx.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${values.join(',')}`, params);
  }
}

// Train the 9 models for one medicine and replace its backtest + forecast rows
async function trainMedicine(id, asOf, futureDays, futureDow) {
  const [s] = await query(
    `SELECT array_agg(qty ORDER BY day) AS y, array_agg(extract(dow FROM day)::int ORDER BY day) AS dow
     FROM daily_demand WHERE medicine_id = $1 AND day > $2`,
    [id, addDays(asOf, -HISTORY_WINDOW)]
  );
  const y = (s?.y || []).map(Number);
  const dow = (s?.dow || []).map(Number);
  const res = forecastItem(y, dow, futureDow, HORIZON);

  await transaction(async (tx) => {
    await tx.query('DELETE FROM model_backtests WHERE medicine_id = $1', [id]);
    await tx.query('DELETE FROM forecasts WHERE medicine_id = $1', [id]);
    const cols = ['medicine_id', 'model', 'mape', 'rmse', 'mae', 'status', 'is_selected', 'params', 'training_cutoff'];
    if (res.status === 'insufficient_history') {
      await insertRows(tx, 'model_backtests', cols,
        MODELS.map((m) => [id, m.name, null, null, null, 'insufficient_history', false, m.params, asOf]));
    } else {
      await insertRows(tx, 'model_backtests', cols, res.results.map((r) => [
        id, r.name, r.mape === null ? null : r.mape.toFixed(2), r.rmse?.toFixed(2) ?? null, r.mae?.toFixed(2) ?? null,
        r.status, r.key === res.selected.key, r.params, asOf]));
      await insertRows(tx, 'forecasts', ['medicine_id', 'day', 'qty'],
        res.forecast.map((q, k) => [id, futureDays[k], q.toFixed(2)]), 1000);
    }
  });
  return { trained: res.status === 'computed', model: res.selected?.name || null };
}

// Close alerts that no longer describe the medicine, then open new ones (and a PO draft) if needed
async function refreshAlerts(id, actor) {
  const [r] = await query(
    `SELECT r.status, r.on_hand, r.rop, r.coverage_days, r.suggested_order, m.unit_cost
     FROM replenishment r JOIN medicines m ON m.id = r.medicine_id WHERE r.medicine_id = $1`, [id]);
  if (!r) return null;

  await query(
    `UPDATE alerts SET status = 'resolved', handled_by = $1, handled_at = now()
     WHERE medicine_id = $2 AND status <> 'resolved' AND type IN ${ALERT_TYPES_SQL} AND type <> $3`,
    [actor, id, r.status]);

  if (RISK_STATUSES.includes(r.status)) {
    const messages = {
      stockout: 'Out of stock - projected demand cannot be served',
      below_rop: `On hand ${r.on_hand} is below reorder point ${r.rop}`,
      at_risk: `Coverage ${r.coverage_days} days - close to reorder point`
    };
    const open = await query(
      "SELECT 1 FROM alerts WHERE medicine_id = $1 AND type = $2 AND status <> 'resolved'", [id, r.status]);
    if (!open.length) {
      await query('INSERT INTO alerts (medicine_id, type, severity, message) VALUES ($1, $2, $3, $4)',
        [id, r.status, r.status === 'at_risk' ? 'medium' : 'high', messages[r.status]]);
    }
    if (r.suggested_order > 0) {
      const po = await query(
        "SELECT 1 FROM purchase_orders WHERE medicine_id = $1 AND status = 'awaiting_pharmacist'", [id]);
      if (!po.length) {
        await query('INSERT INTO purchase_orders (medicine_id, qty, est_cost, reason) VALUES ($1, $2, $3, $4)',
          [id, r.suggested_order, (r.suggested_order * Number(r.unit_cost)).toFixed(2),
           `Status ${r.status}: on hand ${r.on_hand}, ROP ${r.rop}, coverage ${r.coverage_days ?? 0} d (after Excel import)`]);
      }
    }
  }
  return r.status;
}

// ---------- Job runner ----------

async function runTraining(jobId, medicineIds, actor) {
  const [setting] = await query("SELECT value FROM app_settings WHERE key = 'as_of'");
  const asOf = setting.value;
  const futureDays = Array.from({ length: HORIZON }, (_, k) => addDays(asOf, k + 1));
  const futureDow = futureDays.map((d) => new Date(d + 'T00:00:00Z').getUTCDay());

  const ids = medicineIds.map(Number);
  const codeRows = await query(`SELECT id, code FROM medicines WHERE id IN (${ids.join(',')})`);
  const codeById = Object.fromEntries(codeRows.map((r) => [r.id, r.code]));

  await updateJob(jobId, { status: 'training', total: ids.length, processed: 0 });

  const items = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const item = { code: codeById[id], days: 0, gaps: 0, last: null, trained: false, model: null, status: null, error: null };
    try {
      const [st] = await query(
        `SELECT COUNT(*)::int AS days, (MAX(day) - MIN(day) + 1 - COUNT(*))::int AS gaps, MAX(day)::text AS last
         FROM daily_demand WHERE medicine_id = $1`, [id]);
      item.days = st.days; item.gaps = st.gaps; item.last = st.last;

      const t = await trainMedicine(id, asOf, futureDays, futureDow);
      item.trained = t.trained; item.model = t.model;
      await recompute({ query }, id);
      item.status = await refreshAlerts(id, actor);
    } catch (err) {
      item.error = String(err.message).slice(0, 200);
    }
    items.push(item);
    await updateJob(jobId, { processed: i + 1 });
    await new Promise((resolve) => setImmediate(resolve)); // let the status requests through
  }

  const summary = {
    trained: items.filter((x) => x.trained).length,
    failed: items.filter((x) => x.error).length,
    items
  };
  try {
    await audit(actor, 'import_excel', 'daily_demand',
      `Job ${jobId}: ${ids.length} medicines imported, ${summary.trained} trained, ${summary.failed} failed`);
  } catch { /* the audit log must never break the job */ }
  await updateJob(jobId, { status: 'done', summary: JSON.stringify(summary) });
}

// Fire and forget: the API route returns immediately and the browser polls the job status
export function startTraining(jobId, { medicineIds, actor = 'unknown' }) {
  runTraining(jobId, medicineIds, actor).catch((err) =>
    updateJob(jobId, { status: 'failed', error: String(err.message).slice(0, 500) }).catch(() => {})
  );
}