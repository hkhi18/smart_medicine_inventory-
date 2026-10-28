// Seed script: builds the whole PostgreSQL database from scratch.
//   node scripts/seed.mjs
// Steps: schema -> warehouses & 1,000 medicines -> ~1M daily demand rows (generated inside
// PostgreSQL with generate_series) -> ~250k ledger movements -> 9-model backtest per medicine
// -> 90-day forecasts -> lots with expiry -> reorder points -> alerts -> purchase-order drafts.
// All data is SYNTHETIC (realistic patterns, not real hospital records).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_PRODUCTS, WAREHOUSES, VARIANTS } from './catalog.mjs';
import { forecastItem, zFor, MODELS } from '../lib/forecast.js';
import { RECOMPUTE_SQL } from '../lib/replenishment.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const START = '2023-10-01';
const AS_OF = '2026-09-27';          // last day of demand data = training cutoff
const N_MEDICINES = 1000;
const N_NEW = 27;                    // new medicines with too little history

// ---------- Deterministic random numbers ----------
let seed = 20260927;
function rand() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
const between = (a, b) => a + rand() * (b - a);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

// ---------- Connection (one session so setseed() applies to all statements) ----------
async function connect() {
  if (process.env.DATABASE_URL) {
    const pg = await import('pg');
    const client = new pg.default.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    return {
      query: async (s, p = []) => (await client.query(s, p)).rows,
      exec: async (s) => { await client.query(s); },
      close: () => client.end(),
      mode: 'PostgreSQL server'
    };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const dir = process.env.PGLITE_DIR || path.join(ROOT, 'pgdata');
  fs.rmSync(dir, { recursive: true, force: true });
  const db = await PGlite.create(dir);
  return {
    query: async (s, p = []) => (await db.query(s, p)).rows,
    exec: async (s) => { await db.exec(s); },
    close: () => db.close(),
    mode: `embedded PostgreSQL (PGlite) in ${dir}`
  };
}

const t0 = Date.now();
const log = (msg) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s] ${msg}`);

// Insert many rows in chunks with one multi-row INSERT per chunk
async function bulkInsert(db, table, cols, rows, chunk = 500) {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const params = [];
    const values = part.map((r) => '(' + r.map((v) => { params.push(v); return '$' + params.length; }).join(',') + ')');
    await db.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${values.join(',')}`, params);
  }
}

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function buildCatalog() {
  const meds = [];
  let i = 0;
  for (const v of VARIANTS) {
    for (const [name, unit, cls, base, crit, cost] of BASE_PRODUCTS) {
      if (meds.length >= N_MEDICINES) break;
      i++;
      const share = v.suffix === '' ? 1 : between(0.15, 0.6);
      const lead = crit === 'Vital' ? Math.round(between(10, 45)) : Math.round(between(7, 30));
      const service = crit === 'Vital' ? 0.98 : crit === 'Essential' ? 0.95 : 0.9;
      meds.push({
        code: 'MED-' + String(meds.length + 1).padStart(5, '0'),
        name: name + v.suffix,
        unit,
        cls,
        crit,
        supplier: v.supplier,
        cost: Number((cost * between(0.85, 1.2) * (v.pack === '×30' ? 1 : 1)).toFixed(2)),
        lead,
        service,
        z: zFor(service),
        base: Number((base * share).toFixed(2))
      });
    }
  }
  // Shuffle codes so variants are mixed, then mark some as new medicines
  for (let k = meds.length - 1; k > 0; k--) {
    const j = Math.floor(rand() * (k + 1));
    [meds[k], meds[j]] = [meds[j], meds[k]];
  }
  meds.forEach((m, idx) => {
    m.code = 'MED-' + String(idx + 1).padStart(5, '0');
    m.first = START;
  });
  // Some items started later (shorter history), 27 are brand new (< 120 days)
  meds.slice(0, 40).forEach((m) => { m.first = addDays(START, Math.round(between(30, 700))); });
  const newIdx = new Set();
  while (newIdx.size < N_NEW) newIdx.add(Math.floor(rand() * meds.length));
  [...newIdx].forEach((k) => { meds[k].first = addDays(AS_OF, -Math.round(between(20, 110))); });
  return meds;
}

