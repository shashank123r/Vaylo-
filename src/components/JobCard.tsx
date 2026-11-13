import Link from "next/link";
import type { DemoJob } from "@/lib/jobs/demo";

export function JobCard({ job, basePath = "/jobs" }: { job: DemoJob; basePath?: string }) {
  return (
    <Link
      href={`${basePath}/${job.id}`}
      className="card-interactive block p-5 no-underline"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-ink">{job.title}</h3>
          <p className="mt-0.5 text-sm text-ink-muted">
            {job.company} · {job.location}
          </p>
        </div>
        <span className="badge shrink-0 capitalize">{job.source}</span>
      </div>
      <p className="mt-3 text-sm text-ink-muted">{job.summary}</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {job.tags.map((t) => (
          <span key={t} className="badge">
            {t}
          </span>
        ))}
      </div>
    </Link>
  );
}
