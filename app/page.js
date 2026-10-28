// Dashboard page ( / ). Server Component: queries PostgreSQL on the server, sends HTML to the browser.
import Link from 'next/link';
import RiskTable from '@/components/RiskTable';
import Explain from '@/components/Explain';
import { getHeroStats, getKpis, getInsufficientCodes, getRiskRows } from '@/lib/queries';
import { fmtInt } from '@/lib/format';
import { connection } from 'next/server';
import ImportExcelButton from '@/components/ImportExcelButton';


const PAGE_SIZE = 25;

export default async function DashboardPage({ searchParams }) {
  await connection();                       // render at request time (fresh data, never prerendered at build)
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  // Run the queries in parallel
  const [hero, kpi, insufficient, rows] = await Promise.all([
    getHeroStats(), getKpis(), getInsufficientCodes(), getRiskRows({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
  ]);
  const pages = Math.ceil(kpi.items / PAGE_SIZE);

  return (
    <main>
        <section className="hero">
        <video className="hero-video" autoPlay muted loop playsInline>
          <source src="/Healthcare_Homepage_Video.mp4" type="video/mp4" />
        </video>
        <div className="hero-overlay" />
        <div className="container">
          <h1>Medicine on the shelf, before it runs out</h1>
          <p>Lot-level stock, demand forecasting per item, and expiry alerts for the hospital pharmacy — with every
            projected stockout date traceable back to the model that produced it.</p>
          <div className="action-cards">
            <Link href="/alerts" className="action-card">
              <span className="icon">◎</span>
              <span><span className="title">Review alerts <span>→</span></span><span className="sub">{fmtInt(hero.open_alerts)} open</span></span>
            </Link>
            <Link href="/purchasing" className="action-card">
              <span className="icon">✚</span>
              <span><span className="title">Approve replenishment <span>→</span></span><span className="sub">{fmtInt(hero.awaiting_po)} awaiting pharmacist</span></span>
            </Link>
            <Link href="/movements" className="action-card">
              <span className="icon">⇄</span>
              <span><span className="title">Post a movement <span>→</span></span><span className="sub">Append-only ledger</span></span>
            </Link>
          </div>
        </div>
      </section>

      <div className="container">
        <div className="stat-strip">
          <div><div className="num">{fmtInt(hero.medicines)}</div><div className="lbl">medicines tracked</div></div>
          <div><div className="num">{fmtInt(hero.demand_rows)}</div><div className="lbl">daily demand rows</div></div>
          <div><div className="num">{fmtInt(hero.ledger_rows)}</div><div className="lbl">ledger entries</div></div>
          <div><div className="num">{fmtInt(hero.lots)}</div><div className="lbl">lots with expiry dates</div></div>
          <div><div className="num">{Math.round(Number(hero.db_bytes) / 1048576)} MB</div><div className="lbl">PostgreSQL database</div></div>
        </div>

        <section className="section">
          <h1 className="page-title">Operations dashboard</h1>
          <p className="lead">Every number below is computed from PostgreSQL. Click any row to see the model, its parameters,
            the training window and the backtest scores behind the projected stockout date.</p>

          <div className="kpis">
            <div className="kpi"><div className="label">Items tracked</div><div className="value">{fmtInt(kpi.items)}</div><div className="sub">{hero.warehouses} warehouses</div></div>
            <div className="kpi red"><div className="label">Below reorder point</div><div className="value">{fmtInt(kpi.below_rop)}</div><div className="sub">of {fmtInt(kpi.items)} items</div></div>
            <div className="kpi amber"><div className="label">Lots expiring ≤ 90 days</div><div className="value">{fmtInt(kpi.expiring)}</div><div className="sub">across all warehouses</div></div>
            <div className="kpi amber"><div className="label">Open alerts</div><div className="value">{fmtInt(hero.open_alerts)}</div><div className="sub">waiting for review</div></div>
            <div className="kpi"><div className="label">Forecast coverage</div><div className="value">{fmtInt(kpi.forecast_ok)} / {fmtInt(kpi.items)}</div><div className="sub">{kpi.insufficient} item(s) returned insufficient_history</div></div>
          </div>

          {insufficient.length > 0 && (
            <div className="banner">
              ⚠&nbsp; <strong>{insufficient.length} item(s) have too little history for a forecast (new medicines).</strong> They are shown
              as <code>insufficient_history</code>, not as zero risk: {insufficient.slice(0, 12).join(', ')}{insufficient.length > 12 ? ' …' : ''}.
              An empty forecast is never rendered as a safe state.
            </div>
          )}

                     <div className="card">
                                <div className="card-head">
              <div>
                <h2>Replenishment risk</h2>
                     <p>Most urgent first: stockout, below reorder point, at risk (by days of coverage), then items without a forecast for human review, then healthy.</p>
              </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                       <ImportExcelButton />
                <a className="btn" href="/api/export">Export to Excel</a>
              </div>
            </div>
                   <RiskTable rows={rows} />
            <div className="pager">
              <span>Page {page} of {pages}</span>
              {page > 1 && <Link className="btn sm" href={`/?page=${page - 1}`}>← Previous</Link>}
              {page < pages && <Link className="btn sm" href={`/?page=${page + 1}`}>Next →</Link>}
            </div>
          </div>
        </section>

        <Explain
          concepts={['Server Component', 'connection()', 'async/await data fetching', 'searchParams (?page=)', 'Promise.all', 'Client Component (RiskTable)', 'Route Handler /api/medicines/[code]', 'Route Handler /api/export', 'SQL ORDER BY CASE', 'SQL FILTER (WHERE …)']}
          en={<>
            <h4>What you see</h4>
            <p>The landing page summarises the pharmacy: the hero cards link to the three daily jobs (alerts, purchase approvals,
              stock movements). The strip shows the size of the PostgreSQL data. The <b>Operations dashboard</b> shows KPIs and the
              replenishment-risk table sorted by urgency.</p>
            <h4>How it works in Next.js</h4>
            <ul>
              <li><code>app/page.js</code> is a <b>Server Component</b>: the <code>async</code> function runs on the server, calls
                <code> lib/queries.js</code> (SQL), and returns finished HTML. No database code reaches the browser.</li>
              <li>The page number comes from <code>searchParams</code> (<code>/?page=2</code>), so pagination works with normal links.</li>
              <li>The table is a <b>Client Component</b> (<code>components/RiskTable.jsx</code>, first line <code>'use client'</code>)
                because it reacts to clicks. A click calls <code>fetch('/api/medicines/MED-…')</code>, a <b>Route Handler</b> that returns JSON.</li>
              <li>“Export to Excel” is another Route Handler that streams a CSV file.</li>
            </ul>
            <h4>The numbers</h4>
            <p>KPIs come from the <code>replenishment</code> table (ROP, coverage and status per medicine) computed from forecasts and lots.
              Status priority: stockout → below ROP → at risk → insufficient history → ok.</p>
          </>}
          ar={<>
            <h4>ماذا ترى؟</h4>
            <p>الصفحة الرئيسية تلخّص وضع الصيدلية: البطاقات الخضراء توصلك لثلاث مهام يومية (التنبيهات، اعتماد طلبات الشراء، تسجيل
              حركات المخزون). الشريط يوضح حجم البيانات في PostgreSQL. و<b>لوحة العمليات</b> تعرض المؤشرات الرئيسية وجدول خطر
              إعادة الطلب مرتباً حسب الأولوية.</p>
            <h4>كيف تعمل في Next.js؟</h4>
            <ul>
              <li>الملف <code>app/page.js</code> هو <b>Server Component</b>: الدالة <code>async</code> تعمل على السيرفر وتنفّذ
                استعلامات SQL من <code>lib/queries.js</code> ثم ترسل HTML جاهز للمتصفح، ولا يصل كود قاعدة البيانات للمستخدم.</li>
              <li>رقم الصفحة يُقرأ من <code>searchParams</code> مثل <code>/?page=2</code>.</li>
              <li>الجدول <b>Client Component</b> لأنه يتفاعل مع النقر؛ عند الضغط على صف يتم طلب
                <code> /api/medicines/الكود</code> وهو <b>Route Handler</b> يرجّع JSON ويفتح نافذة التفاصيل.</li>
              <li>زر «Export to Excel» يحمّل ملف CSV من Route Handler آخر.</li>
            </ul>
            <h4>من أين تأتي الأرقام؟</h4>
            <p>من جدول <code>replenishment</code> الذي يحسب نقطة إعادة الطلب (ROP) وأيام التغطية والحالة لكل دواء اعتماداً على
              التنبؤ والكميات في الدفعات (lots). ترتيب الأولوية: نفاد ← تحت ROP ← معرض للخطر ← تاريخ غير كافٍ ← سليم.</p>
          </>}
        />
      </div>
    </main>
  );
}
