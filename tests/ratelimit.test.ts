import { describe, it, expect, beforeEach } from "vitest";
import {
  checkRateLimit,
  recordAttempt,
  clearRateLimit,
  __resetAllRateLimits,
} from "@/lib/auth/ratelimit";

const WIN = 10_000;

describe("auth rate limiter (fixed window)", () => {
  beforeEach(() => __resetAllRateLimits());

  it("allows up to the limit, then blocks until the window resets", () => {
    const now = 1_000_000;
    const key = "login:1.2.3.4";
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, 5, WIN, now).allowed).toBe(true);
      recordAttempt(key, WIN, now);
    }
    const blocked = checkRateLimit(key, 5, WIN, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);

    // After the window elapses, it allows again.
    expect(checkRateLimit(key, 5, WIN, now + WIN + 1).allowed).toBe(true);
  });

  it("keys are isolated (one client cannot exhaust another's budget)", () => {
    const now = 2_000_000;
    for (let i = 0; i < 5; i++) recordAttempt("login:a", WIN, now);
    expect(checkRateLimit("login:a", 5, WIN, now).allowed).toBe(false);
    expect(checkRateLimit("login:b", 5, WIN, now).allowed).toBe(true);
  });

  it("clearRateLimit resets a key (e.g. after a successful login)", () => {
    const now = 3_000_000;
    for (let i = 0; i < 5; i++) recordAttempt("login:c", WIN, now);
    expect(checkRateLimit("login:c", 5, WIN, now).allowed).toBe(false);
    clearRateLimit("login:c");
    expect(checkRateLimit("login:c", 5, WIN, now).allowed).toBe(true);
  });

  it("checkRateLimit does not consume; only recordAttempt does", () => {
    const now = 4_000_000;
    const key = "login:d";
    for (let i = 0; i < 20; i++) checkRateLimit(key, 3, WIN, now);
    expect(checkRateLimit(key, 3, WIN, now).allowed).toBe(true); // still nothing recorded
    recordAttempt(key, WIN, now);
    recordAttempt(key, WIN, now);
    recordAttempt(key, WIN, now);
    expect(checkRateLimit(key, 3, WIN, now).allowed).toBe(false);
  });
});
