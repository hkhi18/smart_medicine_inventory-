// POST /api/auth/login  (form post from /login): checks the password and sets the session cookie.
import { NextResponse } from 'next/server';
import { findUser, verifyPassword, logAudit, actorLabel } from '@/lib/auth';
import { COOKIE_NAME, signSession, MAX_AGE_SECONDS } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  const form = await req.formData();
  const username = String(form.get('username') || '').trim().toLowerCase();
  const password = String(form.get('password') || '');
  const user = username ? await findUser(username) : null;

  if (!user || !verifyPassword(password, user.password_hash)) {
    await logAudit(username || 'unknown', 'login_failed', 'session', 'Wrong user name or password');
    return NextResponse.redirect(new URL('/login?error=1', req.url), 303);
  }

  await logAudit(actorLabel(user), 'login', 'session', user.username);
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
