import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { db } from "@/lib/db";
import type { User } from "@prisma/client";

export const SESSION_COOKIE = "jf_session";
const SESSION_TTL_DAYS = 30;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionCookieOptions(expiresAt: Date, secure: boolean) {
  return {
    httpOnly: true as const,
    // Mark the cookie Secure only when the connection is actually HTTPS. A Secure
    // cookie is dropped by browsers over plain HTTP, which would silently break
    // login/signup when the app is reached over HTTP (e.g. by IP before a domain
    // + TLS is set up). Derived per-request from the proxy's X-Forwarded-Proto.
    secure,
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

/**
 * True when the request arrived over HTTPS, honoring the reverse proxy's
 * X-Forwarded-Proto (Caddy/nginx set this). Falls back to NODE_ENV when no proxy
 * header is present (e.g. direct access with no proxy in front).
 */
export function requestIsHttps(headers: Headers): boolean {
  const proto = headers.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0]!.trim().toLowerCase() === "https";
  return process.env.NODE_ENV === "production";
}

/** Creates a session row (storing only the token hash) and returns the raw token. */
export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  });
  return { token, expiresAt };
}

/** Resolves a raw session token to its user, or null if missing/expired. */
export async function resolveSession(token: string | undefined | null): Promise<User | null> {
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return session.user;
}

export async function destroySession(token: string | undefined | null): Promise<void> {
  if (!token) return;
  await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}
