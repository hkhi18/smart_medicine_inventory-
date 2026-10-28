// Forecast models page ( /forecast-models ): what each of the 9 models does and how often it wins.
import { connection } from 'next/server';
import Explain from '@/components/Explain';
import Plot from '@/components/Plot';
import { getModelStats, getSetting } from '@/lib/queries';
import { fmtNum, fmtInt } from '@/lib/format';
import { accuracyFromMape, accuracyColor } from '@/lib/metrics';

const INFO = {
  'Naive (baseline)': ['Tomorrow = today. The baseline every other model must beat.', 'الغد = اليوم. هذا هو خط الأساس الذي يجب أن يتفوق عليه أي نموذج آخر.'],
  'Seasonal naive (7d)': ['Tomorrow = same weekday last week. Captures the weekly pattern only.', 'الغد = نفس اليوم من الأسبوع الماضي. يلتقط النمط الأسبوعي فقط.'],
  'SES (alpha 0.3)': ['Simple exponential smoothing: a weighted average where recent days count more (α = 0.3).', 'تمهيد أُسّي بسيط: متوسط موزون يعطي الأيام الأحدث وزناً أكبر (α = 0.3).'],
  'Moving average (28d)': ['Average of the last 28 days, repeated forward.', 'متوسط آخر 28 يوماً ويُكرَّر للمستقبل.'],
  'ARIMA(1,0,1) + weekday': ['Removes the weekday effect, then fits an ARMA(1,1) model: today depends on yesterday (φ) and on yesterday’s error (θ). φ and θ are chosen by grid search minimising squared errors.', 'يزيل تأثير يوم الأسبوع ثم يطبّق ARMA(1,1): قيمة اليوم تعتمد على الأمس (φ) وعلى خطأ الأمس (θ). يتم اختيار φ و θ بالبحث الشبكي لأقل مجموع مربعات خطأ.'],
  'ETS (Holt-Winters, weekly)': ['Level + trend + 7-day seasonality, each updated with its own smoothing factor (additive Holt-Winters).', 'مستوى + اتجاه + موسمية أسبوعية، كل منها يتحدث بمعامل تمهيد خاص (Holt-Winters الجمعي).'],
  'Random forest': ['15 regression trees trained on weekday and lags 7/14/28 days; the average of the trees is the forecast (recursive, day by day).', '15 شجرة انحدار تتدرب على يوم الأسبوع وقيم قبل 7 و14 و28 يوماً؛ متوسط الأشجار هو التنبؤ (يوماً بيوم).'],
  'Hybrid ARIMA + RF': ['Average of ARIMA and Random forest — combines the statistical and machine-learning views.', 'متوسط ARIMA و Random forest — يجمع بين النظرة الإحصائية وتعلم الآلة.'],
  'Croston (SBA, intermittent)': ['For medicines used on few days: forecasts demand size and interval separately, with the Syntetos-Boylan bias correction.', 'للأدوية ذات الاستخدام المتقطع: يتنبأ بحجم الطلب والفترة بين الطلبات كلٌّ على حدة مع تصحيح Syntetos-Boylan.']
};

