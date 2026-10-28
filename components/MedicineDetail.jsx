// Presentational component: everything about one medicine.
// Used by the drawer on the dashboard (client) and by /medicines/[code] (server) - it only uses props.
import Plot from './Plot';
import Pill from './Pill';
import { fmtInt, fmtNum, fmtDate, fmtSAR } from '@/lib/format';
import { accuracyFromMape, accuracyColor } from '@/lib/metrics';

export default function MedicineDetail({ data }) {
  const { med, byWarehouse, backtests, lots, history, forecast } = data;
  const L = med.lead_time_days;
  const hasForecast = med.model && med.lt_demand !== null;
  const errLt = hasForecast ? Number(med.rmse) * Math.sqrt(L) : null;

  const chartData = [
    { x: history.map((h) => h.day), y: history.map((h) => h.qty), type: 'scatter', mode: 'lines', name: 'Observed demand', line: { color: '#00843d', width: 2 } },
    { x: forecast.map((f) => f.day), y: forecast.map((f) => Number(f.qty)), type: 'scatter', mode: 'lines', name: `Forecast (${med.model || '—'})`, line: { color: '#c27a06', width: 2, dash: 'dot' } }
  ];

  return (
    <>
      <div className="card card-body">
        <div className="defs">
          <div><div className="k">On hand</div><div className="v">{fmtInt(med.on_hand)} {med.unit}</div></div>
          <div><div className="k">Reorder point</div><div className="v">{hasForecast ? fmtInt(med.rop) : '—'}</div></div>
          <div><div className="k">Days of coverage</div><div className="v">{med.coverage_days === null ? '—' : `${med.coverage_days} d`}</div></div>
          <div><div className="k">Projected stockout</div><div className="v">{fmtDate(med.projected_stockout)}</div></div>
          <div><div className="k">Suggested order</div><div className="v">{hasForecast ? `${fmtInt(med.suggested_order)} ${med.unit}` : '—'}</div></div>
          <div><div className="k">Unit cost</div><div className="v">{fmtSAR(med.unit_cost)}</div></div>
          <div><div className="k">Status</div><div className="v"><Pill value={med.status} /></div></div>
        </div>
        <div style={{ marginTop: 18 }}>
          <div className="k" style={{ color: 'var(--ink-2)', fontSize: 14 }}>By warehouse</div>
          {byWarehouse.length === 0 && <div>No stock in any warehouse.</div>}
          {byWarehouse.map((w) => (
            <div key={w.warehouse}><b>{w.warehouse}</b> — {w.name}, {w.city}: <b>{fmtInt(w.qty)}</b> {med.unit}</div>
          ))}
        </div>
      </div>

      <div className="info">
        <b>i&nbsp; What is ROP (Reorder Point)?</b> The stock level at which you must place a new order. A new delivery takes
        the <b>lead time</b> ({L} days here) to arrive, so the stock you hold when you order must cover the expected demand
        during those days <b>plus</b> a safety buffer for forecast errors. When <i>on hand</i> drops below the ROP, the item
        shows <b>Below ROP</b> and a purchase-order draft is proposed.
      </div>

      <div className="card">
        <div className="card-head"><div><h3>Reorder point, computed not typed</h3><p>ROP = forecast demand during lead time + z × RMSE × √L</p></div></div>
        <div className="card-body">
          {!hasForecast ? (
            <p>This medicine has only {history.length} days of demand history, below the 120-day minimum. It is shown as
              <code> insufficient_history</code> for human review — an empty forecast is never treated as zero risk.</p>
          ) : (
            <table className="calc">
              <tbody>
                <tr><td>Forecast model used</td><td>{med.model}</td></tr>
                <tr><td>Forecast demand during lead time (sum of next {L} days)</td><td>{fmtInt(med.lt_demand)} {med.unit}</td></tr>
                <tr><td>Forecast error per day (RMSE from backtest)</td><td>{fmtNum(med.rmse)}</td></tr>
                <tr><td>Error over lead time = RMSE × √{L}</td><td>{fmtNum(errLt)}</td></tr>
                <tr><td>z for {Math.round(med.service_level * 100)}% service level (chance of not running out)</td><td>{Number(med.z).toFixed(3)}</td></tr>
                <tr><td>Safety stock = z × error over lead time</td><td>{fmtInt(med.safety_stock)}</td></tr>
                <tr className="total"><td>Reorder point = demand during lead time + safety stock</td><td>{fmtInt(med.rop)} {med.unit}</td></tr>
                <tr><td>Suggested order = forecast for lead time + 30-day review period + safety − on hand</td><td>{fmtInt(med.suggested_order)} {med.unit}</td></tr>
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><div><h3>Demand history and projection</h3><p>Last 120 observed days from PostgreSQL, then the 90-day forecast from {med.model || 'no model'}.</p></div></div>
        <div className="card-body">
          <Plot data={chartData} height={300} layout={{ showlegend: true, legend: { orientation: 'h', y: 1.15 }, yaxis: { tickformat: ',.0f' } }} />
        </div>
      </div>

      <div className="card">
        <div className="card-head"><div><h3>Backtest comparison — all 9 models</h3>
          <p>Rolling origin, 3 folds, 28-day horizon, selected by lowest MAPE that beats the naive baseline, training cutoff {backtests[0]?.cutoff}.</p></div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Model</th><th className="num">MAPE</th><th className="num">RMSE</th><th className="num">MAE</th><th className="num">Accuracy %</th><th>Status</th></tr></thead>
            <tbody>
              {backtests.map((b) => (
                <tr key={b.model} style={b.is_selected ? { background: 'var(--green-50)' } : undefined}>
                  <td>{b.model}{b.is_selected && <span className="pill selected">is_selected</span>}</td>
                  <td className="num">{b.mape === null ? '—' : `${fmtNum(b.mape)}%`}</td>
                  <td className="num">{b.rmse === null ? '—' : fmtNum(b.rmse)}</td>
                  <td className="num">{b.mae === null ? '—' : fmtNum(b.mae)}</td>
                     <td  className="num" style={  b.mape === null? undefined : { color: accuracyColor(accuracyFromMape(Number(b.mape))), fontWeight: 600 } }>
                    {b.mape === null ? '—' : `${fmtNum(accuracyFromMape(Number(b.mape)))}%`}
                     </td>      

                  <td><Pill value={b.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><div><h3>Lots and expiry</h3><p>Lot-level tracking per warehouse is what makes expiry alerts and recalls possible.</p></div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Lot</th><th>Warehouse</th><th className="num">Qty</th><th>Expiry</th><th>Remaining</th></tr></thead>
            <tbody>
              {lots.map((l) => (
                <tr key={l.lot_no}>
                  <td className="mono">{l.lot_no}</td>
                  <td><span className="mono">{l.warehouse}</span><div className="med-meta" style={{ fontFamily: 'inherit' }}>{l.name}, {l.city}</div></td>
                  <td className="num">{fmtInt(l.qty)} {med.unit}</td>
                  <td>{fmtDate(l.expiry)}</td>
                  <td><span className={`pill ${l.days_left <= 30 ? 'high' : l.days_left <= 90 ? 'medium' : 'days-ok'}`}>{l.days_left} days</span></td>
                </tr>
              ))}
              {lots.length === 0 && <tr><td colSpan={5}>No lots on hand.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="info">
        <b>i</b>&nbsp; Therapeutic alternatives would appear here as suggestions in a <code>requires_pharmacist_approval</code> state.
        Automatic substitution is not implemented and must not be.
      </div>
    </>
  );
}
