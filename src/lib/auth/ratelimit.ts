import "server-only";
import type { NextRequest } from "next/server";

// Fixed-window, in-memory rate limiter for unauthenticated endpoints (login,
// signup) to blunt brute-force and mass-signup abuse. It is per-process: for a
// multi-instance / serverless deployment, back this with a shared store (e.g.
// Redis) so limits are enforced across instances. Single-instance deploys are
// fully covered as-is. bcrypt already makes each guess expensive; this caps the
// rate on top of that.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number) {
  // Occasionally drop expired buckets so the map does not grow unbounded.
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
}

export interface RateResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

/** Read-only check: is this key still under the limit? Does not consume. */
export function checkRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateResult {
  sweep(now);
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) return { allowed: true, remaining: limit, retryAfterSec: 0 };
  if (b.count >= limit) return { allowed: false, remaining: 0, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  return { allowed: true, remaining: limit - b.count, retryAfterSec: 0 };
}

/** Count one attempt against the key's current window (creating it if needed). */
export function recordAttempt(key: string, windowMs: number, now = Date.now()): void {
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) buckets.set(key, { count: 1, resetAt: now + windowMs });
  else b.count++;
}

/** Clears a key's window, e.g. after a successful login. */
export function clearRateLimit(key: string): void {
  buckets.delete(key);
}

/** Best-effort client IP from proxy headers, falling back to a constant. */
export function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

// Tuned defaults: generous for humans, restrictive for bots.
export const LOGIN_LIMIT = 10; // failed attempts
export const LOGIN_WINDOW_MS = 10 * 60_000;
export const SIGNUP_LIMIT = 8; // attempts (success or fail)
export const SIGNUP_WINDOW_MS = 60 * 60_000;

// Test-only reset.
export function __resetAllRateLimits() {
  buckets.clear();
  lastSweep = 0;
}
