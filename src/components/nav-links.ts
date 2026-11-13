import type { SVGProps, ReactElement } from "react";
import {
  IconDashboard,
  IconTracker,
  IconAuto,
  IconJobs,
  IconProfile,
  IconExtension,
  IconBilling,
} from "./icons";

export type NavLink = {
  href: string;
  label: string;
  icon: (p: SVGProps<SVGSVGElement>) => ReactElement;
  group: "Workspace" | "Account";
};

// Shared app navigation, used by the desktop sidebar and the mobile drawer.
export const NAV_LINKS: NavLink[] = [
  { href: "/app", label: "Dashboard", icon: IconDashboard, group: "Workspace" },
  { href: "/app/applications", label: "Tracker", icon: IconTracker, group: "Workspace" },
  { href: "/app/auto-apply", label: "Auto-apply", icon: IconAuto, group: "Workspace" },
  { href: "/app/jobs", label: "Browse jobs", icon: IconJobs, group: "Workspace" },
  { href: "/app/profile", label: "Profile", icon: IconProfile, group: "Account" },
  { href: "/app/settings/extension", label: "Extension", icon: IconExtension, group: "Account" },
  { href: "/app/settings/billing", label: "Billing", icon: IconBilling, group: "Account" },
];

export const NAV_GROUPS = ["Workspace", "Account"] as const;