async function main() {
  const db = await connect();
  log(`Connected to ${db.mode}`);

  await db.exec(fs.readFileSync(path.join(ROOT, 'db', 'schema.sql'), 'utf8'));
  log('Schema created');

  await bulkInsert(db, 'app_settings', ['key', 'value'], [
    ['as_of', AS_OF], ['training_cutoff', AS_OF], ['data_start', START], ['seeded_at', new Date().toISOString()]
  ]);
  await bulkInsert(db, 'warehouses', ['code', 'name', 'city'], WAREHOUSES);

  const meds = buildCatalog();
  await bulkInsert(db, 'medicines',
    ['code', 'name', 'unit', 'therapeutic_class', 'criticality', 'supplier', 'unit_cost', 'lead_time_days', 'service_level', 'service_z', 'first_demand_date', 'base_demand'],
    meds.map((m) => [m.code, m.name, m.unit, m.cls, m.crit, m.supplier, m.cost, m.lead, m.service, m.z, m.first, m.base]));
  const idRows = await db.query('SELECT id, code FROM medicines');
  const idByCode = Object.fromEntries(idRows.map((r) => [r.code, r.id]));
  meds.forEach((m) => { m.id = idByCode[m.code]; });
  log(`Inserted ${meds.length} medicines and ${WAREHOUSES.length} warehouses`);

  // Which warehouses stock which medicine (with a share of the demand)
  const medWh = [];
  meds.forEach((m) => {
    const whs = m.cls === 'Oncology' || m.cls === 'Haematology'
      ? ['WH-ONC', 'WH-RUH', pick(['WH-OPD', 'WH-JED'])]
      : ['WH-RUH', ...['WH-OPD', 'WH-JED', 'WH-MED', 'WH-ONC'].filter(() => rand() < 0.45)];
    const unique = [...new Set(whs)];
    const weights = unique.map((w, i) => (i === 0 ? 2 : between(0.4, 1.4)));
    const tot = weights.reduce((a, b) => a + b, 0);
    unique.forEach((w, i) => medWh.push([m.id, w, Number((weights[i] / tot).toFixed(4))]));
  });
  await db.exec('CREATE TEMP TABLE med_wh (medicine_id INT, warehouse TEXT, share NUMERIC)');
  await bulkInsert(db, 'med_wh', ['medicine_id', 'warehouse', 'share'], medWh);

  // ---------- ~1M daily demand rows, generated inside PostgreSQL ----------
  await db.query('SELECT setseed(0.42)');
  await db.exec(`
    INSERT INTO daily_demand (medicine_id, day, qty)
    SELECT id, day, GREATEST(0, ROUND(mu + (sqrt(mu) * 0.7 + 0.07 * mu)
             * sqrt(-2 * ln(1 - random())) * cos(2 * pi() * random())))::int
    FROM (
      SELECT m.id, d::date AS day,
        m.base_demand
        * (1 + 0.07 * sin(2 * pi() * extract(doy FROM d) / 365.25 + (m.id % 7)))      -- yearly season
        * CASE extract(dow FROM d) WHEN 5 THEN 0.55 WHEN 6 THEN 0.78 ELSE 1.07 END     -- Saudi weekend
        * (1 + 0.035 * (d::date - DATE '${START}') / 365.0)                            -- slow growth
        * CASE WHEN d::date BETWEEN '2024-03-11' AND '2024-04-09'
                 OR d::date BETWEEN '2025-03-01' AND '2025-03-30'
                 OR d::date BETWEEN '2026-02-18' AND '2026-03-19' THEN 0.86            -- Ramadan
               WHEN d::date BETWEEN '2024-06-15' AND '2024-06-22'
                 OR d::date BETWEEN '2025-06-05' AND '2025-06-12'
                 OR d::date BETWEEN '2026-05-25' AND '2026-06-01' THEN 0.8             -- Eid al-Adha
               ELSE 1 END AS mu
      FROM medicines m
      CROSS JOIN generate_series(DATE '${START}', DATE '${AS_OF}', INTERVAL '1 day') AS d
      WHERE d::date >= m.first_demand_date
    ) s`);
  const [{ n: demandRows }] = await db.query('SELECT COUNT(*)::int AS n FROM daily_demand');
     log(`Generated ${demandRows.toLocaleString()} daily demand rows`);


  // ---------- Ledger: bi-weekly issues + 4-weekly receipts per medicine/warehouse ----------
  await db.exec(`
    INSERT INTO movements (ts, medicine_id, warehouse, lot_no, type, qty, actor, note)
    SELECT LEAST(DATE '${START}' + (b * 14 + 13), DATE '${AS_OF}') + TIME '18:00', d.medicine_id, w.warehouse, NULL, 'ISSUE',
           -ROUND(SUM(d.qty) * w.share)::int, 'system', 'Dispensing (14-day batch)'
    FROM (SELECT medicine_id, qty, (day - DATE '${START}') / 14 AS b FROM daily_demand) d
    JOIN med_wh w ON w.medicine_id = d.medicine_id
    GROUP BY b, d.medicine_id, w.warehouse, w.share
    HAVING ROUND(SUM(d.qty) * w.share) > 0;

    INSERT INTO movements (ts, medicine_id, warehouse, lot_no, type, qty, actor, note)
    SELECT LEAST(DATE '${START}' + (b * 28), DATE '${AS_OF}') + TIME '09:30', d.medicine_id, w.warehouse,
           'L' || lpad(d.medicine_id::text, 5, '0') || '-' || substr(w.warehouse, 4) || '-' || b,
           'RECEIPT', ROUND(SUM(d.qty) * w.share * 1.02)::int, 'storekeeper', 'Goods receipt from supplier'
    FROM (SELECT medicine_id, qty, (day - DATE '${START}') / 28 AS b FROM daily_demand) d
    JOIN med_wh w ON w.medicine_id = d.medicine_id
    GROUP BY b, d.medicine_id, w.warehouse, w.share
    HAVING ROUND(SUM(d.qty) * w.share) > 0;`);
  const [{ n: movRows }] = await db.query('SELECT COUNT(*)::int AS n FROM movements');
  log(`Generated ${movRows.toLocaleString()} ledger movements`);



  // ---------- Forecasting: 9 models x 3 backtest folds per medicine ----------
  const histStart = addDays(AS_OF, -(365 + 84 + 10));
  const series = await db.query(
    `SELECT medicine_id, array_agg(qty ORDER BY day) AS y, array_agg(extract(dow FROM day)::int ORDER BY day) AS dow
     FROM daily_demand WHERE day > $1 GROUP BY medicine_id`, [histStart]);
  const byId = Object.fromEntries(series.map((s) => [s.medicine_id, s]));
  const futureDays = Array.from({ length: 90 }, (_, k) => addDays(AS_OF, k + 1));
  const futureDow = futureDays.map((d) => new Date(d + 'T00:00:00Z').getUTCDay());

  const backtestRows = [];
  const forecastRows = [];
  const plan = {};   // per medicine data needed for stock planning
  let done = 0;
  for (const m of meds) {
    const s = byId[m.id] || { y: [], dow: [] };
    const y = s.y.map(Number);
    const res = forecastItem(y, s.dow.map(Number), futureDow);
    if (res.status === 'insufficient_history') {
      MODELS.forEach((md) => backtestRows.push([m.id, md.name, null, null, null, 'insufficient_history', false, md.params, AS_OF]));
      plan[m.id] = { avg: y.length ? y.reduce((a, b) => a + b, 0) / y.length : m.base };
    } else {
      res.results.forEach((r) => backtestRows.push([
        m.id, r.name, r.mape === null ? null : r.mape.toFixed(2), r.rmse?.toFixed(2) ?? null, r.mae?.toFixed(2) ?? null,
        r.status, r.key === res.selected.key, r.params, AS_OF]));
      res.forecast.forEach((q, k) => forecastRows.push([m.id, futureDays[k], q.toFixed(2)]));
      const lt = res.forecast.slice(0, m.lead).reduce((a, b) => a + b, 0);
      const rop = lt + m.z * res.selected.rmse * Math.sqrt(m.lead);
      plan[m.id] = { rop, avg: res.forecast.reduce((a, b) => a + b, 0) / 90, d14: res.forecast.slice(0, 14).reduce((a, b) => a + b, 0) };
    }
    if (++done % 100 === 0) log(`Forecast models trained for ${done}/${meds.length} medicines`);
  }
  await bulkInsert(db, 'model_backtests',
    ['medicine_id', 'model', 'mape', 'rmse', 'mae', 'status', 'is_selected', 'params', 'training_cutoff'], backtestRows);
  await bulkInsert(db, 'forecasts', ['medicine_id', 'day', 'qty'], forecastRows, 1000);
  log(`Stored ${backtestRows.length.toLocaleString()} backtest scores and ${forecastRows.length.toLocaleString()} forecast days`);

  // ---------- Current stock in lots (on-hand mix gives a realistic status distribution) ----------
  const lots = [];
  const whByMed = {};
  medWh.forEach(([id, w, share]) => { (whByMed[id] = whByMed[id] || []).push([w, share]); });
  let stockouts = 0;
  meds.forEach((m) => {
    const p = plan[m.id];
    const r = rand();
    let onHand;
    if (!p.rop) onHand = Math.round(p.avg * between(10, 60));
    else if (r < 0.003 || (stockouts < 3 && m.crit === 'Vital' && r < 0.01)) { onHand = 0; stockouts++; }
    else if (r < 0.21) onHand = Math.round(p.rop * between(0.25, 0.97));
    else if (r < 0.30) onHand = Math.round(p.rop + p.d14 * between(0.05, 0.95));
    else onHand = Math.round(p.rop + p.d14 + p.avg * between(10, 120));
    if (onHand <= 0) return;
    whByMed[m.id].forEach(([w, share], wi) => {
      const whQty = Math.round(onHand * share);
      if (whQty <= 0) return;
      const nLots = rand() < 0.35 ? 2 : 1;
      for (let k = 0; k < nLots; k++) {
        const qty = nLots === 2 ? (k === 0 ? Math.round(whQty * 0.4) : whQty - Math.round(whQty * 0.4)) : whQty;
        const roll = rand();
        const days = roll < 0.013 ? between(3, 90) : roll < 0.13 ? between(91, 180) : between(181, 820);
        lots.push([`L${String(m.id).padStart(5, '0')}-${w.slice(3)}-${100 + wi * 10 + k + Math.floor(rand() * 60)}${k}`,
          m.id, w, qty, addDays(AS_OF, Math.round(days))]);
      }
    });
  });
  await bulkInsert(db, 'lots', ['lot_no', 'medicine_id', 'warehouse', 'qty', 'expiry_date'], lots);
  log(`Inserted ${lots.length.toLocaleString()} lots with expiry dates`);

  // ---------- Reorder points, coverage, status ----------
  await db.query(RECOMPUTE_SQL, [null]);
  const statusCounts = await db.query('SELECT status, COUNT(*)::int AS n FROM replenishment GROUP BY status ORDER BY n DESC');
  log('Replenishment status: ' + statusCounts.map((s) => `${s.status}=${s.n}`).join(', '));

  // ---------- Alerts ----------
  await db.exec(`
    INSERT INTO alerts (medicine_id, type, severity, message, created_at)
    SELECT r.medicine_id, r.status,
           CASE r.status WHEN 'stockout' THEN 'high' WHEN 'below_rop' THEN 'high' WHEN 'at_risk' THEN 'medium' ELSE 'low' END,
           CASE r.status
             WHEN 'stockout' THEN 'Out of stock - projected demand cannot be served'
             WHEN 'below_rop' THEN 'On hand ' || r.on_hand || ' is below reorder point ' || r.rop
             WHEN 'at_risk' THEN 'Coverage ' || r.coverage_days || ' days - close to reorder point'
             ELSE 'Not enough demand history for a forecast - review manually' END,
           TIMESTAMP '${AS_OF} 06:00' + (random() * INTERVAL '20 hours')
    FROM replenishment r WHERE r.status <> 'ok';

    INSERT INTO alerts (medicine_id, type, severity, message, created_at)
    SELECT l.medicine_id, 'expiry', CASE WHEN l.expiry_date - DATE '${AS_OF}' <= 30 THEN 'high' ELSE 'medium' END,
           'Lot ' || l.lot_no || ' (' || l.qty || ' units, ' || l.warehouse || ') expires on ' || l.expiry_date,
           TIMESTAMP '${AS_OF} 05:00'
    FROM lots l WHERE l.expiry_date <= DATE '${AS_OF}' + 90;

    INSERT INTO purchase_orders (medicine_id, qty, est_cost, reason, created_at)
    SELECT r.medicine_id, r.suggested_order, ROUND(r.suggested_order * m.unit_cost, 2),
           'Status ' || r.status || ': on hand ' || r.on_hand || ', ROP ' || r.rop || ', coverage ' || COALESCE(r.coverage_days, 0) || ' d',
           TIMESTAMP '${AS_OF} 07:00'
    FROM replenishment r JOIN medicines m ON m.id = r.medicine_id
    WHERE r.status IN ('stockout', 'below_rop', 'at_risk') AND r.suggested_order > 0;

    INSERT INTO audit_log (ts, actor, action, entity, details) VALUES
      (TIMESTAMP '${AS_OF} 02:00', 'system', 'seed', 'database', 'Synthetic dataset generated'),
      (TIMESTAMP '${AS_OF} 03:00', 'system', 'forecast_run', 'model_backtests', '9 models, 3 folds, 28-day horizon, cutoff ${AS_OF}'),
      (TIMESTAMP '${AS_OF} 07:00', 'system', 'replenishment', 'purchase_orders', 'Purchase-order drafts proposed for pharmacist approval');

    CREATE INDEX idx_alerts_status ON alerts(status, created_at DESC);
    CREATE INDEX idx_po_status ON purchase_orders(status);
    ANALYZE;`);
  const [{ n: nAlerts }] = await db.query("SELECT COUNT(*)::int AS n FROM alerts WHERE status = 'open'");
  const [{ n: nPo }] = await db.query("SELECT COUNT(*)::int AS n FROM purchase_orders");
  log(`Created ${nAlerts} open alerts and ${nPo} purchase-order drafts`);

  await db.close();
  log('Done. Start the website with: npm run dev   (or node server.js in the offline build)');
}

main().catch((err) => { console.error(err); process.exit(1); });
