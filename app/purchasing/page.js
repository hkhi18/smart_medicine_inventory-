// Purchasing page ( /purchasing ): purchase-order drafts proposed by the system, decided by a pharmacist.
import Link from 'next/link';
import { connection } from 'next/server';
import Pill from '@/components/Pill';
import Explain from '@/components/Explain';
import { getPurchaseOrders } from '@/lib/queries';
import { currentRole, CAN } from '@/lib/roles';
import { decidePurchaseOrder } from './actions';
import { fmtInt, fmtSAR } from '@/lib/format';

const TABS = [['awaiting_pharmacist', 'Awaiting pharmacist'], ['approved', 'Approved'], ['rejected', 'Rejected']];

export default async function PurchasingPage({ searchParams }) {
  await connection();
  const sp = await searchParams;
  const status = TABS.some(([k]) => k === sp.status) ? sp.status : 'awaiting_pharmacist';
  const [{ rows, totals }, role] = await Promise.all([getPurchaseOrders(status), currentRole()]);
  const canDecide = CAN.approvePurchase(role);
  const t = (k) => totals.find((x) => x.status === k) || { n: 0, cost: 0 };

  return (
    <main className="container section">
      <h1 className="page-title">Purchasing</h1>
      <p className="lead">When a medicine is at risk, below its reorder point or out of stock, the system drafts a purchase order with
        the suggested quantity. Nothing is ordered automatically — a <b>pharmacist must approve</b> every draft.</p>

      <div className="kpis" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
        {TABS.map(([k, label]) => (
          <div key={k} className={`kpi ${k === 'awaiting_pharmacist' ? 'amber' : ''}`}>
            <div className="label">{label}</div><div className="value">{fmtInt(t(k).n)}</div><div className="sub">{fmtSAR(t(k).cost)} estimated</div>
          </div>
        ))}
      </div>

      <div className="filters" style={{ marginBottom: 16 }}>
        <div className="tabs">{TABS.map(([k, label]) => <Link key={k} href={`/purchasing?status=${k}`} className={k === status ? 'on' : ''}>{label}</Link>)}</div>
        {!canDecide && <span className="pill medium">Switch the role to “pharmacist” (top right) to approve</span>}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>PO</th><th>Medicine</th><th>Supplier</th><th className="num">Qty</th><th className="num">Est. cost</th><th>Reason</th><th>Stock status</th><th>{status === 'awaiting_pharmacist' ? 'Decision' : 'Decided'}</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="mono">PO-{String(p.id).padStart(5, '0')}</td>
                  <td><Link href={`/medicines/${p.code}`} className="med-name">{p.name}</Link><div className="med-meta">{p.code} · {p.criticality} · lead {p.lead_time_days} d</div></td>
                  <td>{p.supplier}</td>
                  <td className="num">{fmtInt(p.qty)} <span className="unit">{p.unit}</span></td>
                  <td className="num">{fmtSAR(p.est_cost)}</td>
                  <td style={{ fontSize: 13, color: 'var(--ink-2)', maxWidth: 280 }}>{p.reason}</td>
                  <td><Pill value={p.stock_status} /></td>
                  <td>
                    {status === 'awaiting_pharmacist' ? (
                      <form action={decidePurchaseOrder} style={{ display: 'flex', gap: 6 }}>
                        <input type="hidden" name="id" value={p.id} />
                        <button className="btn sm primary" name="decision" value="approved" disabled={!canDecide}>Approve</button>
                        <button className="btn sm danger" name="decision" value="rejected" disabled={!canDecide}>Reject</button>
                      </form>
                    ) : (<span style={{ fontSize: 13 }}><Pill value={p.status} /> {p.decided_by} · {p.decided}</span>)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8}>No purchase orders in this state.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Explain
        concepts={['Server Action', 'Authorisation inside the action', 'UPDATE … RETURNING', 'Human-in-the-loop', 'revalidatePath()']}
        en={<>
          <h4>What you see</h4>
          <p>Purchase-order drafts with the suggested quantity and estimated cost, ordered by urgency. Tabs show approved and rejected history.</p>
          <h4>Suggested quantity</h4>
          <p>Suggested order = forecast demand for (lead time + 30-day review period) + safety stock − on hand. It covers the
            days until the delivery arrives plus one review cycle.</p>
          <h4>How it works</h4>
          <ul>
            <li>Approve / Reject buttons post to the Server Action <code>decidePurchaseOrder</code> in <code>app/purchasing/actions.js</code>.</li>
            <li>The action reads the role cookie and refuses unless the role is <b>pharmacist</b> — try switching the role in the top bar.</li>
            <li><code>UPDATE … WHERE status = 'awaiting_pharmacist' RETURNING …</code> makes the decision only once, even if the button is clicked twice.</li>
            <li>Each decision is written to the audit log.</li>
          </ul>
        </>}
        ar={<>
          <h4>ماذا ترى؟</h4>
          <p>مسودات طلبات الشراء مع الكمية المقترحة والتكلفة التقديرية مرتبة حسب الأولوية، وتبويبات للطلبات المعتمدة والمرفوضة.</p>
          <h4>الكمية المقترحة</h4>
          <p>الكمية المقترحة = الطلب المتوقع خلال (مدة التوريد + 30 يوم مراجعة) + مخزون الأمان − الكمية الحالية، أي تغطي الفترة
            حتى وصول الشحنة ودورة مراجعة واحدة.</p>
          <h4>كيف تعمل؟</h4>
          <ul>
            <li>زرّا الاعتماد والرفض يرسلان إلى Server Action اسمه <code>decidePurchaseOrder</code>.</li>
            <li>الدالة تتحقق أن الدور <b>صيدلي (pharmacist)</b> وإلا ترفض. جرّبي تغيير الدور من أعلى الصفحة.</li>
            <li>جملة <code>UPDATE … RETURNING</code> مع شرط الحالة تضمن أن القرار يُسجَّل مرة واحدة فقط.</li>
            <li>كل قرار يُحفظ في سجل التدقيق.</li>
          </ul>
        </>}
      />
    </main>
  );
}
