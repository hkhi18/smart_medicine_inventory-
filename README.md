# Smart Medicine Inventory · نظام مخزون الأدوية الذكي

Next.js 16 + PostgreSQL. Drug tracking, demand forecasting (9 models), reorder points, expiry alerts and purchasing for a hospital pharmacy.
**All data is synthetic** (realistic patterns, not real hospital records).

نظام لتتبع مخزون أدوية صيدلية المستشفى مبني بـ Next.js و PostgreSQL: تنبؤ بالطلب بـ 9 نماذج، ونقطة إعادة الطلب، وتنبيهات انتهاء الصلاحية، وطلبات الشراء.
**كل البيانات تجريبية** بأنماط واقعية وليست بيانات حقيقية.

---

## Run · التشغيل

### A) Offline (no `npm install` needed) · بدون إنترنت
1. Double-click **`1-Setup-Database.bat`** once (3–5 min) → builds ~1M rows in `pgdata/` and trains the models.
2. Double-click **`2-Start-Website.bat`** → opens http://localhost:3001

١. اضغطي مرتين على **`1-Setup-Database.bat`** مرة واحدة فقط (من 3 إلى 5 دقائق) لبناء قاعدة البيانات وتدريب النماذج.
٢. اضغطي مرتين على **`2-Start-Website.bat`** ليفتح الموقع على http://localhost:3001

### B) Development in VS Code (needs internet for npm) · للتطوير
```bash
npm install
npm run seed     # build the database
npm run dev      # http://localhost:3000 with hot reload
```

### C) Real PostgreSQL server · سيرفر PostgreSQL حقيقي
```bash
# create the database first:  CREATE DATABASE medicine_inventory;
set DATABASE_URL=postgres://postgres:password@localhost:5432/medicine_inventory
npm run seed
npm run dev
```
Without `DATABASE_URL` the app uses **PGlite** — the real PostgreSQL engine compiled to WebAssembly, stored in `./pgdata`
(no installation or admin rights). Same SQL in both modes.

بدون `DATABASE_URL` يستخدم المشروع **PGlite** وهو محرك PostgreSQL نفسه لكن مدمج داخل المشروع (لا يحتاج تثبيت ولا صلاحيات مدير). نفس أوامر SQL في الحالتين.

> Stop the website before re-running the seed (the embedded database allows one process at a time).
> أوقفي الموقع قبل إعادة تشغيل التهيئة.

---

## Pages · الصفحات
| URL | English | العربية |
|---|---|---|
| `/` | Dashboard: KPIs, replenishment risk, drawer with full ROP calculation | لوحة التحكم ومؤشرات الخطر وتفاصيل حساب نقطة إعادة الطلب |
| `/medicines` | Catalogue + filters, `/medicines/[code]` detail | قائمة الأدوية وصفحة لكل دواء |
| `/alerts` | Acknowledge / resolve alerts (Server Actions) | استلام وحل التنبيهات |
| `/movements` | Post receipts, issues, transfers, write-offs (transaction + FEFO) | تسجيل حركات المخزون |
| `/purchasing` | Pharmacist approves purchase-order drafts | اعتماد طلبات الشراء |
| `/analytics` | Live SQL aggregations over ~1M rows | تحليلات مباشرة من مليون صف |
| `/forecast-models` | The 9 models and the selection rule | نماذج التنبؤ وقاعدة الاختيار |
| `/audit` | Audit log | سجل التدقيق |
| `/guide` | Whole-project explanation | شرح المشروع كاملاً |

Every page ends with a bilingual **“How this page works”** panel.
كل صفحة في آخرها لوحة **«كيف تعمل هذه الصفحة»** بالعربي والإنجليزي.

## Key formulas · المعادلات
- Safety stock = z × RMSE × √L  (z = 2.054 for 98%, 1.645 for 95%, 1.282 for 90%)
- ROP = forecast demand during lead time L + safety stock
- Suggested order = forecast for (L + 30 days) + safety stock − on hand
- Coverage = days until cumulative forecast > on hand; projected stockout = as-of date + coverage + 1
- Model selection = lowest MAPE (3 folds × 28 days) that beats the naive baseline

## Folder map · خريطة المجلدات
```
app/          pages (App Router), actions.js = Server Actions, api/ = Route Handlers
components/   UI components (Header, RiskTable, MedicineDetail, Plot, Explain…)
lib/          db.js, queries.js, forecast.js, replenishment.js, stock.js, roles.js, audit.js
db/schema.sql tables, indexes, view, append-only trigger
scripts/      seed.mjs (data + training), catalog.mjs (medicine list)
```
