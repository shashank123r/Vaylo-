/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

// Content-Security-Policy. Applied in production only: the dev server needs eval
// and websockets for HMR, which a strict policy would break. 'unsafe-inline' is
// required for Next's framework styles/scripts; the remaining directives still
// block object/base-uri/framing/foreign form-action abuse.
const cspProd = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["unpdf", "mammoth", "@prisma/client", "pino"],
  async headers() {
    const headers = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    if (isProd) {
      // HSTS: enforce HTTPS for two years, including subdomains.
      headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" });
      headers.push({ key: "Content-Security-Policy", value: cspProd });
    }
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
