// Movements page ( /movements ): post a movement + browse the append-only ledger.
import Link from 'next/link';
import { connection } from 'next/server';
import MovementForm from '@/components/MovementForm';
import Explain from '@/components/Explain';
import { getMovements, getWarehouses } from '@/lib/queries';
import { currentRole, CAN } from '@/lib/roles';
import { fmtInt } from '@/lib/format';

export default async function MovementsPage({ searchParams }) {
  await connection();
  const sp = await searchParams;
  const code = (sp.code || '').toUpperCase();
  const [rows, warehouses, role] = await Promise.all([getMovements({ code, limit: 100 }), getWarehouses(), currentRole()]);
  const canPost = CAN.postMovement(role);

  return (
    <main className="container section">
      <h1 className="page-title">Movements</h1>
      <p className="lead">Every change of stock is a row in an <b>append-only ledger</b>: receipts, issues, returns, transfers and
        write-offs. Rows are never edited or deleted — a PostgreSQL trigger blocks UPDATE and DELETE.</p>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-head"><div><h2>Post a movement</h2><p>Runs in one database transaction: ledger rows + lot quantities + reorder-point recalculation + alert/PO if needed + audit log.</p></div>
          {!canPost && <span className="pill medium">Role “{role}” is read-only</span>}</div>
        <div className="card-body"><MovementForm warehouses={warehouses} canPost={canPost} /></div>
      </div>

      <div className="card">
        <div className="card-head">
          <div><h2>Ledger</h2><p>Latest 100 entries{code ? ` for ${code}` : ''} (newest first).</p></div>
          <form className="filters" method="GET">
            <input name="code" defaultValue={code} placeholder="Filter by MED code" />
            <button className="btn" type="submit">Filter</button>
            {code && <Link className="btn" href="/movements">Clear</Link>}
          </form>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Time</th><th>Medicine</th><th>Warehouse</th><th>Lot</th><th>Type</th><th className="num">Qty</th><th>By</th><th>Note</th></tr></thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td className="mono">{m.id}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{m.ts}</td>
                  <td><Link href={`/medicines/${m.code}`} className="med-name">{m.name}</Link><div className="med-meta">{m.code}</div></td>
                  <td className="mono">{m.warehouse}</td>
                  <td className="mono">{m.lot_no || '—'}</td>
                  <td><span className={`pill ${m.qty < 0 ? 'medium' : 'ok'}`}>{m.type}</span></td>
                  <td className="num" style={{ color: m.qty < 0 ? 'var(--red-ink)' : 'var(--green-700)' }}>{m.qty > 0 ? '+' : ''}{fmtInt(m.qty)} <span className="unit">{m.unit}</span></td>
                  <td>{m.actor}</td>
                  <td style={{ fontSize: 13, color: 'var(--ink-2)' }}>{m.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Explain
        concepts={['useActionState()', 'Server Action with return value', 'Database transaction (BEGIN/COMMIT)', 'FEFO', 'SELECT … FOR UPDATE', 'PostgreSQL trigger', 'Append-only ledger']}
        en={<>
          <h4>What you see</h4>
          <p>A form to record stock movements and the ledger of all movements (seeded history + what you post).</p>
          <h4>How it works</h4>
          <ul>
            <li><code>components/MovementForm.jsx</code> is a Client Component using React’s <code>useActionState()</code>. It calls
              the Server Action <code>postMovementAction</code> and shows the message it returns (green = saved, red = error).</li>
            <li>The action validates the input, then <code>lib/stock.js</code> runs everything inside <b>one transaction</b>:
              if any step fails (e.g. not enough stock) PostgreSQL rolls back and nothing is saved.</li>
            <li>Issues, write-offs and transfers use <b>FEFO</b> (First-Expiry-First-Out): lots with the nearest expiry date are used first,
              which reduces waste from expired medicine.</li>
            <li>After the stock change, the reorder point is recalculated for that medicine; if it falls to below ROP an alert and a
              purchase-order draft are created automatically.</li>
            <li>The table <code>movements</code> has a trigger that raises an error on UPDATE/DELETE — corrections are new rows, so the history is auditable.</li>
          </ul>
          <p>Try it: post an ISSUE for a medicine, then open the Dashboard — its on-hand, coverage and status change.</p>
        </>}
        ar={<>
          <h4>ماذا ترى؟</h4>
          <p>نموذج لتسجيل حركات المخزون، وسجل (ledger) لكل الحركات السابقة والجديدة.</p>
          <h4>كيف تعمل؟</h4>
          <ul>
            <li><code>MovementForm.jsx</code> مكوّن Client يستخدم <code>useActionState()</code> من React، يستدعي Server Action
              اسمه <code>postMovementAction</code> ويعرض الرسالة الراجعة (أخضر = تم الحفظ، أحمر = خطأ).</li>
            <li>الدالة تتحقق من المدخلات، ثم ينفّذ <code>lib/stock.js</code> كل الخطوات داخل <b>Transaction واحدة</b>؛
              إذا فشلت أي خطوة (مثل عدم كفاية المخزون) يتم التراجع ولا يُحفظ شيء.</li>
            <li>الصرف والإتلاف والتحويل تستخدم <b>FEFO</b> (الأقرب انتهاءً يُصرف أولاً) لتقليل الهدر من الأدوية المنتهية.</li>
            <li>بعد تغيّر المخزون تُحسب نقطة إعادة الطلب من جديد، وإذا صار الدواء تحت ROP يُنشأ تنبيه ومسودة طلب شراء تلقائياً.</li>
            <li>جدول <code>movements</code> عليه Trigger يمنع التعديل والحذف، فالتصحيح يكون بحركة جديدة ويبقى التاريخ قابلاً للتدقيق.</li>
          </ul>
          <p>جرّبي: سجّلي حركة صرف ISSUE لدواء ثم افتحي الصفحة الرئيسية وشوفي كيف تتغير الكمية والتغطية والحالة.</p>
        </>}
      />
    </main>
  );
}
