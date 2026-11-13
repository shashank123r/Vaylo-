import { NextRequest, NextResponse } from "next/server";
import { login } from "@/lib/auth/service";
import { createSession, SESSION_COOKIE, sessionCookieOptions, requestIsHttps } from "@/lib/auth/session";
import { loginSchema } from "@/lib/validation";
import { safeNext, externalUrl } from "@/lib/http/intent";
import { logger } from "@/lib/logger";
import {
  checkRateLimit,
  recordAttempt,
  clearRateLimit,
  clientIp,
  LOGIN_LIMIT,
  LOGIN_WINDOW_MS,
} from "@/lib/auth/ratelimit";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const next = safeNext(String(form.get("next") ?? "")) ?? "/app";
  const backTo = `/login?next=${encodeURIComponent(next)}`;
  // Rate limiting is a production concern; off in dev/test so it never throttles
  // local work or the test harness (which share one client identity).
  const limited = process.env.NODE_ENV === "production";
  const rlKey = `login:${clientIp(req)}`;

  // Too many recent failed attempts from this client? Make them wait.
  if (limited) {
    const gate = checkRateLimit(rlKey, LOGIN_LIMIT, LOGIN_WINDOW_MS);
    if (!gate.allowed) {
      const mins = Math.ceil(gate.retryAfterSec / 60);
      const msg = `Too many login attempts. Try again in about ${mins} minute${mins === 1 ? "" : "s"}.`;
      return NextResponse.redirect(externalUrl(req, `${backTo}&error=${encodeURIComponent(msg)}`), 303);
    }
  }

  const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input.";
    return NextResponse.redirect(externalUrl(req, `${backTo}&error=${encodeURIComponent(msg)}`), 303);
  }

  const result = await login(parsed.data);
  if (!result.ok) {
    if (limited) recordAttempt(rlKey, LOGIN_WINDOW_MS); // only failures count toward the limit
    return NextResponse.redirect(externalUrl(req, `${backTo}&error=${encodeURIComponent(result.error)}`), 303);
  }

  if (limited) clearRateLimit(rlKey); // reset on success
  const { token, expiresAt } = await createSession(result.user.id);
  logger.info({ userId: result.user.id }, "user logged in");
  const res = NextResponse.redirect(externalUrl(req, next), 303);
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt, requestIsHttps(req.headers)));
  return res;
}
