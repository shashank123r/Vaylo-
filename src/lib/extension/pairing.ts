import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { db } from "@/lib/db";
import type { User } from "@prisma/client";

// The extension pairs ONCE and should keep working indefinitely. We use a long
// base lifetime and slide it forward on every authenticated use (see
// resolveExtensionToken), so an extension in regular use never has to re-pair.
// The user can still cut access instantly with Revoke, and a changed extension
// build re-pairs on install.
const PAIR_TTL_DAYS = 3650; // ~10 years
const SLIDE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // renew at most ~weekly

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Issues a fresh pairing token for a user (one active connection per user). */
export async function createPairing(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = `jfx_${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + PAIR_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.extensionConnection.upsert({
    where: { userId },
    update: { tokenHash: hashToken(token), expiresAt, revokedAt: null, lastSeenAt: null },
    create: { userId, tokenHash: hashToken(token), expiresAt },
  });
  return { token, expiresAt };
}

/** Resolves an extension bearer token to its user, enforcing expiry + revocation. */
export async function resolveExtensionToken(token: string | undefined | null): Promise<User | null> {
  if (!token) return null;
  const conn = await db.extensionConnection.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!conn) return null;
  if (conn.revokedAt) return null;
  if (conn.expiresAt.getTime() < Date.now()) return null;
  // Best-effort liveness marker + sliding expiry: while the extension is in use
  // we push expiresAt back out, so an active connection never lapses. We only
  // write when the renewal is material (>~1 week moved) to avoid a DB write on
  // every request.
  const now = Date.now();
  const freshExpiry = new Date(now + PAIR_TTL_DAYS * 24 * 60 * 60 * 1000);
  const shouldSlide = freshExpiry.getTime() - conn.expiresAt.getTime() > SLIDE_THRESHOLD_MS;
  await db.extensionConnection
    .update({
      where: { id: conn.id },
      data: { lastSeenAt: new Date(now), ...(shouldSlide ? { expiresAt: freshExpiry } : {}) },
    })
    .catch(() => {});
  return conn.user;
}

export async function revokePairing(userId: string): Promise<void> {
  await db.extensionConnection.updateMany({ where: { userId }, data: { revokedAt: new Date() } });
}

export async function getConnectionStatus(userId: string) {
  const conn = await db.extensionConnection.findUnique({ where: { userId } });
  const active = !!conn && !conn.revokedAt && conn.expiresAt.getTime() >= Date.now();
  return {
    connected: active,
    lastSeenAt: conn?.lastSeenAt ?? null,
    expiresAt: conn?.expiresAt ?? null,
    revoked: !!conn?.revokedAt,
  };
}
