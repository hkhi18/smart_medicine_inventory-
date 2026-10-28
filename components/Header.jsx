// Server Component: reads the signed-in user and applies that organization's logo and theme
import Link from 'next/link';
import NavLinks from './NavLinks';
import { currentUser } from '@/lib/auth';
import { dbMode } from '@/lib/db';
import { ORGS } from '@/lib/orgs';

export default async function Header() {
  const [user, mode] = await Promise.all([currentUser(), dbMode()]);
  const org = ORGS[user?.org] || ORGS.kfshrc;
  return (
    <>
      {org.theme && <style dangerouslySetInnerHTML={{ __html: org.theme }} />}
      <div className="topbar">
        <div className="container">
          <span>{org.topbar}</span>
          <span className="spacer" />
          <span className="badge-version">v2.1.0 · {mode === 'pglite' ? 'PostgreSQL (embedded)' : 'PostgreSQL'}</span>
          {user && (
            <>
              <span className="user-chip">{user.full_name}</span>
              <form method="post" action="/api/auth/logout">
                <button type="submit" className="btn sm">Log out</button>
              </form>
            </>
          )}
        </div>
      </div>
      <header className="header">
        <div className="container">
          <Link href="/" className="brand">
            {user && (org.hasLogo ? <img src={org.logo} alt={org.name} /> : <span className="brand-wordmark">{org.short}</span>)}
            <span className="brand-text" style={user ? undefined : { borderLeft: 'none', paddingLeft: 0 }}>
              <strong>Smart Medicine Inventory</strong>
              <span>Drug tracking &amp; data analysis</span>
            </span>
          </Link>
          {user && <NavLinks />}
        </div>
      </header>
    </>
  );
}
