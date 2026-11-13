import { describe, it, expect } from "vitest";
import { signup, login } from "@/lib/auth/service";
import { createSession, resolveSession, destroySession } from "@/lib/auth/session";
import { db } from "@/lib/db";

describe("authentication", () => {
  it("signs up a user with a hashed password and an empty profile", async () => {
    const res = await signup({ email: "a@example.com", password: "password123", name: "A" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.user.passwordHash).not.toBe("password123");
    expect(res.user.email).toBe("a@example.com");
    const profile = await db.profile.findUnique({ where: { userId: res.user.id } });
    expect(profile).not.toBeNull();
  });

  it("rejects duplicate emails (case-insensitive)", async () => {
    await signup({ email: "dup@example.com", password: "password123" });
    const again = await signup({ email: "DUP@example.com", password: "password123" });
    expect(again.ok).toBe(false);
  });

  it("logs in with correct credentials and rejects wrong ones", async () => {
    await signup({ email: "b@example.com", password: "correct-horse" });
    expect((await login({ email: "b@example.com", password: "correct-horse" })).ok).toBe(true);
    expect((await login({ email: "b@example.com", password: "wrong" })).ok).toBe(false);
    expect((await login({ email: "missing@example.com", password: "x" })).ok).toBe(false);
  });
});

describe("sessions", () => {
  it("creates, resolves, and destroys a session", async () => {
    const res = await signup({ email: "s@example.com", password: "password123" });
    if (!res.ok) throw new Error("signup failed");
    const { token } = await createSession(res.user.id);

    const resolved = await resolveSession(token);
    expect(resolved?.id).toBe(res.user.id);

    await destroySession(token);
    expect(await resolveSession(token)).toBeNull();
  });

  it("rejects an expired session and cleans it up", async () => {
    const res = await signup({ email: "e@example.com", password: "password123" });
    if (!res.ok) throw new Error("signup failed");
    const { token } = await createSession(res.user.id);
    // Force expiry in the past.
    await db.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await resolveSession(token)).toBeNull();
  });

  it("returns null for a missing/garbage token", async () => {
    expect(await resolveSession(undefined)).toBeNull();
    expect(await resolveSession("not-a-real-token")).toBeNull();
  });
});
