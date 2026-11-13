"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { SidebarNav } from "./Sidebar";
import { IconMenu, IconClose } from "./icons";

// Top bar + slide-in drawer for small screens, where the desktop rail is hidden.
// Without it, mobile users would have no way to navigate the app.
export function MobileNav({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on route change. Done here (not in each link's onClick) so we never
  // unmount the <a> mid-click and cancel Next's client-side navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="lg:hidden">
      <div className="flex h-14 items-center justify-between border-b border-stone-200 bg-surface px-5">
        <Logo href="/app" />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-ghost"
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="mobile-drawer"
        >
          <IconMenu aria-hidden="true" />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/25 animate-fade-in"
          />
          <div
            id="mobile-drawer"
            className="absolute left-0 top-0 flex h-full w-[82%] max-w-xs flex-col bg-sidebar px-4 py-4 shadow-pop animate-fade-in"
          >
            <div className="mb-5 flex items-center justify-between px-1">
              <Logo href="/app" />
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost" aria-label="Close menu">
                <IconClose aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SidebarNav onNavigate={() => setOpen(false)} />
            </div>
            <div className="mt-4 border-t border-stone-300/70 pt-3">
              <p className="truncate px-2.5 text-xs text-ink-muted">{email}</p>
              <form method="post" action="/api/auth/logout" className="mt-2">
                <button type="submit" className="btn-secondary btn-sm w-full">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
