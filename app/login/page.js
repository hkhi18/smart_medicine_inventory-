// /login (public page). Plain HTML forms post to /api/auth/login and /api/auth/signup,
// which set the session cookie and redirect back here with ?error=1 or ?signup=<code> on problems.
import { ORGS } from '@/lib/orgs';

export const dynamic = 'force-dynamic';

const SIGNUP_MESSAGES = {
  invalid: 'Check the form: user name 3-30 characters (letters, numbers, dot, dash, underscore), full name and organization are required.',
  weak: 'Password must be 8 to 100 characters.',
  exists: 'This user name is already taken.'
};

export default async function LoginPage({ searchParams }) {
  const sp = await searchParams;
  const loginError = sp.error === '1';
  const signupError = SIGNUP_MESSAGES[sp.signup] || null;

  return (
    <main>
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-card-head">Log in</div>
          <div className="login-card-body">
            {loginError && <div className="notice err">Wrong user name or password.</div>}
            <form method="post" action="/api/auth/login">
              <div className="login-fields">
                <div className="login-field">
                  <label htmlFor="username">User name</label>
                  <input id="username" name="username" autoComplete="username" required autoFocus />
                </div>
                <div className="login-field">
                  <label htmlFor="password">Password</label>
                  <input id="password" name="password" type="password" autoComplete="current-password" required />
                </div>
              </div>
              <button className="login-btn" type="submit">Log in</button>
            </form>
          </div>
        </div>

        <details className="login-card" open={Boolean(signupError)} style={{ marginTop: 20 }}>
          <summary className="login-card-head" style={{ cursor: 'pointer' }}>Create an account</summary>
          <div className="login-card-body">
            {signupError && <div className="notice err">{signupError}</div>}
            <form method="post" action="/api/auth/signup">
              <div className="login-fields">
                <div className="login-field">
                  <label htmlFor="full_name">Full name</label>
                  <input id="full_name" name="full_name" maxLength={80} required />
                </div>
                <div className="login-field">
                  <label htmlFor="org">Organization</label>
                  <select id="org" name="org" required defaultValue="">
                    <option value="" disabled>Choose…</option>
                    {Object.values(ORGS).map((o) => (
                      <option key={o.key} value={o.key}>{o.name}</option>
                    ))}
                  </select>
                </div>
                <div className="login-field">
                  <label htmlFor="new_username">User name</label>
                  <input id="new_username" name="username" autoComplete="username" pattern="[A-Za-z0-9._\-]{3,30}" required />
                </div>
                <div className="login-field">
                  <label htmlFor="new_password">Password (8 characters or more)</label>
                  <input id="new_password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={100} required />
                </div>
              </div>
              <button className="login-btn" type="submit">Create account</button>
            </form>
          </div>
        </details>

        <p className="footer">Demo accounts: kf1001, kf1002 (KFSHRC) · hb2001, hb2002 (Al Habib)</p>
      </div>
    </main>
  );
}