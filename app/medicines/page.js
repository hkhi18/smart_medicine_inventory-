// Medicines page ( /medicines ). Server Component with a GET form: filters travel in the URL.
import Link from 'next/link';
import { connection } from 'next/server';
import Pill from '@/components/Pill';
import Explain from '@/components/Explain';
import { listMedicines, getClasses } from '@/lib/queries';
import { fmtInt, fmtSAR, STATUS_LABEL } from '@/lib/format';

const PAGE_SIZE = 50;

export default async function MedicinesPage({ searchParams }) {
  await connection();
  const sp = await searchParams;
  const filters = { q: sp.q || '', cls: sp.cls || '', status: sp.status || '', crit: sp.crit || '' };
  const page = Math.max(1, Number(sp.page) || 1);
  const [{ rows, total }, classes] = await Promise.all([listMedicines({ ...filters, page, pageSize: PAGE_SIZE }), getClasses()]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (p) => '/medicines?' + new URLSearchParams({ ...filters, page: String(p) }).toString();

  return (
    <main className="container section">
      <h1 className="page-title">Medicines</h1>
      <p className="lead">The full catalogue: {fmtInt(total)} medicine(s) match the filters. Click a name to open its forecast, reorder point and lots.</p>

      <form className="filters" method="GET" style={{ marginBottom: 16 }}>
        <input name="q" defaultValue={filters.q} placeholder="Search name or MED code" />
        <select name="cls" defaultValue={filters.cls}>
          <option value="">All classes</option>
          {classes.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select name="status" defaultValue={filters.status}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="crit" defaultValue={filters.crit}>
          <option value="">All criticality</option>
          <option>Vital</option><option>Essential</option><option>Non-essential</option>
        </select>
        <button className="btn primary" type="submit">Filter</button>
        <Link className="btn" href="/medicines">Reset</Link>
      </form>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Medicine</th><th>Class</th><th>Supplier</th><th className="num">Unit cost</th><th className="num">Lead time</th>
                <th className="num">On hand</th><th className="num">ROP</th><th className="num">Coverage</th><th>Model</th><th>Status</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code}>
                  <td><Link href={`/medicines/${r.code}`} className="med-name">{r.name}</Link><div className="med-meta">{r.code} · {r.criticality}</div></td>
                  <td>{r.therapeutic_class}</td>
                  <td>{r.supplier}</td>
                  <td className="num">{fmtSAR(r.unit_cost)}</td>
                  <td className="num">{r.lead_time_days} d</td>
                  <td className="num">{fmtInt(r.on_hand)} <span className="unit">{r.unit}</span></td>
                  <td className="num">{r.status === 'insufficient_history' ? '—' : fmtInt(r.rop)}</td>
                  <td className="num">{r.coverage_days === null ? '—' : `${r.coverage_days} d`}</td>
                  <td style={{ fontSize: 13 }}>{r.model || '—'}</td>
                  <td><Pill value={r.status} /></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={10}>No medicines match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <span>Page {page} of {pages}</span>
          {page > 1 && <Link className="btn sm" href={link(page - 1)}>← Previous</Link>}
          {page < pages && <Link className="btn sm" href={link(page + 1)}>Next →</Link>}
        </div>
      </div>

      <Explain
        concepts={['GET <form>', 'searchParams', 'URLSearchParams', 'Parameterised SQL ($1, $2)', 'ILIKE search', 'LIMIT / OFFSET pagination', '<Link> navigation']}
        en={<>
          <h4>What you see</h4>
          <p>Every medicine with its class, supplier, cost, lead time, current stock, reorder point (ROP), days of coverage,
            the forecast model that won the backtest, and the stock status.</p>
          <h4>How it works</h4>
          <ul>
            <li>The filter bar is a plain HTML <code>&lt;form method="GET"&gt;</code>. Submitting it changes the URL
              (e.g. <code>/medicines?status=below_rop&amp;cls=Antibiotic</code>); the Server Component reads
              <code> searchParams</code> and runs a new SQL query. No JavaScript state is needed and links can be shared.</li>
            <li><code>listMedicines()</code> builds the WHERE clause with <b>parameter placeholders</b> (<code>$1</code>, <code>$2</code>)
              — values are never concatenated into SQL, which prevents SQL injection.</li>
            <li>Pagination uses <code>LIMIT 50 OFFSET (page-1)*50</code> plus a <code>COUNT(*)</code> for the total.</li>
            <li>Clicking a name goes to the <b>dynamic route</b> <code>app/medicines/[code]/page.js</code>.</li>
          </ul>
        </>}
        ar={<>
          <h4>ماذا ترى؟</h4>
          <p>كل الأدوية مع الفئة العلاجية والمورّد والتكلفة ومدة التوريد والمخزون الحالي ونقطة إعادة الطلب وأيام التغطية،
            واسم نموذج التنبؤ الذي فاز في الاختبار، وحالة المخزون.</p>
          <h4>كيف تعمل؟</h4>
          <ul>
            <li>شريط الفلترة عبارة عن <code>&lt;form method="GET"&gt;</code> عادي؛ عند الإرسال يتغيّر الرابط
              (مثل <code>/medicines?status=below_rop</code>) وتقرأ الصفحة <code>searchParams</code> وتنفّذ استعلام SQL جديد.
              لا نحتاج حالة JavaScript ويمكن مشاركة الرابط.</li>
            <li>الدالة <code>listMedicines()</code> تبني شرط WHERE باستخدام <b>متغيرات</b> <code>$1</code> و<code>$2</code>
              بدل دمج النص مباشرة، وهذا يحمي من SQL Injection.</li>
            <li>التقسيم لصفحات عن طريق <code>LIMIT</code> و<code>OFFSET</code> مع <code>COUNT(*)</code> للعدد الكلي.</li>
            <li>الضغط على اسم الدواء يفتح <b>مساراً ديناميكياً</b> <code>app/medicines/[code]/page.js</code>.</li>
          </ul>
        </>}
      />
    </main>
  );
}
