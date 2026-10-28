// Medicine detail page ( /medicines/MED-00001 ). [code] in the folder name = dynamic route segment.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import MedicineDetail from '@/components/MedicineDetail';
import Explain from '@/components/Explain';
import { getMedicineDetail } from '@/lib/queries';

export async function generateMetadata({ params }) {
  const { code } = await params;
  return { title: `${code} · Smart Medicine Inventory` };
}

export default async function MedicinePage({ params }) {
  await connection();
  const { code } = await params;
  const data = await getMedicineDetail(code);
  if (!data) notFound();                      // shows the 404 page
  const { med } = data;

  return (
    <main className="container section">
      <Link href="/medicines">← All medicines</Link>
      <h1 className="page-title" style={{ marginTop: 10 }}>{med.name}</h1>
      <p className="lead">{med.code} · {med.criticality} · {med.therapeutic_class} · {med.supplier} · lead time {med.lead_time_days} days · service level {Math.round(med.service_level * 100)}% · demand history since {med.first_day}</p>
      <div className="stack"><MedicineDetail data={data} /></div>

      <Explain
        concepts={['Dynamic route [code]', 'await params', 'notFound()', 'generateMetadata', 'Shared component (server + drawer)', 'Plotly (client)']}
        en={<>
          <h4>What you see</h4>
          <p>The complete explanation behind one medicine: stock per warehouse, the reorder-point calculation step by step,
            demand history with the 90-day forecast, the backtest of all 9 models, and every lot with its expiry date.</p>
          <h4>How it works</h4>
          <ul>
            <li>The folder <code>app/medicines/[code]</code> creates a <b>dynamic route</b>: <code>/medicines/MED-00165</code>
              gives <code>params.code = 'MED-00165'</code> (in Next.js 16 <code>params</code> is a Promise, so we <code>await</code> it).</li>
            <li>If the code does not exist, <code>notFound()</code> renders the 404 page.</li>
            <li><code>MedicineDetail</code> is the same component used in the dashboard drawer — written once, used in two places.</li>
            <li>The chart is a Client Component that loads Plotly in the browser; the data comes from the server as props.</li>
          </ul>
          <h4>Formula</h4>
          <p>Safety stock = z × RMSE × √L, ROP = forecast demand over L + safety stock. RMSE comes from the backtest, so a model
            that forecasts badly automatically gets a bigger safety buffer.</p>
        </>}
        ar={<>
          <h4>ماذا ترى؟</h4>
          <p>كل التفاصيل خلف دواء واحد: المخزون في كل مستودع، وحساب نقطة إعادة الطلب خطوة بخطوة، وتاريخ الطلب مع التنبؤ لـ 90 يوماً،
            ومقارنة النماذج التسعة، وكل دفعة (lot) مع تاريخ انتهائها.</p>
          <h4>كيف تعمل؟</h4>
          <ul>
            <li>المجلد <code>app/medicines/[code]</code> يصنع <b>مساراً ديناميكياً</b>: الرابط <code>/medicines/MED-00165</code>
              يعطي <code>params.code</code>، وفي Next.js 16 نستخدم <code>await params</code>.</li>
            <li>إذا الكود غير موجود تستدعي الصفحة <code>notFound()</code> وتظهر صفحة 404.</li>
            <li>المكوّن <code>MedicineDetail</code> نفسه المستخدم في النافذة الجانبية بالصفحة الرئيسية، نكتبه مرة ونستخدمه مرتين.</li>
            <li>الرسم البياني Client Component يحمّل Plotly في المتصفح، والبيانات تأتي من السيرفر.</li>
          </ul>
          <h4>المعادلة</h4>
          <p>مخزون الأمان = z × RMSE × √L، ونقطة إعادة الطلب = الطلب المتوقع خلال مدة التوريد + مخزون الأمان. كلما كان خطأ النموذج
            (RMSE) أكبر زاد مخزون الأمان تلقائياً.</p>
        </>}
      />
    </main>
  );
}
