// POST /api/auth/signup (form post from /login): creates the account and signs the new user in.
import { NextResponse } from 'next/server';
import { createUser, logAudit, actorLabel } from '@/lib/auth';
import { COOKIE_NAME, signSession, MAX_AGE_SECONDS } from '@/lib/session';
import { ORGS } from '@/lib/orgs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const back = (req, code) => NextResponse.redirect(new URL(`/login?signup=${code}`, req.url), 303);

export async function POST(req) {
  const form = await req.formData();
  const username = String(form.get('username') || '').trim().toLowerCase();
  const fullName = String(form.get('full_name') || '').trim();
  const password = String(form.get('password') || '');
  const org = String(form.get('org') || '');

  if (!/^[a-z0-9._-]{3,30}$/.test(username) || !fullName || fullName.length > 80 || !ORGS[org]) return back(req, 'invalid');
  if (password.length < 8 || password.length > 100) return back(req, 'weak');

  const user = await createUser({ username, fullName, org, password });
  if (!user) return back(req, 'exists');

  await logAudit(actorLabel(user), 'signup', 'users', `${user.username} (${ORGS[org].short})`);

  // Sign the new user in right away
  const res = NextResponse.redirect(new URL('/', req.url), 303);
  res.cookies.set(COOKIE_NAME, await signSession(user.username), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS
  });
  return res;
}
