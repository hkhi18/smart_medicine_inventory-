'use client';
// Client Component: turns the aggregated rows (from PostgreSQL, passed as props) into Plotly charts.
import Plot from './Plot';

const GREEN = '#00843d';
const DARK = '#005c2c';
const STATUS_COLORS = { ok: '#00943f', below_rop: '#e11d23', at_risk: '#c87500', insufficient_history: '#8d9a93', stockout: '#b91c1c' };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EXPIRY_ORDER = ['≤ 30 d', '31–60 d', '61–90 d', '91–180 d', '> 180 d'];
const EXPIRY_COLORS = ['#dc2626', '#dc2626', '#d4a017', GREEN, GREEN];
const short = (s, n = 32) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function Card({ title, sub, children }) {
  return (
    <div className="card">
      <div className="card-head"><div><h3>{title}</h3><p>{sub}</p></div></div>
      <div className="card-body">{children}</div>
    </div>
  );
}

export default function AnalyticsCharts({ d }) {
  const byClass = [...d.byClass].reverse();
  const top = [...d.top10].reverse();
  const statusOrder = ['ok', 'below_rop', 'at_risk', 'insufficient_history', 'stockout'];
  const statusMap = Object.fromEntries(d.statuses.map((s) => [s.status, s.n]));
  const expMap = Object.fromEntries(d.expiry.map((e) => [e.bucket, e.n]));

  return (
    <div className="grid-2">
      <Card title="Monthly demand" sub="Total units issued per full month, all medicines">
        <Plot data={[{ x: d.monthly.map((m) => m.month), y: d.monthly.map((m) => m.qty), type: 'scatter', mode: 'lines', line: { color: GREEN, width: 2.5, shape: 'spline' } }]} height={420} />
      </Card>
      <Card title="Demand by therapeutic class" sub="Last 90 days">
        <Plot data={[{ y: byClass.map((c) => c.cls), x: byClass.map((c) => c.qty), type: 'bar', orientation: 'h', marker: { color: DARK } }]}
          layout={{ margin: { l: 130, r: 16, t: 10, b: 40 }, yaxis: { tickformat: '' }, xaxis: { tickformat: ',d' } }} height={420} />
      </Card>
      <Card title="Top 10 medicines" sub="Units issued, last 90 days">
        <Plot data={[{ y: top.map((t) => `${short(t.name, 30)} · ${t.code.slice(4)}`), x: top.map((t) => t.qty), type: 'bar', orientation: 'h', marker: { color: '#0aa04f' }, hovertext: top.map((t) => `${t.code} · ${t.name}`) }]}
          layout={{ margin: { l: 260, r: 16, t: 10, b: 40 }, yaxis: { tickformat: '' }, xaxis: { tickformat: ',d' } }} />
      </Card>
      <Card title="Stock status" sub="Number of medicines per status">
        <Plot data={[{ x: statusOrder, y: statusOrder.map((s) => statusMap[s] || 0), type: 'bar', marker: { color: statusOrder.map((s) => STATUS_COLORS[s]) } }]} />
      </Card>
      <Card title="Stock value by warehouse" sub="On-hand quantity × unit cost (SAR)">
        <Plot data={[{ x: d.valueByWh.map((w) => `${w.code}<br>${w.city}`), y: d.valueByWh.map((w) => w.value), type: 'bar', marker: { color: DARK } }]} />
      </Card>
      <Card title="Lots by time to expiry" sub="Number of lots in each window">
        <Plot data={[{ x: EXPIRY_ORDER, y: EXPIRY_ORDER.map((b) => expMap[b] || 0), type: 'bar', marker: { color: EXPIRY_COLORS } }]} />
      </Card>
      <Card title="Average demand by weekday" sub="Last 365 days — Friday and Saturday are the Saudi weekend">
        <Plot data={[{ x: d.weekday.map((w) => DOW[w.dow]), y: d.weekday.map((w) => w.avg_qty), type: 'bar', marker: { color: d.weekday.map((w) => (w.dow === 5 || w.dow === 6 ? '#c87500' : GREEN)) } }]} />
      </Card>
    </div>
  );
}
