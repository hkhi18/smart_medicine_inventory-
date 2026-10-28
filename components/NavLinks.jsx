'use client';
// Client Component: highlights the current page using the usePathname() hook
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  ['/', 'Dashboard'],
  ['/medicines', 'Medicines'],
  ['/alerts', 'Alerts'],
  ['/movements', 'Movements'],
  ['/purchasing', 'Purchasing'],
  ['/analytics', 'Analytics'],
  ['/forecast-models', 'Forecast models'],
  ['/audit', 'Audit log'],
  ['/guide', 'Guide']
];

export default function NavLinks() {
  const path = usePathname();
  const isActive = (href) => (href === '/' ? path === '/' : path.startsWith(href));
  return (
    <nav className="nav">
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} className={isActive(href) ? 'active' : ''}>{label}</Link>
      ))}
    </nav>
  );
}
