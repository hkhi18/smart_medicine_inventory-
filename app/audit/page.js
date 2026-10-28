// Audit log page ( /audit ): who did what and when.
import Link from 'next/link';
import { connection } from 'next/server';
import Explain from '@/components/Explain';
import { getAudit } from '@/lib/queries';

const ACTORS = ['', 'system', 'pharmacist', 'supply_chain', 'viewer'];

export default async function AuditPage({ searchParams }) {
  await connection();
  const sp = await searchParams;
  const actor = ACTORS.includes(sp.actor) ? sp.actor : '';
  const rows = await getAudit({ actor });

  return (
    <main className="container section">
      <h1 className="page-title">Audit log</h1>
      <p className="lead">Every important action — role switches, movements, alert handling, purchase-order decisions, forecast runs — is recorded with the actor and time.</p>
      <div className="tabs" style={{ marginBottom: 16 }}>
        {ACTORS.map((a) => <Link key={a || 'all'} href={a ? `/audit?actor=${a}` : '/audit'} className={a === actor ? 'on' : ''}>{a || 'all'}</Link>)}
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.id}</td><td style={{ whiteSpace: 'nowrap' }}>{r.ts}</td>
                  <td><span className="pill open">{r.actor}</span></td><td className="mono">{r.action}</td>
                  <td>{r.entity}</td><td style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>{r.details}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6}>No entries.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <Explain
        concepts={['Table audit_log', 'lib/audit.js', 'Called from every Server Action']}
        en={<>
          <h4>Why an audit log?</h4>
          <p>In a hospital pharmacy you must be able to answer “who changed this, and when?”. Every Server Action calls
            <code> audit(actor, action, entity, details)</code> which inserts one row into <code>audit_log</code>.</p>
          <h4>How it works</h4>
          <p>The page reads the latest 200 rows (newest first). The tabs filter by actor using <code>searchParams</code>.
            Together with the append-only <code>movements</code> ledger, this gives full traceability.</p>
          <p><b>Note:</b> the role selector is a demo of permissions. A real deployment would use proper login (e.g. hospital Active Directory / SSO).</p>
        </>}
        ar={<>
          <h4>لماذا سجل التدقيق؟</h4>
          <p>في صيدلية المستشفى يجب معرفة «من غيّر هذا ومتى؟». كل Server Action يستدعي <code>audit()</code> التي تضيف صفاً في جدول
            <code> audit_log</code>.</p>
          <h4>كيف تعمل؟</h4>
          <p>الصفحة تعرض آخر 200 عملية، والتبويبات تفلتر حسب المستخدم باستخدام <code>searchParams</code>. مع سجل الحركات غير القابل
            للتعديل نحصل على تتبع كامل.</p>
          <p><b>ملاحظة:</b> اختيار الدور في الأعلى للتجربة فقط؛ في النظام الحقيقي يكون تسجيل الدخول عبر نظام المستشفى (Active Directory / SSO).</p>
        </>}
      />
    </main>
  );
}
