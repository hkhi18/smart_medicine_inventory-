// Saves imported demand rows, trains the 9 models per medicine and refreshes replenishment.
// Progress is reported through the onProgress callback (the API route streams it to the browser).
import { query, transaction } from './db.js';
import { forecastItem, MODELS } from './forecast.js';
import { recompute } from './replenishment.js';
import { audit } from './audit.js';

const HISTORY_WINDOW = 365 + 84 + 10; // same training window as scripts/seed.mjs
const HORIZON = 90;

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Multi-row INSERT in chunks. `suffix` is appended after VALUES (e.g. ON CONFLICT ...)
async function insertRows(tx, table, cols, rows, suffix = '', chunk = 500) {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const params = [];
    const values = part.map((r) => '(' + r.map((v) => { params.push(v); return '$' + params.length; }).join(',') + ')');
    await tx.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${values.join(',')} ${suffix}`, params);
  }
}

// Step 1: save the uploaded demand (existing days with the same date are overwritten)
async function saveDemand(rows, medicineIds) {
  await transaction(async (tx) => {
    await insertRows(
      tx, 'daily_demand', ['medicine_id', 'day', 'qty'],
      rows.map((r) => [r.id, r.day, r.qty]),
      'ON CONFLICT (medicine_id, day) DO UPDATE SET qty = EXCLUDED.qty', 1000
    );
    for (const id of medicineIds) {
      await tx.query(
        'UPDATE medicines SET first_demand_date = (SELECT MIN(day) FROM daily_demand WHERE medicine_id = $1) WHERE id = $1',
        [id]
      );
    }
  });
}

// Step 2: run the 9 models + backtest for one medicine and store the results
async function trainMedicine(id, asOf, futureDays, futureDow) {
  const histStart = addDays(asOf, -HISTORY_WINDOW);
  const [s] = await query(
    `SELECT array_agg(qty ORDER BY day) AS y, array_agg(extract(dow FROM day)::int ORDER BY day) AS dow
     FROM daily_demand WHERE medicine_id = $1 AND day > $2`, [id, histStart]);
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
        res.forecast.map((q, k) => [id, futureDays[k], q.toFixed(2)]));
    }
  });
  return { trained: res.status === 'computed', model: res.selected?.name || null };
}

// Step 3: close the old "insufficient_history" alert and open new alerts / PO draft if needed
async function refreshAlerts(id, actor) {
  await query(
    `UPDATE alerts SET status = 'resolved', handled_by = $1, handled_at = now()
     WHERE medicine_id = $2 AND type = 'insufficient_history' AND status <> 'resolved'`, [actor, id]);
  const [r] = await query(
    `SELECT r.*, m.unit_cost FROM replenishment r JOIN medicines m ON m.id = r.medicine_id
     WHERE r.medicine_id = $1`, [id]);
  if (!r) return null;

  if (['stockout', 'below_rop', 'at_risk'].includes(r.status)) {
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

// Main entry: rows = validated rows, summary = per-medicine summary (from lib/import-history.js)
export async function runImport({ rows, summary, asOf, actor, onProgress }) {
  const futureDays = Array.from({ length: HORIZON }, (_, k) => addDays(asOf, k + 1));
  const futureDow = futureDays.map((d) => new Date(d + 'T00:00:00Z').getUTCDay());

  onProgress({ type: 'saving', rows: rows.length });
  await saveDemand(rows, summary.map((s) => s.id));

  const results = [];
  for (let i = 0; i < summary.length; i++) {
    const med = summary[i];
    onProgress({ type: 'training', done: i, total: summary.length, code: med.code });
    try {
      const t = await trainMedicine(med.id, asOf, futureDays, futureDow);
      await recompute({ query }, med.id);
      const status = await refreshAlerts(med.id, actor);
      results.push({ code: med.code, days: med.days, gaps: med.gaps, trained: t.trained, model: t.model, status, error: null });
    } catch (err) {
      results.push({ code: med.code, days: med.days, gaps: med.gaps, trained: false, model: null, status: null, error: err.message });
    }
    onProgress({ type: 'training', done: i + 1, total: summary.length, code: med.code });
  }

  const trainedCount = results.filter((r) => r.trained).length;
  await audit(actor, 'import_excel', 'daily_demand',
    `Imported ${rows.length} rows for ${summary.length} medicines; ${trainedCount} trained, ${results.filter((r) => r.error).length} failed`);
  return results;
}