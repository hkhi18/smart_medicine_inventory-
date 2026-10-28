'use client';
// Client Component: draws a Plotly chart in the browser.
// Plotly is imported dynamically so it only loads on pages that show a chart.
import { useEffect, useRef } from 'react';

const BASE_LAYOUT = {
  margin: { t: 16, r: 16, b: 48, l: 64 },
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  font: { family: 'Poppins, Segoe UI, sans-serif', size: 12, color: '#4b5651' },
  xaxis: { gridcolor: '#e9eeeb', zeroline: false },
  yaxis: { gridcolor: '#e9eeeb', zeroline: false, separatethousands: true, tickformat: ',d' },
  showlegend: false
};

export default function Plot({ data, layout = {}, height = 340 }) {
  const ref = useRef(null);
  useEffect(() => {
    let cancelled = false;
    let plotly;
    import('plotly.js-dist-min').then((mod) => {
      if (cancelled || !ref.current) return;
      plotly = mod.default || mod;
      const merged = {
        ...BASE_LAYOUT,
        ...layout,
        xaxis: { ...BASE_LAYOUT.xaxis, ...(layout.xaxis || {}) },
        yaxis: { ...BASE_LAYOUT.yaxis, ...(layout.yaxis || {}) },
        height
      };
      plotly.newPlot(ref.current, data, merged, { responsive: true, displayModeBar: false });
    });
    return () => {
      cancelled = true;
      if (plotly && ref.current) plotly.purge(ref.current);
    };
  }, [data, layout, height]);
  return <div ref={ref} className="chart" style={{ minHeight: height }} />;
}
