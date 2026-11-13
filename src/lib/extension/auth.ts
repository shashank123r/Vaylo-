import "server-only";
import { resolveExtensionToken } from "./pairing";
import type { User } from "@prisma/client";

export function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ?? null;
}

/** Resolves the extension-authenticated user from the Authorization header. */
export async function requireExtensionUser(req: Request): Promise<User | null> {
  return resolveExtensionToken(bearerToken(req));
}
