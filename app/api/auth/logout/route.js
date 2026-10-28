// POST /api/auth/logout: records the logout in the audit log and clears the session cookie.
import { NextResponse } from 'next/server';
import { currentUser, logAudit, actorLabel } from '@/lib/auth';
import { COOKIE_NAME } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  const user = await currentUser();
  if (user) await logAudit(actorLabel(user), 'logout', 'session', user.username);

  const res = NextResponse.redirect(new URL('/login', req.url), 303);
  res.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0 });
  return res;
}
