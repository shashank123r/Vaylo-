import Link from "next/link";
import type { ReactNode } from "react";

// Server-compatible presentational primitives shared across every route, so page
// titles, gutters, empty states, and figures look identical everywhere.

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="card p-5">
      <div className="stat-value tabular-nums">{value}</div>
      <div className="stat-label">{label}</div>
      {hint ? <div className="mt-1 text-xs text-ink-faint">{hint}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: { href: string; label: string; accent?: boolean };
}) {
  return (
    <div className="empty-state">
      <p className="font-medium text-ink">{title}</p>
      {description ? <p className="mt-1.5 max-w-sm text-sm text-ink-muted">{description}</p> : null}
      {action ? (
        <Link
          href={action.href}
          className={`${action.accent ? "btn-accent" : "btn-primary"} mt-5 no-underline`}
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

// Application status → label + tone. Preserves the exact schema distinction
// (SAVED / DRAFTING / READY / SUBMITTED / INTERVIEWING / OFFER / REJECTED /
// WITHDRAWN); only the presentation is centralized here.
const STATUS_TONE: Record<string, string> = {
  SAVED: "badge",
  DRAFTING: "badge",
  READY: "badge-accent",
  SUBMITTED: "badge-success",
  INTERVIEWING: "badge-success",
  OFFER: "badge-success",
  REJECTED: "badge-warning",
  WITHDRAWN: "badge",
};
const STATUS_LABEL: Record<string, string> = {
  SAVED: "Saved",
  DRAFTING: "Drafting",
  READY: "Ready",
  SUBMITTED: "Submitted",
  INTERVIEWING: "Interviewing",
  OFFER: "Offer",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? "badge";
  const label = STATUS_LABEL[status] ?? status;
  return <span className={tone}>{label}</span>;
}
