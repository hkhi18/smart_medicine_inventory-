// Route Handler: GET /api/export -> CSV file of the replenishment table (opens directly in Excel)
import { getAllRiskRows } from '@/lib/queries';
import { STATUS_LABEL } from '@/lib/format';


const COLUMNS = [
  ['code', 'Code'], ['name', 'Medicine'], ['criticality', 'Criticality'], ['therapeutic_class', 'Class'],
  ['supplier', 'Supplier'], ['unit', 'Unit'], ['on_hand', 'On hand'], ['rop', 'Reorder point'],
  ['safety_stock', 'Safety stock'], ['coverage_days', 'Coverage (days)'], ['projected_stockout', 'Projected stockout'],
  ['suggested_order', 'Suggested order'], ['lead_time_days', 'Lead time (days)'], ['model', 'Forecast model'], ['status', 'Status']
];

const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET() {
  const rows = await getAllRiskRows();
  const lines = [COLUMNS.map((c) => c[1]).join(',')];
  rows.forEach((r) => lines.push(COLUMNS.map(([k]) => csvCell(k === 'status' ? STATUS_LABEL[r[k]] : r[k])).join(',')));
  // ﻿ (BOM) makes Excel read UTF-8 correctly
  return new Response('﻿' + lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="replenishment-risk.csv"`
    }
  });
}
