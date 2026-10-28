// Analytics page ( /analytics ): live SQL aggregations over ~1M demand rows, drawn with Plotly.
import { connection } from 'next/server';
import AnalyticsCharts from '@/components/AnalyticsCharts';
import Explain from '@/components/Explain';
import { getAnalytics, getHeroStats } from '@/lib/queries';
import { timed } from '@/lib/db';
import { fmtInt } from '@/lib/format';

export default async function AnalyticsPage() {
  await connection();
  const [{ result: data, ms }, hero] = await Promise.all([timed(getAnalytics), getHeroStats()]);

  return (
    <main className="container section">
      <h1 className="page-title">Data analysis</h1>
      <p className="lead">Aggregations run live in PostgreSQL over {fmtInt(hero.demand_rows)} demand rows and {fmtInt(hero.ledger_rows)} movements — this page took {fmtInt(ms)} ms.</p>
      <AnalyticsCharts d={data} />

      <Explain
        concepts={['Server-side aggregation', 'GROUP BY / SUM', "date_trunc('month')", 'JOIN', 'CASE buckets', 'Props from Server → Client Component', 'Dynamic import of Plotly']}
        en={<>
          <h4>What you see</h4>
          <ul>
            <li><b>Monthly demand</b>: total units per month — dips show Ramadan and Eid when elective activity drops.</li>
            <li><b>Demand by class</b> and <b>Top 10</b>: where the volume is (IV fluids and antibiotics dominate).</li>
            <li><b>Stock status</b>: how many medicines are healthy vs. need action.</li>
            <li><b>Stock value by warehouse</b>: money tied up in inventory (qty × unit cost).</li>
            <li><b>Lots by time to expiry</b>: risk of waste — red bars need action first.</li>
            <li><b>Weekday pattern</b>: why the forecast models include a weekday effect.</li>
          </ul>
          <h4>How it works</h4>
          <p>The heavy work happens <b>in PostgreSQL</b>, not in the browser and not in Excel: <code>getAnalytics()</code> runs 7
            <code> GROUP BY</code> queries in parallel and sends only the small result (a few hundred numbers) to the page.
            Sending 1M rows to the browser would be slow; aggregating in the database is the right pattern for big data.
            The server passes the results as props to <code>AnalyticsCharts</code> (Client Component), which draws them with Plotly.</p>
        </>}
        ar={<>
          <h4>ماذا ترى؟</h4>
          <ul>
            <li><b>الطلب الشهري</b>: إجمالي الوحدات كل شهر، والانخفاضات تظهر في رمضان والعيد.</li>
            <li><b>الطلب حسب الفئة</b> و<b>أعلى 10 أدوية</b>: أين يتركز الاستهلاك (المحاليل والمضادات الحيوية).</li>
            <li><b>حالة المخزون</b>: عدد الأدوية السليمة مقابل التي تحتاج إجراء.</li>
            <li><b>قيمة المخزون لكل مستودع</b>: الأموال المجمّدة في المخزون (الكمية × التكلفة).</li>
            <li><b>الدفعات حسب قرب الانتهاء</b>: خطر الهدر، والأعمدة الحمراء أولوية.</li>
            <li><b>نمط أيام الأسبوع</b>: سبب إضافة تأثير اليوم في نماذج التنبؤ (الجمعة والسبت عطلة).</li>
          </ul>
          <h4>كيف تعمل؟</h4>
          <p>العمل الثقيل يتم <b>داخل PostgreSQL</b> وليس في المتصفح ولا في Excel: الدالة <code>getAnalytics()</code> تنفّذ 7
            استعلامات <code>GROUP BY</code> بالتوازي وترسل نتيجة صغيرة فقط للصفحة. إرسال مليون صف للمتصفح بطيء، والتجميع داخل
            قاعدة البيانات هو الأسلوب الصحيح مع البيانات الضخمة. ثم يمرّر السيرفر النتائج كـ props إلى <code>AnalyticsCharts</code>
            الذي يرسمها بمكتبة Plotly.</p>
        </>}
      />
    </main>
  );
}
