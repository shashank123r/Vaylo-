import Link from "next/link";
import { Logo } from "./Logo";
import { MarketingMobileNav } from "./MarketingMobileNav";
import { getCurrentUser } from "@/lib/auth/current";

export async function MarketingHeader() {
  const user = await getCurrentUser();
  return (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-canvas/95">
      <div className="mx-auto flex h-14 max-w-content items-center justify-between px-5 sm:px-8">
        <Logo />
        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 text-sm sm:flex" aria-label="Primary">
          <Link href="/jobs" className="btn-ghost no-underline">
            Browse jobs
          </Link>
          <Link href="/demo" className="btn-ghost no-underline">
            How it works
          </Link>
          <Link href="/pricing" className="btn-ghost no-underline">
            Pricing
          </Link>
          {user ? (
            <Link href="/app" className="btn-primary ml-1 no-underline">
              Go to app
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn-ghost no-underline">
                Sign in
              </Link>
              <Link href="/signup" className="btn-primary ml-1 no-underline">
                Create account
              </Link>
            </>
          )}
        </nav>
        {/* Mobile: primary CTA stays visible, rest in the menu */}
        <div className="flex items-center gap-2 sm:hidden">
          {user ? (
            <Link href="/app" className="btn-primary no-underline">
              Go to app
            </Link>
          ) : (
            <Link href="/signup" className="btn-primary no-underline">
              Sign up
            </Link>
          )}
          <MarketingMobileNav authed={!!user} />
        </div>
      </div>
    </header>
  );
}
