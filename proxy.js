// Runs before every request: anyone without a valid session is sent to /login.
import { NextResponse } from 'next/server';
import { COOKIE_NAME, verifySession } from './lib/session';

export async function proxy(request) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth') || pathname.startsWith('/api/whatsapp') || pathname.startsWith('/api/reports')) return NextResponse.next();

  const session = await verifySession(request.cookies.get(COOKIE_NAME)?.value);
  if (session) return NextResponse.next();

  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  return NextResponse.redirect(new URL('/login', request.url));
}

// Skip Next.js internals and any path with a file extension (images, video, fonts)
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)']
};
