// Read-only tools the chatbot may call. The AI never writes SQL: it only picks a tool and its arguments.
// All data comes from the existing helpers in lib/queries.js, so no new SQL is needed.
import { getRiskRows, getKpis } from '@/lib/queries';
import { fmtDate } from '@/lib/format';

const STATUSES = ['stockout', 'below_rop', 'at_risk', 'insufficient_history'];

export const TOOL_DECLARATIONS = [
  {
    name: 'list_items_by_status',
    description:
      'List medicines by replenishment status, most urgent first. Use it for questions like "items below ROP", "what is out of stock", "high risk items", "items at risk".',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: STATUSES,
          description:
            'stockout = none on hand; below_rop = under the reorder point; at_risk = close to the reorder point; insufficient_history = new item without a forecast'
        },
        limit: { type: 'integer', description: 'Maximum rows to return (default 10, maximum 25)' }
      },
      required: ['status']
    }
  },
  {
    name: 'get_summary',
    description:
      'Overall numbers: items tracked, items below reorder point, lots expiring within 90 days, forecast coverage.'
  },
  {
    name: 'find_medicine',
    description:
      'Find a medicine by part of its name or code and return stock, reorder point, coverage days and projected stockout date.',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string', description: 'Part of the medicine name or code' } },
      required: ['text']
    }
  }
];

// Database counts can come back as BigInt or string; JSON needs plain numbers
function num(v) {
  return v === null || v === undefined ? null : Number(v);
}

// Rows are sorted most urgent first, so one large page covers every risky item
async function allRows() {
  return getRiskRows({ limit: 5000, offset: 0 });
}

function compact(r) {
  return {
    code: r.code,
    name: r.name,
    criticality: r.criticality,
    on_hand: num(r.on_hand),
    unit: r.unit,
    reorder_point: r.status === 'insufficient_history' ? null : num(r.rop),
    coverage_days: num(r.coverage_days),
    projected_stockout: fmtDate(r.projected_stockout),
    status: r.status,
    ml_model: r.model || null,
    forecast_demand: r.lt_demand !== null && r.lt_demand !== undefined ? num(r.lt_demand) : null,
    accuracy: r.mape !== null && r.mape !== undefined ? `${Math.round(Math.max(0, 100 - Number(r.mape)))}%` : null
  };
}

export async function runTool(name, args = {}) {
  if (name === 'get_summary') {
    const k = await getKpis();
    return {
      items_tracked: num(k.items),
      below_rop: num(k.below_rop),
      lots_expiring_90d: num(k.expiring),
      forecast_ok: num(k.forecast_ok),
      insufficient_history: num(k.insufficient)
    };
  }

  if (name === 'list_items_by_status') {
    if (!STATUSES.includes(args.status)) return { error: 'Unknown status' };
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 25);
    const rows = (await allRows()).filter((r) => r.status === args.status);
    return {
      status: args.status,
      total_matching: rows.length,
      shown: Math.min(limit, rows.length),
      items: rows.slice(0, limit).map(compact)
    };
  }

  if (name === 'find_medicine') {
    const text = String(args.text || '').toLowerCase().trim();
    if (!text) return { error: 'Empty search text' };
    const rows = (await allRows()).filter(
      (r) => String(r.name).toLowerCase().includes(text) || String(r.code).toLowerCase().includes(text)
    );
    return { total_matching: rows.length, items: rows.slice(0, 5).map(compact) };
  }

  return { error: 'Unknown tool' };
}
