// Generates a visual data analysis card (PNG) for items below ROP to send via WhatsApp.
import sharp from 'sharp';
import { query } from '@/lib/db';
import { fmtInt, fmtDate } from '@/lib/format';
import { accuracyFromMape } from '@/lib/metrics';

function xmlEscape(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function generateRopAnalysisPng() {
  const [totalCountRow, rows] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total FROM replenishment WHERE status = 'below_rop'`),
    query(`
      SELECT m.code, m.name, m.criticality, m.unit, r.on_hand, r.rop, r.coverage_days,
             to_char(r.projected_stockout, 'YYYY-MM-DD') AS stockout,
             r.model, b.mape
      FROM replenishment r
      JOIN medicines m ON m.id = r.medicine_id
      LEFT JOIN model_backtests b ON b.medicine_id = r.medicine_id AND b.is_selected = true
      WHERE r.status = 'below_rop'
      ORDER BY r.coverage_days ASC, m.code ASC
      LIMIT 6
    `)
  ]);

  const totalBelowRop = totalCountRow[0]?.total || rows.length;
  const vitalCount = rows.filter((r) => r.criticality === 'Vital').length;

  const width = 1000;
  const height = 760;

  let itemsSvg = '';
  const startY = 220;
  const rowHeight = 78;

  rows.forEach((r, idx) => {
    const y = startY + idx * rowHeight;
    const maxVal = Math.max(r.rop * 1.15, r.on_hand * 1.2, 1);
    const barMaxWidth = 340;
    const onHandWidth = Math.max(8, Math.min(barMaxWidth, Math.round((r.on_hand / maxVal) * barMaxWidth)));
    const ropX = 390 + Math.min(barMaxWidth, Math.round((r.rop / maxVal) * barMaxWidth));

    const critColor = r.criticality === 'Vital' ? '#ef4444' : r.criticality === 'Essential' ? '#f59e0b' : '#3b82f6';
    const acc = r.mape !== null && r.mape !== undefined ? `${Math.round(accuracyFromMape(Number(r.mape)))}%` : '—';
    const modelLabel = r.model ? r.model.slice(0, 18) : 'ML Model';
    const isEven = idx % 2 === 0;

    itemsSvg += `
      <!-- Row ${idx + 1} -->
      <g transform="translate(40, ${y})">
        <rect width="920" height="68" rx="8" fill="${isEven ? '#1e293b' : '#0f172a'}" stroke="#334155" stroke-width="1"/>
        
        <!-- Medicine Details -->
        <text x="20" y="26" fill="#f8fafc" font-size="14" font-weight="bold" font-family="system-ui, sans-serif">
          ${xmlEscape(r.name.length > 38 ? r.name.slice(0, 38) + '…' : r.name)}
        </text>
        <text x="20" y="48" fill="#94a3b8" font-size="12" font-family="system-ui, sans-serif">
          ${xmlEscape(r.code)} · <tspan fill="${critColor}">● ${xmlEscape(r.criticality)}</tspan> · ML: ${xmlEscape(modelLabel)} (${acc} Acc)
        </text>

        <!-- Stock vs ROP Bar Chart -->
        <g transform="translate(390, 14)">
          <rect width="${barMaxWidth}" height="20" rx="4" fill="#334155"/>
          <rect width="${onHandWidth}" height="20" rx="4" fill="#22c55e"/>
          <!-- ROP line -->
          <line x1="${ropX - 390}" y1="-4" x2="${ropX - 390}" y2="24" stroke="#f59e0b" stroke-width="2.5" stroke-dasharray="3,2"/>
          <text x="${ropX - 390 + 4}" y="15" fill="#f59e0b" font-size="10" font-weight="bold" font-family="system-ui, sans-serif">ROP ${fmtInt(r.rop)}</text>
          <text x="10" y="15" fill="#ffffff" font-size="11" font-weight="bold" font-family="system-ui, sans-serif">On hand: ${fmtInt(r.on_hand)} ${xmlEscape(r.unit)}</text>
        </g>

        <!-- Coverage & Stockout Tag -->
        <g transform="translate(760, 15)">
          <rect width="140" height="38" rx="6" fill="#450a0a" stroke="#dc2626" stroke-width="1"/>
          <text x="70" y="17" fill="#fca5a5" font-size="11" font-weight="bold" text-anchor="middle" font-family="system-ui, sans-serif">
            ${r.coverage_days} Days Coverage
          </text>
          <text x="70" y="32" fill="#f87171" font-size="10" text-anchor="middle" font-family="system-ui, sans-serif">
            Stockout: ${fmtDate(r.stockout)}
          </text>
        </g>
      </g>
    `;
  });

  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="headerGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#04401f"/>
          <stop offset="100%" stop-color="#0a5c2f"/>
        </linearGradient>
      </defs>

      <!-- Background -->
      <rect width="${width}" height="${height}" fill="#0b1120"/>

      <!-- Header Banner -->
      <rect width="${width}" height="100" fill="url(#headerGrad)"/>
      <circle cx="58" cy="50" r="26" fill="#ffffff" opacity="0.12"/>
      <text x="58" y="58" fill="#ffffff" font-size="24" font-weight="bold" text-anchor="middle" font-family="system-ui, sans-serif">⚕</text>

      <text x="100" y="42" fill="#ffffff" font-size="22" font-weight="bold" font-family="system-ui, sans-serif">
        Smart Medicine Inventory · Replenishment Analysis
      </text>
      <text x="100" y="68" fill="#a7f3d0" font-size="14" font-family="system-ui, sans-serif">
        Urgent Action Required: Medicines Below Reorder Point (ROP) &amp; Stockout Risk
      </text>
      <text x="960" y="45" fill="#f5c518" font-size="13" font-weight="bold" text-anchor="end" font-family="system-ui, sans-serif">
        LIVE PREDICTION
      </text>
      <text x="960" y="66" fill="#cbd5e1" font-size="11" text-anchor="end" font-family="system-ui, sans-serif">
        As of: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
      </text>

      <!-- KPI Summary Cards -->
      <g transform="translate(40, 118)">
        <!-- KPI 1 -->
        <rect width="210" height="78" rx="8" fill="#1e293b" stroke="#334155" stroke-width="1"/>
        <text x="18" y="26" fill="#94a3b8" font-size="12" font-weight="500" font-family="system-ui, sans-serif">TOTAL BELOW ROP</text>
        <text x="18" y="58" fill="#ef4444" font-size="28" font-weight="bold" font-family="system-ui, sans-serif">${totalBelowRop}</text>
        <text x="80" y="56" fill="#cbd5e1" font-size="12" font-family="system-ui, sans-serif">items affected</text>

        <!-- KPI 2 -->
        <g transform="translate(230, 0)">
          <rect width="210" height="78" rx="8" fill="#1e293b" stroke="#334155" stroke-width="1"/>
          <text x="18" y="26" fill="#94a3b8" font-size="12" font-weight="500" font-family="system-ui, sans-serif">MOST CRITICAL</text>
          <text x="18" y="58" fill="#f59e0b" font-size="28" font-weight="bold" font-family="system-ui, sans-serif">${vitalCount}</text>
          <text x="60" y="56" fill="#cbd5e1" font-size="12" font-family="system-ui, sans-serif">Vital priority in top list</text>
        </g>

        <!-- KPI 3 -->
        <g transform="translate(460, 0)">
          <rect width="220" height="78" rx="8" fill="#1e293b" stroke="#334155" stroke-width="1"/>
          <text x="18" y="26" fill="#94a3b8" font-size="12" font-weight="500" font-family="system-ui, sans-serif">MINIMUM COVERAGE</text>
          <text x="18" y="58" fill="#38bdf8" font-size="28" font-weight="bold" font-family="system-ui, sans-serif">${rows[0]?.coverage_days || 0} d</text>
          <text x="75" y="56" fill="#cbd5e1" font-size="12" font-family="system-ui, sans-serif">critical lead time buffer</text>
        </g>

        <!-- KPI 4 -->
        <g transform="translate(700, 0)">
          <rect width="220" height="78" rx="8" fill="#1e293b" stroke="#334155" stroke-width="1"/>
          <text x="18" y="26" fill="#94a3b8" font-size="12" font-weight="500" font-family="system-ui, sans-serif">ML ENGINES USED</text>
          <text x="18" y="55" fill="#a7f3d0" font-size="17" font-weight="bold" font-family="system-ui, sans-serif">ARIMA · HW · RF</text>
          <text x="18" y="70" fill="#64748b" font-size="11" font-family="system-ui, sans-serif">Optimized per item</text>
        </g>
      </g>

      <!-- Table Rows -->
      ${itemsSvg}

      <!-- Footer -->
      <line x1="40" y1="710" x2="960" y2="710" stroke="#334155" stroke-width="1"/>
      <text x="40" y="736" fill="#64748b" font-size="12" font-family="system-ui, sans-serif">
        Generated automatically by King Faisal Specialist Hospital &amp; Research Centre (KFSHRC) · Smart Medicine AI
      </text>
      <text x="960" y="736" fill="#64748b" font-size="12" text-anchor="end" font-family="system-ui, sans-serif">
        Showing top 6 priority items · Consult Operations Dashboard for full register
      </text>
    </svg>
  `;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
