import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current";
import { listApplications } from "@/lib/jobs/service";
import { PageHeader, EmptyState, StatusBadge } from "@/components/ui";

export default async function TrackerPage() {
  const user = (await getCurrentUser())!;
  const apps = await listApplications(user.id);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Tracker"
        subtitle="Every job you've saved or applied to, with its current status."
        actions={
          <>
            <Link href="/app/jobs" className="btn-secondary no-underline">
              Browse jobs
            </Link>
            <Link href="/app/jobs/new" className="btn-primary no-underline">
              Add a job
            </Link>
          </>
        }
      />

      {apps.length === 0 ? (
        <EmptyState
          title="No applications yet"
          description="Save a job from Browse jobs, or add one manually, to start tracking it here."
          action={{ href: "/jobs", label: "Browse jobs" }}
        />
      ) : (
        <ul className="overflow-hidden rounded-lg border border-stone-200 bg-surface shadow-card">
          {apps.map((a, i) => (
            <li key={a.id} className={i > 0 ? "border-t border-stone-200" : ""}>
              <Link
                href={`/app/jobs/${a.jobId}`}
                className="flex items-center justify-between gap-4 px-4 py-3.5 no-underline transition-colors hover:bg-surface-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{a.job.title}</p>
                  <p className="truncate text-sm text-ink-muted">
                    {a.job.company}
                    {a.job.location ? ` · ${a.job.location}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <span className="hidden text-xs text-ink-faint sm:inline">
                    {a.submittedAt
                      ? `Submitted ${a.submittedAt.toLocaleDateString()}`
                      : `Updated ${a.updatedAt.toLocaleDateString()}`}
                  </span>
                  <StatusBadge status={a.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
