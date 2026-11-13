import { Logo } from "@/components/Logo";
import { MobileNav } from "@/components/MobileNav";
import { SidebarNav } from "@/components/Sidebar";
import { getCurrentUser } from "@/lib/auth/current";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Real session validation (middleware only checked cookie presence).
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/app");

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-ink focus:px-3 focus:py-1.5 focus:text-surface"
      >
        Skip to content
      </a>

      {/* Desktop navigation rail */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-stone-200 bg-sidebar px-4 py-5 lg:flex">
        <div className="px-2">
          <Logo href="/app" />
        </div>
        <div className="mt-7 flex-1 overflow-y-auto">
          <SidebarNav />
        </div>
        <div className="mt-4 border-t border-stone-300/70 pt-3">
          <p className="truncate px-2.5 text-xs text-ink-muted" title={user.email}>
            {user.email}
          </p>
          <form method="post" action="/api/auth/logout" className="mt-2">
            <button type="submit" className="btn-ghost btn-sm w-full justify-start px-2.5">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile top bar + drawer */}
      <MobileNav email={user.email} />

      <main id="main" className="min-w-0">
        <div className="page max-w-content">{children}</div>
      </main>
    </div>
  );
}
