// URL validation. Two levels:
//  - isHttpUrl: cheap format/protocol check for storing a user-entered job link.
//  - isSafePublicFetchTarget: stricter check used before ANY server-side fetch,
//    to block SSRF to private/internal/link-local hosts.

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const PRIVATE_HOST = /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|::1|fe80:|fc00:|fd00:)/i;

function isPrivateIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  return false;
}

/** Returns true only for a public http(s) URL safe to fetch server-side. */
export function isSafePublicFetchTarget(value: string): boolean {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (PRIVATE_HOST.test(host)) return false;
  if (isPrivateIpv4(host)) return false;
  if (!host.includes(".")) return false; // bare hostnames (metadata services, etc.)
  return true;
}
