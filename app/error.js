'use client';
// Error boundary: shown if a page throws (e.g. database not seeded yet)
export default function Error({ error, reset }) {
  return (
    <main className="container section">
      <h1 className="page-title">Something went wrong</h1>
      <div className="notice err">{error.message}</div>
      <p>If the database is empty, run <code>npm run seed</code> first (or double-click <b>1-Setup-Database</b>).</p>
      <button className="btn primary" onClick={() => reset()}>Try again</button>
    </main>
  );
}
