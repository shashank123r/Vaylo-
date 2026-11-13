import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Inter: a modern, highly legible sans used across the product. Self-hosted by
// next/font at build time; the CSS var chain in globals.css falls back to the
// platform UI font if it is ever unavailable.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Absolute base for OpenGraph/canonical URLs. Set NEXT_PUBLIC_SITE_URL (or APP_URL)
// to your deployed origin in production; falls back to localhost for dev.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  // Pages set their own title via `metadata.title`; it renders as "Page · Vaylo".
  title: {
    default: "Vaylo — tailor applications and track your job search",
    template: "%s · Vaylo",
  },
  description: "Tailor applications and track your job search with evidence, not guesswork.",
  applicationName: "Vaylo",
  openGraph: {
    title: "Vaylo",
    description: "Tailor applications and track your job search with evidence, not guesswork.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning tolerates attributes injected by browser extensions
    // (e.g. Bitdefender's bis_skin_checked / bis_register) before React hydrates.
    // It affects only these elements' own attributes, not app markup.
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
