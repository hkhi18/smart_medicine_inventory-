// Alerts page ( /alerts ): open / acknowledged / resolved alerts with buttons that call Server Actions.
import Link from 'next/link';
import { connection } from 'next/server';
import Pill from '@/components/Pill';
import Explain from '@/components/Explain';
import { getAlerts } from '@/lib/queries';
import { currentRole, CAN } from '@/lib/roles';
import { updateAlert } from './actions';

const TYPES = ['stockout', 'below_rop', 'at_risk', 'expiry', 'insufficient_history'];

export default async function AlertsPage({ searchParams }) {
  await connection();
  const sp = await searchParams;
  const status = ['open', 'acknowledged', 'resolved'].includes(sp.status) ? sp.status : 'open';
  const type = TYPES.includes(sp.type) ? sp.type : '';
  const [{ rows, counts }, role] = await Promise.all([getAlerts({ status, type }), currentRole()]);
  const canEdit = CAN.handleAlert(role);
  const count = (s, t) => counts.filter((c) => c.status === s && (!t || c.type === t)).reduce((a, c) => a + c.n, 0);
  const href = (s, t) => `/alerts?status=${s}${t ? `&type=${t}` : ''}`;

  return (
    <main className="container section">
      <h1 className="page-title">Alerts</h1>
      <p className="lead">Alerts are raised automatically from the replenishment calculation (stockout, below ROP, at risk),
        from lot expiry dates (≤ 90 days) and for new medicines without a forecast. Someone must review each one.</p>

      <div className="kpis">
        {TYPES.map((t) => (
          <Link key={t} href={href(status, t)} className={`kpi ${t === 'stockout' || t === 'below_rop' ? 'red' : 'amber'}`} style={{ color: 'inherit', textDecoration: 'none' }}>
            <div className="label">{t.replace(/_/g, ' ')}</div>
            <div className="value">{count(status, t)}</div>
            <div className="sub">{status} alerts</div>
          </Link>
        ))}
      </div>

      <div className="filters" style={{ marginBottom: 16 }}>
        <div className="tabs">
          {['open', 'acknowledged', 'resolved'].map((s) => (
            <Link key={s} href={href(s, type)} className={s === status ? 'on' : ''}>{s} ({count(s)})</Link>
          ))}
        </div>
        {type && <Link className="btn sm" href={href(status, '')}>Clear type filter: {type} ×</Link>}
        {!canEdit && <span className="pill medium">Role “{role}” is read-only</span>}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Severity</th><th>Type</th><th>Medicine</th><th>Message</th><th>Raised</th><th>Action</th></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td><Pill value={a.severity} /></td>
                  <td><Pill value={a.type} /></td>
                  <td><Link href={`/medicines/${a.code}`} className="med-name">{a.name}</Link><div className="med-meta">{a.code} · {a.criticality}</div></td>
                  <td style={{ maxWidth: 360 }}>{a.message}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{a.created}{a.handled_by && <div className="med-meta">by {a.handled_by}</div>}</td>
                  <td>
                    {/* Each button is a tiny form that posts to the Server Action updateAlert */}
                    <form action={updateAlert} style={{ display: 'flex', gap: 6 }}>
                      <input type="hidden" name="id" value={a.id} />
                      {status !== 'acknowledged' && status !== 'resolved' && <button className="btn sm" name="status" value="acknowledged" disabled={!canEdit}>Acknowledge</button>}
                      {status !== 'resolved' && <button className="btn sm primary" name="status" value="resolved" disabled={!canEdit}>Resolve</button>}
                      {status === 'resolved' && <button className="btn sm" name="status" value="open" disabled={!canEdit}>Re-open</button>}
                    </form>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6}>No {status} alerts{type ? ` of type ${type}` : ''}.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Explain
        concepts={['Server Action', "'use server'", '<form action={fn}>', 'revalidatePath()', 'Role check on server', 'Audit log insert', 'UPDATE … WHERE id = $3']}
        en={<>
          <h4>What you see</h4>
          <p>The work queue for the pharmacy team. Cards count alerts by type; tabs switch between open, acknowledged and resolved.</p>
          <h4>How it works</h4>
          <ul>
            <li>The buttons sit inside <code>&lt;form action={'{updateAlert}'}&gt;</code>. <code>updateAlert</code> lives in
              <code> app/alerts/actions.js</code>, which starts with <code>'use server'</code> — it is a <b>Server Action</b>:
              the browser sends a POST, the function runs on the server, updates PostgreSQL and writes the audit log.</li>
            <li>The role (cookie) is checked <b>inside</b> the action. Disabling the button in the UI is only cosmetic; the server
              is the real guard.</li>
            <li><code>revalidatePath('/alerts')</code> tells Next.js to re-render the page so the counts update immediately.</li>
          </ul>
          <h4>Where alerts come from</h4>
          <p>The seed script (and every new stock movement) inserts alerts when a medicine becomes stockout / below ROP / at risk,
            when a lot expires within 90 days, or when there is not enough history to forecast.</p>
        </>}
        ar={<>
          <h4>ماذا ترى؟</h4>
          <p>قائمة العمل لفريق الصيدلية. البطاقات تعدّ التنبيهات حسب النوع، والتبويبات تنقلك بين المفتوحة والمُستلمة والمحلولة.</p>
          <h4>كيف تعمل؟</h4>
          <ul>
            <li>الأزرار داخل <code>&lt;form action={'{updateAlert}'}&gt;</code>، والدالة موجودة في <code>app/alerts/actions.js</code>
              التي تبدأ بـ <code>'use server'</code> فهي <b>Server Action</b>: المتصفح يرسل POST وتعمل الدالة على السيرفر
              فتحدّث PostgreSQL وتسجّل العملية في سجل التدقيق.</li>
            <li>يتم التحقق من الدور (role) داخل الدالة على السيرفر؛ تعطيل الزر في الواجهة شكلي فقط والحماية الحقيقية في السيرفر.</li>
            <li><code>revalidatePath('/alerts')</code> يطلب من Next.js إعادة بناء الصفحة لتظهر الأرقام الجديدة فوراً.</li>
          </ul>
          <h4>من أين تأتي التنبيهات؟</h4>
          <p>سكربت التهيئة وكل حركة مخزون جديدة تضيف تنبيهاً عندما يصبح الدواء نافداً أو تحت نقطة إعادة الطلب أو معرضاً للخطر،
            أو عندما تنتهي صلاحية دفعة خلال 90 يوماً، أو عندما لا يوجد تاريخ كافٍ للتنبؤ.</p>
        </>}
      />
    </main>
  );
}
