import { NextRequest, NextResponse } from "next/server";
import { signup } from "@/lib/auth/service";
import { createSession, SESSION_COOKIE, sessionCookieOptions, requestIsHttps } from "@/lib/auth/session";
import { signupSchema } from "@/lib/validation";
import { safeNext, externalUrl } from "@/lib/http/intent";
import { logger } from "@/lib/logger";
import { checkRateLimit, recordAttempt, clientIp, SIGNUP_LIMIT, SIGNUP_WINDOW_MS } from "@/lib/auth/ratelimit";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const next = safeNext(String(form.get("next") ?? "")) ?? "/app";
  const backTo = `/signup?next=${encodeURIComponent(next)}`;

  // Cap new-account creation per client to deter mass/bot signups (production only).
  const limited = process.env.NODE_ENV === "production";
  const rlKey = `signup:${clientIp(req)}`;
  if (limited) {
    const gate = checkRateLimit(rlKey, SIGNUP_LIMIT, SIGNUP_WINDOW_MS);
    if (!gate.allowed) {
      const mins = Math.ceil(gate.retryAfterSec / 60);
      const msg = `Too many sign-up attempts. Try again in about ${mins} minute${mins === 1 ? "" : "s"}.`;
      return NextResponse.redirect(externalUrl(req, `${backTo}&error=${encodeURIComponent(msg)}`), 303);
    }
    recordAttempt(rlKey, SIGNUP_WINDOW_MS);
  }

  const parsed = signupSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
    name: form.get("name") || undefined,
  });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input.";
    return NextResponse.redirect(externalUrl(req, `${backTo}&error=${encodeURIComponent(msg)}`), 303);
  }

  const result = await signup(parsed.data);
  if (!result.ok) {
    return NextResponse.redirect(externalUrl(req, `${backTo}&error=${encodeURIComponent(result.error)}`), 303);
  }

  const { token, expiresAt } = await createSession(result.user.id);
  logger.info({ userId: result.user.id }, "user signed up");
  const res = NextResponse.redirect(externalUrl(req, next), 303);
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt, requestIsHttps(req.headers)));
  return res;
}
