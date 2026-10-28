'use client';
// Client Component: the replenishment table. Clicking a row opens a drawer that fetches the
// medicine details from the Route Handler /api/medicines/[code] (JSON from PostgreSQL).
import { useState, useEffect } from 'react';
import Pill from './Pill';
import MedicineDetail from './MedicineDetail';
import { fmtInt, fmtDate, fmtNum } from '@/lib/format';
import { accuracyFromMape, accuracyColor } from '@/lib/metrics';

export default function RiskTable({ rows }) {
  const [code, setCode] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!code) return;
    setData(null);
    setError(null);
    fetch(`/api/medicines/${code}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then(setData)
      .catch((e) => setError(e.message));
  }, [code]);

  // Close the drawer with the Escape key
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setCode(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Medicine</th>
              <th>ML Model & Prediction</th>
              <th className="num">Forecast (L)</th>
              <th className="num">On hand</th>
              <th className="num" title="Reorder point = demand during lead time + safety stock">ROP ⓘ</th>
              <th className="num">Coverage</th>
              <th>Projected stockout</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const acc = r.mape !== null && r.mape !== undefined ? accuracyFromMape(Number(r.mape)) : null;
              return (
                <tr key={r.code} className="clickable" onClick={() => setCode(r.code)}>
                  <td>
                    <div className="med-name">{r.name}</div>
                    <div className="med-meta">{r.code} · {r.criticality}</div>
                  </td>
                  <td>
                    {r.model ? (
                      <div>
                        <span className="pill selected" style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6 }}>
                          {r.model}
                        </span>
                        {acc !== null && (
                          <div style={{ fontSize: 11, marginTop: 3, fontWeight: 600, color: accuracyColor(acc) }}>
                            {fmtNum(acc)}% accuracy
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>insufficient history</span>
                    )}
                  </td>
                  <td className="num">
                    {r.lt_demand !== null && r.lt_demand !== undefined ? (
                      <>
                        <strong>{fmtInt(r.lt_demand)}</strong> <span className="unit">{r.unit}</span>
                      </>
                    ) : '—'}
                  </td>
                  <td className="num">{fmtInt(r.on_hand)} <span className="unit">{r.unit}</span></td>
                  <td className="num">{r.status === 'insufficient_history' ? '—' : fmtInt(r.rop)}</td>
                  <td className="num">{r.coverage_days === null ? '—' : `${r.coverage_days} d`}</td>
                  <td>{fmtDate(r.projected_stockout)}</td>
                  <td><Pill value={r.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {code && (
        <div className="drawer-backdrop" onClick={() => setCode(null)}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="drawer-head">
              <div>
                <h2>{data?.med.name || code}</h2>
                {data && <p>{data.med.code} · {data.med.criticality} · {data.med.therapeutic_class} · lead time {data.med.lead_time_days} days · service level {Math.round(data.med.service_level * 100)}%</p>}
              </div>
              <button className="close-x" onClick={() => setCode(null)} aria-label="Close">×</button>
            </div>
            <div className="drawer-body">
              {error && <div className="notice err">Could not load: {error}</div>}
              {!data && !error && <p>Loading from PostgreSQL…</p>}
              {data && <MedicineDetail data={data} />}
              {data && <a className="btn" href={`/medicines/${data.med.code}`}>Open full page →</a>}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
