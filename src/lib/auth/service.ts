import "server-only";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "./password";
import type { User } from "@prisma/client";

export type AuthResult =
  | { ok: true; user: User }
  | { ok: false; error: string };

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Creates a user + empty profile. Email uniqueness enforced at DB and here. */
export async function signup(input: {
  email: string;
  password: string;
  name?: string;
}): Promise<AuthResult> {
  const email = normalizeEmail(input.email);
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return { ok: false, error: "An account with that email already exists. Sign in instead." };

  const passwordHash = await hashPassword(input.password);
  const user = await db.user.create({
    data: {
      email,
      name: input.name?.trim() || null,
      passwordHash,
      profile: { create: {} },
    },
  });
  return { ok: true, user };
}

/** Verifies credentials. Uses a constant-ish path to avoid user enumeration. */
export async function login(input: { email: string; password: string }): Promise<AuthResult> {
  const email = normalizeEmail(input.email);
  const user = await db.user.findUnique({ where: { email } });
  const genericError = "Invalid email or password.";
  if (!user) {
    // Run a hash to reduce timing signal, then fail generically.
    await verifyPassword(input.password, "$2a$12$0000000000000000000000000000000000000000000000000000a");
    return { ok: false, error: genericError };
  }
  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) return { ok: false, error: genericError };
  return { ok: true, user };
}
