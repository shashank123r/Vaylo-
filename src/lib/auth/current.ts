import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { SESSION_COOKIE, resolveSession } from "./session";
import { safeNext } from "@/lib/http/intent";

/** Returns the signed-in user or null. Safe to call from any server context. */
export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return resolveSession(token);
}

/**
 * Requires a signed-in user. If absent, redirects to /login and preserves the
 * caller's intended destination so the exact workflow resumes after login.
 */
export async function requireUser(returnTo: string): Promise<User> {
  const user = await getCurrentUser();
  if (user) return user;
  const next = safeNext(returnTo) ?? "/app";
  redirect(`/login?next=${encodeURIComponent(next)}`);
}
