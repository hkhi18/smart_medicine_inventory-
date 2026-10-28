// Guide page ( /guide ): explains the whole project in English and Arabic.
// It has no database query of its own; it only uses components and static text.
import Link from 'next/link';

function Section({ title, titleAr, en, ar }) {
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-head" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        <h2>{title}</h2><h2 dir="rtl" style={{ textAlign: 'right' }}>{titleAr}</h2>
      </div>
      <div className="explain-cols">
        <div className="explain-col" dir="ltr">{en}</div>
        <div className="explain-col" dir="rtl" lang="ar">{ar}</div>
      </div>
    </div>
  );
}

const TREE = `smart-medicine-inventory/
├─ app/                      ← Next.js App Router: every folder = a URL
│  ├─ layout.js              ← shared shell (header, fonts, CSS) for all pages
│  ├─ globals.css            ← the whole design system
│  ├─ page.js                ← /            Dashboard
│  ├─ medicines/page.js      ← /medicines   list + filters
│  ├─ medicines/[code]/page.js ← /medicines/MED-00001 (dynamic route)
│  ├─ alerts/  page.js + actions.js      ← Server Actions
│  ├─ movements/ page.js + actions.js
│  ├─ purchasing/ page.js + actions.js
│  ├─ analytics/page.js      ← live SQL aggregations + charts
│  ├─ forecast-models/page.js
│  ├─ audit/page.js
│  ├─ guide/page.js          ← this page
│  └─ api/                   ← Route Handlers (JSON / CSV endpoints)
│     ├─ medicines/[code]/route.js
│     └─ export/route.js
├─ components/               ← reusable UI (Header, RiskTable, Plot, Explain…)
├─ lib/
│  ├─ db.js                  ← connection: PostgreSQL server OR embedded PGlite
│  ├─ queries.js             ← all SELECT queries used by pages
│  ├─ forecast.js            ← the 9 forecasting models + backtest
│  ├─ replenishment.js       ← ROP / coverage / status in SQL
│  ├─ stock.js               ← movements, FEFO, transactions
│  ├─ roles.js, audit.js, format.js, config.js
├─ db/schema.sql             ← tables, indexes, view, trigger
├─ scripts/seed.mjs          ← builds ~1M rows + trains models
└─ next.config.mjs, package.json`;

