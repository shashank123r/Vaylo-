import { NextRequest, NextResponse } from "next/server";

// Proxy (formerly "middleware", renamed in Next 16): guards /app/* by cookie
// presence only (no DB here) and, when absent, redirects to /login preserving the
// EXACT requested path + query so the visitor resumes the same workflow after auth.
// Real session validation still happens server-side in the /app layout (defense in
// depth).
//
// Cookie name is inlined on purpose: importing the server-only session module
// (crypto, Prisma) into the edge proxy is not allowed.
const SESSION_COOKIE = "jf_session";

export function proxy(req: NextRequest) {
  const hasCookie = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  if (hasCookie) return NextResponse.next();

  const next = req.nextUrl.pathname + req.nextUrl.search;
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/app/:path*"],
};
