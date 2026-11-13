// Intent / return-to preservation for the progressive signup flow.
// SECURITY: only same-origin internal paths are ever honored, to prevent open
// redirects. Anything that is not a clean internal path is rejected.

import type { NextRequest } from "next/server";

/**
 * Builds an absolute URL for a redirect using the ORIGINAL external host, not the
 * internal upstream address. Behind a reverse proxy (Caddy/nginx), `req.url`
 * resolves to the container's own origin (e.g. http://localhost:3000), which would
 * send the browser to a dead address after login/signup. We honor the proxy's
 * X-Forwarded-Proto / X-Forwarded-Host (falling back to the Host header, then the
 * request's own URL) so redirects land on the real site the user is visiting.
 */
export function externalUrl(req: NextRequest, path: string): URL {
  const xfProto = (req.headers.get("x-forwarded-proto") ?? "").split(",")[0]?.trim();
  const xfHost = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "")
    .split(",")[0]
    ?.trim();
  const proto = xfProto || req.nextUrl.protocol.replace(/:$/, "");
  const host = xfHost || req.nextUrl.host;
  return new URL(path, `${proto}://${host}`);
}

export function safeNext(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  // Must be a path starting with a single "/" (not "//" or "/\" which browsers
  // treat as protocol-relative external URLs).
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  // Reject embedded scheme or control characters (control-char check is intentional).
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(value) || /^\/.*:\/\//.test(value)) return null;
  // Reject attempts to bounce back to auth pages (avoids loops).
  const pathOnly = value.split("?")[0] ?? value;
  if (pathOnly === "/login" || pathOnly === "/signup") return null;
  return value;
}

/** Builds a login URL that will return the visitor to `next` after auth. */
export function loginUrlFor(next: string): string {
  const safe = safeNext(next) ?? "/app";
  return `/login?next=${encodeURIComponent(safe)}`;
}

export const INTENTS = ["save", "apply", "tailor", "cover"] as const;
export type Intent = (typeof INTENTS)[number];

export function isIntent(v: string | null | undefined): v is Intent {
  return !!v && (INTENTS as readonly string[]).includes(v);
}

/**
 * Destination that imports a demo job into the user's account and continues the
 * intended action. Used as the post-login `next` target for guests who clicked a
 * protected action on a public job.
 */
export function importDestination(demoId: string, intent: Intent): string {
  return `/app/jobs/import?demo=${encodeURIComponent(demoId)}&intent=${intent}`;
}
