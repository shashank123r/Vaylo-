"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINKS, NAV_GROUPS } from "./nav-links";

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === "/app" : pathname === href || pathname.startsWith(href + "/");
}

// Vertical navigation list shared by the desktop rail and the mobile drawer.
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() || "";
  return (
    <nav className="flex flex-col gap-5" aria-label="Primary">
      {NAV_GROUPS.map((group) => (
        <div key={group}>
          <p className="mb-1.5 px-2.5 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-faint">
            {group}
          </p>
          <ul className="flex flex-col gap-0.5">
            {NAV_LINKS.filter((l) => l.group === group).map((l) => {
              const active = isActive(pathname, l.href);
              const Icon = l.icon;
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`nav-item ${active ? "nav-item-active" : ""}`}
                  >
                    <Icon className={active ? "text-brick" : "text-ink-faint"} aria-hidden="true" />
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
