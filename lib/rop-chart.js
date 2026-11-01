import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { query } from '@/lib/db';
import { fmtInt, fmtDate } from '@/lib/format';
import { accuracyFromMape } from '@/lib/metrics';

// Resvg only supports TTF/OTF fonts (not WOFF2, and not @font-face inside the SVG).
// The fonts live in assets/fonts so they are deployed together with the app on Vercel.
const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts');
const FONT_FAMILY = 'Roboto, sans-serif';
let fontBuffers = null;

function loadFonts() {
  if (!fontBuffers) {
    fontBuffers = [
      fs.readFileSync(path.join(FONT_DIR, 'Roboto-Regular.ttf')),
      fs.readFileSync(path.join(FONT_DIR, 'Roboto-Bold.ttf'))
    ];
  }
  return fontBuffers;
}

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
        <text x="20" y="26" fill="#f8fafc" font-size="14" font-weight="bold" font-family="${FONT_FAMILY}">${xmlEscape(r.name.length > 38 ? r.name.slice(0, 38) + '…' : r.name)}</text>
        <text x="20" y="48" fill="#94a3b8" font-size="12" font-family="${FONT_FAMILY}">${xmlEscape(r.code)} · <tspan fill="${critColor}">• ${xmlEscape(r.criticality)}</tspan> · ML: ${xmlEscape(modelLabel)} (${acc} Acc)</text>

        <!-- Stock vs ROP Bar Chart -->
        <g transform="translate(390, 14)">
          <rect width="${barMaxWidth}" height="20" rx="4" fill="#334155"/>
          <rect width="${onHandWidth}" height="20" rx="4" fill="#22c55e"/>
          <!-- ROP line -->
          <line x1="${ropX - 390}" y1="-4" x2="${ropX - 390}" y2="24" stroke="#f59e0b" stroke-width="2.5" stroke-dasharray="3,2"/>
          <text x="${ropX - 390 + 4}" y="15" fill="#f59e0b" font-size="10" font-weight="bold" font-family="${FONT_FAMILY}">ROP ${fmtInt(r.rop)}</text>
          <text x="10" y="15" fill="#ffffff" font-size="11" font-weight="bold" font-family="${FONT_FAMILY}">On hand: ${fmtInt(r.on_hand)} ${xmlEscape(r.unit)}</text>
        </g>

        <!-- Coverage & Stockout Tag -->
        <g transform="translate(760, 15)">
          <rect width="140" height="38" rx="6" fill="#450a0a" stroke="#dc2626" stroke-width="1"/>
          <text x="70" y="17" fill="#fca5a5" font-size="11" font-weight="bold" text-anchor="middle" font-family="${FONT_FAMILY}">${r.coverage_days} Days Coverage</text>
          <text x="70" y="32" fill="#f87171" font-size="10" text-anchor="middle" font-family="${FONT_FAMILY}">Stockout: ${fmtDate(r.stockout)}</text>
        </g>
      </g>
    `;
  });

  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">

      <defs>
        <linearGradient id="headerGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#047857"/>
          <stop offset="1" stop-color="#064e3b"/>
        </linearGradient>
      </defs>

      <!-- Background -->
      <rect width="${width}" height="${height}" fill="#0b1120"/>

      <!-- Header Banner -->
      <rect width="${width}" height="100" fill="url(#headerGrad)"/>
      <circle cx="58" cy="50" r="26" fill="#ffffff" opacity="0.12"/>
      <!-- Medical cross icon drawn with shapes (the ⚕ character is not in the font) -->
      <rect x="52" y="38" width="12" height="24" rx="2" fill="#ffffff"/>
      <rect x="46" y="44" width="24" height="12" rx="2" fill="#ffffff"/>

      <text x="100" y="42" fill="#ffffff" font-size="22" font-weight="bold" font-family="${FONT_FAMILY}">Smart Medicine Inventory · Replenishment Analysis</text>
      <text x="100" y="68" fill="#a7f3d0" font-size="14" font-family="${FONT_FAMILY}">Urgent Action Required: Medicines Below Reorder Point (ROP) &amp; Stockout Risk</text>
      <text x="960" y="45" fill="#f5c518" font-size="13" font-weight="bold" text-anchor="end" font-family="${FONT_FAMILY}">LIVE PREDICTION</text>
      <text x="960" y="66" fill="#cbd5e1" font-size="11" text-anchor="end" font-family="${FONT_FAMILY}">As of: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</text>

      <!-- KPI Summary Cards -->
      <g transform="translate(40, 118)">
        <!-- KPI 1 -->
        <rect width="210" height="78" rx="8" fill="#1e293b" stroke="#334155" stroke-width="1"/>
        <text x="18" y="26" fill="#94a3b8" font-size="12" font-weight="500" font-family="${FONT_FAMILY}">TOTAL BELOW ROP</text>
        <text x="18" y="58" fill="#ef4444" font-size="28" font-weight="bold" font-family="${FONT_FAMILY}">${totalBelowRop}</text>
        <text x="80" y="56" fill="#cbd5e1" font-size="12" font-family="${FONT_FAMILY}">items affected</text>

        <!-- KPI 2 -->
        <g transform="translate(230, 0)">
          <rect width="210" height="78" rx="8" fill="#1e293b" stroke="#334155" stroke-width="1"/>
          <text x="18" y="26" fill="#94a3b8" font-size="12" font-weight="500" font-family="${FONT_FAMILY}">MOST CRITICAL</text>
          <text x="18" y="58" fill="#f59e0b" font-size="28" font-weight="bold" font-family="${FONT_FAMILY}">${vitalCount}</text>
          <text x="60" y="56" fill="#cbd5e1" font-size="12" font-family="${FONT_FAMILY}">Vital priority in top list</text>
        </g>

        <!-- KPI 3 -->
        <g transform="translate(460, 0)">
          <rect width="220" height="78" rx="8" fill="#1e293b" stroke="#334155" stroke-width="1"/>
          <text x="18" y="26" fill="#94a3b8" font-size="12" font-weight="500" font-family="${FONT_FAMILY}">MINIMUM COVERAGE</text>
          <text x="18" y="58" fill="#38bdf8" font-size="28" font-weight="bold" font-family="${FONT_FAMILY}">${rows[0]?.coverage_days || 0} d</text>
          <text x="75" y="56" fill="#cbd5e1" font-size="12" font-family="${FONT_FAMILY}">critical lead time buffer</text>
        </g>

        <!-- KPI 4 -->
        <g transform="translate(700, 0)">
          <rect width="220" height="78" rx="8" fill="#1e293b" stroke="#334155" stroke-width="1"/>
          <text x="18" y="26" fill="#94a3b8" font-size="12" font-weight="500" font-family="${FONT_FAMILY}">ML ENGINES USED</text>
          <text x="18" y="55" fill="#a7f3d0" font-size="17" font-weight="bold" font-family="${FONT_FAMILY}">ARIMA · HW · RF</text>
          <text x="18" y="70" fill="#64748b" font-size="11" font-family="${FONT_FAMILY}">Optimized per item</text>
        </g>
      </g>

      <!-- Table Rows -->
      ${itemsSvg}

      <!-- Footer -->
      <line x1="40" y1="710" x2="960" y2="710" stroke="#334155" stroke-width="1"/>
      <text x="40" y="730" fill="#64748b" font-size="12" font-family="${FONT_FAMILY}">Generated automatically by King Faisal Specialist Hospital &amp; Research Centre (KFSHRC) · Smart Medicine AI</text>
      <text x="960" y="750" fill="#64748b" font-size="12" text-anchor="end" font-family="${FONT_FAMILY}">Showing top 6 priority items · Consult Operations Dashboard for full register</text>
    </svg>
  `;

  const resvg = new Resvg(svg, {
    font: {
      fontBuffers: loadFonts(),
      loadSystemFonts: false,
      defaultFontFamily: 'Roboto'
    },
    fitTo: { mode: 'original' }
  });
  return resvg.render().asPng();
}
