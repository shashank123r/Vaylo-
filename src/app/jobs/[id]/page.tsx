import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingHeader } from "@/components/MarketingHeader";
import { DemoBanner } from "@/components/DemoBanner";
import { getJobProvider } from "@/lib/jobs/provider";
import { importDestination } from "@/lib/http/intent";

export const dynamic = "force-dynamic";

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className={value ? "text-ink" : "text-ink-muted italic"}>{value ?? "Not provided"}</dd>
    </div>
  );
}

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJobProvider().getById(id);
  if (!job) notFound();

  return (
    <>
      <MarketingHeader />
      <main className="mx-auto max-w-reading px-5 py-10 sm:px-8">
        <Link href="/jobs" className="text-sm text-ink-muted no-underline hover:text-ink">
          ← Back to jobs
        </Link>

        {job.demo && (
          <div className="mt-4">
            <DemoBanner />
          </div>
        )}

        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="page-title">{job.title}</h1>
            <p className="mt-1 text-ink-muted">
              {job.company}
              {job.location ? ` · ${job.location}` : ""}
            </p>
          </div>
          <span className="badge shrink-0 capitalize">{job.source}</span>
        </div>

        <dl className="card mt-5 grid grid-cols-2 gap-4 p-5 text-sm sm:grid-cols-3">
          <Field label="Workplace" value={job.remote === null ? null : job.remote ? "Remote" : "On-site / hybrid"} />
          <Field label="Employment type" value={job.employmentType} />
          <Field label="Posted" value={job.postedAt} />
          <Field label="Salary" value={job.salary} />
          <Field label="Source" value={job.source} />
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-muted">Employer page</dt>
            <dd>
              {job.sourceUrl ? (
                <a href={job.sourceUrl} target="_blank" rel="noreferrer noopener" className="underline">
                  Open original listing
                </a>
              ) : (
                <span className="italic text-ink-muted">Not available</span>
              )}
            </dd>
          </div>
        </dl>

        <article className="card mt-6 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Description</h2>
          {job.description ? (
            <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-ink">{job.description}</p>
          ) : (
            <p className="mt-3 text-sm italic text-ink-muted">No description provided by the source.</p>
          )}
        </article>

        <div className="sticky bottom-0 mt-6 flex flex-wrap gap-3 border-t border-stone-200 bg-canvas py-4">
          {job.demo ? (
            <>
              <Link href={importDestination(job.id, "apply")} className="btn-primary no-underline">
                Apply with Vaylo
              </Link>
              <Link href={importDestination(job.id, "save")} className="btn-secondary no-underline">
                Save job
              </Link>
            </>
          ) : (
            <>
              {job.sourceUrl && (
                <a href={job.sourceUrl} target="_blank" rel="noreferrer noopener" className="btn-primary no-underline">
                  Apply on employer site
                </a>
              )}
              <Link href="/app/jobs/new" className="btn-secondary no-underline">
                Add to Vaylo
              </Link>
            </>
          )}
          <span className="self-center text-sm text-ink-muted">
            You will be asked to sign in, then returned here.
          </span>
        </div>
      </main>
    </>
  );
}
