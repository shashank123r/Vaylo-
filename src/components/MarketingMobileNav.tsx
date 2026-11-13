"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { IconMenu, IconClose } from "./icons";

// Mobile menu for the public marketing header. The desktop nav is hidden on small
// screens (it overflowed), so this provides navigation there.
export function MarketingMobileNav({ authed }: { authed: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false); // close on route change (avoids unmount-mid-click nav cancel)
  }, [pathname]);

  return (
    <div className="sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn-ghost"
        aria-expanded={open}
        aria-controls="marketing-mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
      >
        {open ? <IconClose aria-hidden="true" /> : <IconMenu aria-hidden="true" />}
      </button>

      {open && (
        <div
          id="marketing-mobile-menu"
          className="absolute left-0 right-0 top-14 z-30 border-b border-stone-200 bg-surface px-5 py-3 shadow-card sm:px-8"
        >
          <nav className="flex flex-col gap-1 text-sm" aria-label="Primary">
            <Link href="/jobs" className="btn-ghost no-underline">Browse jobs</Link>
            <Link href="/demo" className="btn-ghost no-underline">How it works</Link>
            <Link href="/pricing" className="btn-ghost no-underline">Pricing</Link>
            {authed ? (
              <Link href="/app" className="btn-primary mt-1 no-underline">Go to app</Link>
            ) : (
              <>
                <Link href="/login" className="btn-ghost no-underline">Sign in</Link>
                <Link href="/signup" className="btn-primary mt-1 no-underline">Create account</Link>
              </>
            )}
          </nav>
        </div>
      )}
    </div>
  );
}