export default function GuidePage() {
  return (
    <main className="container section">
      <h1 className="page-title">Project guide · دليل المشروع</h1>
      <p className="lead">Everything about how Smart Medicine Inventory is built — in English and Arabic. Start here, then read the
        “How this page works” panel at the bottom of each page.</p>

      <Section title="1. What the project does" titleAr="١. ماذا يفعل المشروع؟"
        en={<>
          <p>A hospital-pharmacy inventory system that answers one question for 1,000 medicines in 5 warehouses:
            <b> “Will this medicine still be on the shelf when a patient needs it?”</b></p>
          <ul>
            <li>Tracks stock per <b>lot</b> (batch + expiry date) and per warehouse.</li>
            <li>Forecasts daily demand per medicine with <b>9 models</b>, chooses the best by backtest.</li>
            <li>Computes the <b>reorder point</b>, days of coverage and projected stockout date.</li>
            <li>Raises <b>alerts</b> and drafts <b>purchase orders</b> that a pharmacist approves.</li>
            <li>Keeps an <b>append-only ledger</b> and an <b>audit log</b> for traceability.</li>
          </ul>
          <p>Data is <b>synthetic</b> (realistic patterns: weekends, Ramadan, Eid, growth) — not real patient or hospital records.</p>
        </>}
        ar={<>
          <p>نظام مخزون لصيدلية مستشفى يجيب عن سؤال واحد لـ 1,000 دواء في 5 مستودعات:
            <b> «هل سيكون هذا الدواء متوفراً عندما يحتاجه المريض؟»</b></p>
          <ul>
            <li>يتتبع المخزون على مستوى <b>الدفعة (lot)</b> مع تاريخ الانتهاء ولكل مستودع.</li>
            <li>يتنبأ بالطلب اليومي لكل دواء باستخدام <b>9 نماذج</b> ويختار الأفضل بالاختبار الرجعي.</li>
            <li>يحسب <b>نقطة إعادة الطلب</b> وأيام التغطية وتاريخ النفاد المتوقع.</li>
            <li>يُطلق <b>تنبيهات</b> ويُنشئ <b>مسودات طلبات شراء</b> يعتمدها الصيدلي.</li>
            <li>يحتفظ بـ <b>سجل حركات غير قابل للتعديل</b> و<b>سجل تدقيق</b>.</li>
          </ul>
          <p>البيانات <b>تجريبية</b> بأنماط واقعية (العطلة الأسبوعية، رمضان، العيد، النمو) وليست بيانات حقيقية للمرضى أو المستشفى.</p>
        </>}
      />

      <Section title="2. Architecture" titleAr="٢. البنية"
        en={<>
          <pre className="mono" style={{ background: '#f6f8f7', padding: 14, borderRadius: 12, overflowX: 'auto', fontSize: 12.5 }}>{`Browser (HTML + small JS)
   │  click / form submit
   ▼
Next.js server (Node.js)
   ├─ Server Components  → read data, render HTML
   ├─ Server Actions     → write data (POST)
   └─ Route Handlers     → JSON / CSV (/api/...)
   │  SQL ($1, $2 parameters)
   ▼
PostgreSQL  (real server via DATABASE_URL
             or embedded PGlite in ./pgdata)`}</pre>
          <p>The browser never talks to the database. All SQL runs on the server, so credentials and queries stay private.</p>
        </>}
        ar={<>
          <p>المتصفح يعرض HTML وقليلاً من JavaScript. عند النقر أو إرسال نموذج يتم الطلب من سيرفر Next.js الذي يحتوي على:</p>
          <ul>
            <li><b>Server Components</b>: تقرأ البيانات وتبني HTML.</li>
            <li><b>Server Actions</b>: تكتب البيانات (طلبات POST).</li>
            <li><b>Route Handlers</b>: ترجع JSON أو CSV تحت <code>/api</code>.</li>
          </ul>
          <p>السيرفر هو الوحيد الذي يتصل بـ PostgreSQL باستخدام SQL مع متغيرات <code>$1</code> و<code>$2</code>.
            المتصفح لا يتصل بقاعدة البيانات أبداً، فتبقى كلمات المرور والاستعلامات محمية.</p>
          <p>قاعدة البيانات إما سيرفر PostgreSQL حقيقي (عبر <code>DATABASE_URL</code>) أو PostgreSQL مدمج (PGlite) داخل مجلد <code>pgdata</code>.</p>
        </>}
      />

      <Section title="3. Folder structure" titleAr="٣. هيكل المجلدات"
        en={<pre className="mono" style={{ background: '#f6f8f7', padding: 14, borderRadius: 12, overflowX: 'auto', fontSize: 12, lineHeight: 1.5 }}>{TREE}</pre>}
        ar={<>
          <ul>
            <li><code>app/</code>: كل مجلد يمثّل رابطاً في الموقع (App Router). الملف <code>page.js</code> هو الصفحة،
              و<code>layout.js</code> الإطار المشترك لكل الصفحات.</li>
            <li>المجلد بين قوسين مربعين مثل <code>[code]</code> يعني جزءاً متغيراً من الرابط.</li>
            <li><code>actions.js</code> بجانب الصفحة: دوال السيرفر التي تعدّل البيانات.</li>
            <li><code>app/api/</code>: نقاط API ترجع JSON أو ملفات.</li>
            <li><code>components/</code>: مكونات الواجهة القابلة لإعادة الاستخدام.</li>
            <li><code>lib/</code>: منطق المشروع: الاتصال بقاعدة البيانات، الاستعلامات، النماذج، الحسابات.</li>
            <li><code>db/schema.sql</code>: تعريف الجداول. <code>scripts/seed.mjs</code>: يبني البيانات ويدرّب النماذج.</li>
          </ul>
        </>}
      />

      <Section title="4. Next.js concepts used" titleAr="٤. مفاهيم Next.js المستخدمة"
        en={<table>
          <tbody>
            {[
              ['App Router', 'Folders in app/ become URLs. page.js = page, layout.js = shared wrapper.'],
              ['Server Component (default)', 'async component that runs only on the server — can query the DB directly. Example: app/page.js.'],
              ["Client Component ('use client')", 'Runs in the browser for interactivity (clicks, state, charts). Example: RiskTable, Plot, MovementForm.'],
              ["Server Action ('use server')", 'Function called by a <form>; runs on the server via POST. Example: alerts/actions.js.'],
              ['useActionState', 'React hook that shows the result of a Server Action (success/error message).'],
              ['Route Handler (route.js)', 'API endpoint: GET /api/medicines/[code] returns JSON, /api/export returns CSV.'],
              ['Dynamic route [code]', 'One file serves /medicines/MED-00001 … MED-01000. params is a Promise in Next 16.'],
              ['searchParams', 'Reads ?page=2&status=… — filters and pagination without client state.'],
              ['connection()', 'Tells Next.js to render at request time (fresh DB data) instead of at build time.'],
              ['revalidatePath()', 'After a change, re-render the affected pages so they show new numbers.'],
              ['next/font/local', 'Fonts bundled in the project — works offline.'],
              ['output: standalone', 'Build produces server.js + minimal node_modules to run without npm install.']
            ].map(([k, v]) => <tr key={k}><td style={{ fontWeight: 600, whiteSpace: 'nowrap', paddingLeft: 0 }}>{k}</td><td style={{ fontSize: 13.5 }}>{v}</td></tr>)}
          </tbody>
        </table>}
        ar={<ul>
          <li><b>App Router</b>: المجلدات داخل <code>app</code> تصبح روابط.</li>
          <li><b>Server Component</b> (الافتراضي): مكوّن يعمل على السيرفر فقط ويمكنه الاستعلام من قاعدة البيانات مباشرة.</li>
          <li><b>Client Component</b> (<code>'use client'</code>): يعمل في المتصفح للتفاعل (النقر، الحالة، الرسوم).</li>
          <li><b>Server Action</b> (<code>'use server'</code>): دالة يستدعيها النموذج <code>&lt;form&gt;</code> وتعمل على السيرفر.</li>
          <li><b>useActionState</b>: يعرض نتيجة الـ Server Action (نجاح أو خطأ).</li>
          <li><b>Route Handler</b>: نقطة API في ملف <code>route.js</code> ترجع JSON أو CSV.</li>
          <li><b>المسار الديناميكي [code]</b>: ملف واحد يخدم كل الأدوية، و<code>params</code> في Next 16 نستخدم معه <code>await</code>.</li>
          <li><b>searchParams</b>: قراءة <code>?page=2</code> للفلترة والتقسيم لصفحات.</li>
          <li><b>connection()</b>: يجعل الصفحة تُبنى عند كل طلب لتعرض بيانات حديثة.</li>
          <li><b>revalidatePath()</b>: بعد أي تعديل يعيد بناء الصفحات لتظهر الأرقام الجديدة.</li>
          <li><b>next/font/local</b>: الخطوط داخل المشروع فتعمل بدون إنترنت.</li>
          <li><b>output: standalone</b>: نسخة تشغيل جاهزة بدون <code>npm install</code>.</li>
        </ul>}
      />

      <Section title="5. Database (PostgreSQL)" titleAr="٥. قاعدة البيانات"
        en={<table>
          <tbody>
            {[
              ['medicines', '1,000 items: class, criticality, supplier, cost, lead time, service level'],
              ['warehouses', '5 stores (Riyadh main, outpatient, oncology, Jeddah, Madinah)'],
              ['daily_demand', '~1M rows: units issued per medicine per day (Oct 2023 → Sep 2026)'],
              ['movements', '~300k rows: append-only ledger (trigger blocks UPDATE/DELETE)'],
              ['lots', 'current stock per lot + warehouse + expiry date'],
              ['model_backtests', '9 rows per medicine: MAPE, RMSE, MAE, is_selected'],
              ['forecasts', '90 future days per medicine from the selected model'],
              ['replenishment', 'on hand, ROP, safety stock, coverage, projected stockout, status'],
              ['alerts / purchase_orders', 'work queues for the team'],
              ['audit_log', 'who did what and when'],
              ['v_on_hand (view)', 'SUM(lots.qty) per medicine']
            ].map(([k, v]) => <tr key={k}><td className="mono" style={{ whiteSpace: 'nowrap', paddingLeft: 0 }}>{k}</td><td style={{ fontSize: 13.5 }}>{v}</td></tr>)}
          </tbody>
        </table>}
        ar={<>
          <p>البيانات الضخمة موجودة في PostgreSQL وليس في Excel. أهم الجداول:</p>
          <ul>
            <li><code>daily_demand</code>: حوالي مليون صف، الكمية المصروفة لكل دواء في كل يوم.</li>
            <li><code>movements</code>: سجل الحركات (استلام، صرف، تحويل، إتلاف) ولا يمكن تعديله أو حذفه.</li>
            <li><code>lots</code>: المخزون الحالي لكل دفعة مع المستودع وتاريخ الانتهاء.</li>
            <li><code>model_backtests</code> و<code>forecasts</code>: نتائج النماذج والتنبؤ لـ 90 يوماً.</li>
            <li><code>replenishment</code>: نقطة إعادة الطلب ومخزون الأمان والتغطية والحالة.</li>
            <li><code>alerts</code> و<code>purchase_orders</code> و<code>audit_log</code>: قوائم العمل وسجل التدقيق.</li>
          </ul>
          <p>ولماذا ليس Excel؟ Excel يتوقف عند 1,048,576 صفاً، ولا يدعم عدة مستخدمين في نفس الوقت ولا الصلاحيات ولا المعاملات (transactions).</p>
        </>}
      />

      <Section title="6. Data flow" titleAr="٦. مسار البيانات"
        en={<ol>
          <li><code>npm run seed</code> creates the tables and generates demand inside PostgreSQL with <code>generate_series</code>.</li>
          <li>For each medicine, <code>lib/forecast.js</code> backtests 9 models and stores scores + a 90-day forecast.</li>
          <li><code>RECOMPUTE_SQL</code> (lib/replenishment.js) calculates ROP, coverage and status from forecasts and lots.</li>
          <li>Alerts and purchase-order drafts are inserted for items that need action.</li>
          <li>Pages read these tables. When you post a movement, lots change → that medicine is recomputed → alerts/POs update.</li>
        </ol>}
        ar={<ol>
          <li>أمر <code>npm run seed</code> ينشئ الجداول ويولّد بيانات الطلب داخل PostgreSQL باستخدام <code>generate_series</code>.</li>
          <li>لكل دواء يختبر <code>lib/forecast.js</code> النماذج التسعة ويحفظ النتائج والتنبؤ لـ 90 يوماً.</li>
          <li><code>RECOMPUTE_SQL</code> يحسب نقطة إعادة الطلب والتغطية والحالة من التنبؤ والدفعات.</li>
          <li>تُضاف التنبيهات ومسودات طلبات الشراء للأدوية التي تحتاج إجراء.</li>
          <li>الصفحات تقرأ هذه الجداول، وعند تسجيل حركة تتغير الدفعات ويُعاد حساب الدواء وتتحدث التنبيهات.</li>
        </ol>}
      />

      <Section title="7. How to run" titleAr="٧. طريقة التشغيل"
        en={<>
          <p><b>Development (VS Code):</b></p>
          <pre className="mono" style={{ background: '#f6f8f7', padding: 12, borderRadius: 10 }}>{`npm install
npm run seed      # ~3-5 minutes, builds ./pgdata
npm run dev       # http://localhost:3000`}</pre>
          <p><b>Offline build (no npm install):</b> double-click <code>1-Setup-Database.bat</code> once, then <code>2-Start-Website.bat</code>.</p>
          <p><b>Real PostgreSQL server:</b> create a database, put <code>DATABASE_URL=postgres://user:pass@localhost:5432/medicine_inventory</code> in <code>.env</code>, then run the seed.</p>
        </>}
        ar={<>
          <p><b>للتطوير في VS Code:</b> نفّذي <code>npm install</code> ثم <code>npm run seed</code> (من 3 إلى 5 دقائق) ثم <code>npm run dev</code> وافتحي <code>http://localhost:3000</code>.</p>
          <p><b>النسخة الجاهزة بدون إنترنت:</b> اضغطي مرتين على <code>1-Setup-Database.bat</code> مرة واحدة فقط، ثم <code>2-Start-Website.bat</code>.</p>
          <p><b>مع سيرفر PostgreSQL حقيقي:</b> أنشئي قاعدة بيانات وضعي <code>DATABASE_URL</code> في ملف <code>.env</code> ثم شغّلي التهيئة.</p>
        </>}
      />

      <Section title="8. Pages" titleAr="٨. الصفحات"
        en={<ul>
          <li><Link href="/">Dashboard</Link> — KPIs and replenishment risk, row drawer with the full calculation.</li>
          <li><Link href="/medicines">Medicines</Link> — catalogue with filters; detail page per medicine.</li>
          <li><Link href="/alerts">Alerts</Link> — acknowledge / resolve (Server Actions).</li>
          <li><Link href="/movements">Movements</Link> — post receipts, issues, transfers (transaction + FEFO).</li>
          <li><Link href="/purchasing">Purchasing</Link> — pharmacist approves purchase-order drafts.</li>
          <li><Link href="/analytics">Analytics</Link> — live aggregations over 1M rows.</li>
          <li><Link href="/forecast-models">Forecast models</Link> — the 9 models and selection rule.</li>
          <li><Link href="/audit">Audit log</Link> — traceability.</li>
        </ul>}
        ar={<ul>
          <li><Link href="/">لوحة التحكم</Link>: المؤشرات وجدول خطر إعادة الطلب مع تفاصيل كل دواء.</li>
          <li><Link href="/medicines">الأدوية</Link>: القائمة الكاملة مع الفلاتر وصفحة لكل دواء.</li>
          <li><Link href="/alerts">التنبيهات</Link>: استلام وحل التنبيهات.</li>
          <li><Link href="/movements">الحركات</Link>: تسجيل الاستلام والصرف والتحويل.</li>
          <li><Link href="/purchasing">المشتريات</Link>: اعتماد الصيدلي لطلبات الشراء.</li>
          <li><Link href="/analytics">التحليلات</Link>: رسوم بيانية من مليون صف.</li>
          <li><Link href="/forecast-models">نماذج التنبؤ</Link>: النماذج التسعة وقاعدة الاختيار.</li>
          <li><Link href="/audit">سجل التدقيق</Link>: تتبع كل العمليات.</li>
        </ul>}
      />
    </main>
  );
}