export default async function ForecastModelsPage() {
  await connection();
  const [stats, cutoff] = await Promise.all([getModelStats(), getSetting('training_cutoff')]);
  const ordered = Object.keys(INFO).map((name) => stats.find((s) => s.model === name) || { model: name });
  const winners = [...stats].sort((a, b) => a.times_selected - b.times_selected);

  return (
    <main className="container section">
      <h1 className="page-title">Forecast models</h1>
      <p className="lead">Every medicine gets its own model. All 9 models are backtested on the medicine’s own history (rolling origin,
        3 folds × 28 days, training cutoff {cutoff}); the one with the lowest MAPE that beats the naive baseline is selected.</p>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-head"><div><h3>How often each model wins</h3><p>Number of medicines where the model was selected</p></div></div>
          <div className="card-body">
            <Plot data={[{ y: winners.map((w) => w.model), x: winners.map((w) => w.times_selected), type: 'bar', orientation: 'h', marker: { color: '#005c2c' } }]}
              layout={{ margin: { l: 200, r: 16, t: 10, b: 40 }, yaxis: { tickformat: '' } }} height={360} />
          </div>
        </div>
        <div className="card">
          <div className="card-head"><div><h3>The selection rule</h3><p>Same rule for every medicine — no manual picking</p></div></div>
          <div className="card-body" style={{ fontSize: 14.5, color: 'var(--ink-2)' }}>
            <ol style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 8 }}>
              <li>Take the last 365 days of demand (needs at least 120 days, else <code>insufficient_history</code>).</li>
              <li>Hide the last 28 days, train each model on the days before, forecast the hidden 28 days, measure the error. Repeat for 3 origins (folds).</li>
              <li>Average the errors: <b>MAPE</b> (% error), <b>RMSE</b> (penalises big misses), <b>MAE</b> (average miss in units).</li>
              <li>Pick the lowest MAPE that is better than Naive. If none is better, keep Naive.</li>
              <li>Retrain the winner on all 365 days and forecast 90 days ahead → table <code>forecasts</code>.</li>
              <li>The winner’s RMSE feeds the safety stock: worse model ⇒ bigger buffer.</li>
            </ol>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><div><h3>All 9 models</h3><p>Average backtest scores across all medicines</p></div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Model</th><th>What it does</th><th dir="rtl">ماذا يفعل</th><th className="num">Selected</th><th className="num">Avg MAPE</th> <th className="num">Accuracy %</th><th className="num">Avg RMSE</th></tr></thead>
            <tbody>
              {ordered.map((s) => (
                <tr key={s.model}>
                  <td className="med-name" style={{ whiteSpace: 'nowrap' }}>{s.model}</td>
                  <td style={{ fontSize: 13.5, color: 'var(--ink-2)', maxWidth: 320 }}>{INFO[s.model][0]}</td>
                  <td dir="rtl" style={{ fontSize: 14, color: 'var(--ink-2)', maxWidth: 320 }}>{INFO[s.model][1]}</td>
                  <td className="num">{fmtInt(s.times_selected)}</td>
                  <td className="num">{s.avg_mape == null ? '—' : `${fmtNum(s.avg_mape)}%`}</td>
                    <td
  className="num"
  style={
    s.avg_mape == null
      ? undefined
      : { color: accuracyColor(accuracyFromMape(Number(s.avg_mape))), fontWeight: 600 }
  }
>
  {s.avg_mape == null ? '—' : `${fmtNum(accuracyFromMape(Number(s.avg_mape)))}%`}
</td>
                  <td className="num">{s.avg_rmse == null ? '—' : fmtNum(s.avg_rmse, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Explain
        concepts={['lib/forecast.js (pure JavaScript)', 'Rolling-origin backtest', 'MAPE / RMSE / MAE', 'Model selection', 'Table model_backtests', 'Table forecasts']}
        en={<>
          <h4>Where the models run</h4>
          <p>The models are written in plain JavaScript in <code>lib/forecast.js</code> (no black-box library), so every formula can be read.
            They run once in <code>scripts/seed.mjs</code> (“training”), and the results are stored in PostgreSQL:
            <code> model_backtests</code> (9 rows per medicine) and <code>forecasts</code> (90 days per medicine). The website only reads them.</p>
          <h4>Why backtesting?</h4>
          <p>A model can look good on the data it learned from and still forecast badly. Backtesting hides recent weeks, forecasts them, and compares with
            what really happened — the same situation as forecasting the real future.</p>
          <h4>Why MAPE must beat Naive</h4>
          <p>If a complex model cannot beat “tomorrow = today”, it adds risk without value, so Naive is kept.</p>
        </>}
        ar={<>
          <h4>أين تعمل النماذج؟</h4>
          <p>النماذج مكتوبة بـ JavaScript عادية في <code>lib/forecast.js</code> بدون مكتبة غامضة، فيمكن قراءة كل معادلة. تعمل مرة واحدة
            في <code>scripts/seed.mjs</code> (مرحلة التدريب) وتُحفظ النتائج في PostgreSQL: جدول <code>model_backtests</code>
            (9 صفوف لكل دواء) وجدول <code>forecasts</code> (90 يوماً لكل دواء). الموقع يقرأ النتائج فقط.</p>
          <h4>لماذا الاختبار الرجعي (Backtest)؟</h4>
          <p>قد يبدو النموذج ممتازاً على البيانات التي تعلّم منها لكنه يتنبأ بشكل سيئ. لذلك نخفي آخر أسابيع ونتنبأ بها ثم نقارن بالواقع،
            وهذا يشبه التنبؤ بالمستقبل الحقيقي.</p>
          <h4>لماذا يجب التفوق على Naive؟</h4>
          <p>إذا لم يستطع نموذج معقد أن يتفوق على «الغد = اليوم» فهو يضيف مخاطرة بلا فائدة، لذلك نحتفظ بـ Naive.</p>
        </>}
      />
    </main>
  );
}
