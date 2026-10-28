import Link from 'next/link';

// Shown when notFound() is called or a URL does not exist
export default function NotFound() {
  return (
    <main className="container section">
      <h1 className="page-title">Not found</h1>
      <p className="lead">This page or medicine does not exist. <Link href="/">Back to the dashboard</Link></p>
    </main>
  );
}
