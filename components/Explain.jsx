// Bilingual explanation panel shown at the bottom of every page (English + Arabic).
// Props: en / ar = JSX content, concepts = list of Next.js / SQL concepts used on the page.
export default function Explain({ en, ar, concepts = [], open = true }) {
  return (
    <details className="explain" open={open}>
      <summary>
        <span>How this page works · كيف تعمل هذه الصفحة</span>
        <span aria-hidden="true">▾</span>
      </summary>
      <div className="explain-cols">
        <div className="explain-col" dir="ltr" lang="en">
          {en}
          {concepts.length > 0 && (
            <>
              <h4>Concepts used</h4>
              <div>{concepts.map((c) => <span key={c} className="tag">{c}</span>)}</div>
            </>
          )}
        </div>
        <div className="explain-col" dir="rtl" lang="ar">{ar}</div>
      </div>
    </details>
  );
}
