import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingHeader } from "@/components/MarketingHeader";
import { DemoBanner } from "@/components/DemoBanner";
import { getDemoJob } from "@/lib/jobs/demo";
import { importDestination } from "@/lib/http/intent";

export default async function DemoJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = getDemoJob(id);
  if (!job) notFound();

  return (
    <>
      <MarketingHeader />
      <main className="mx-auto max-w-reading px-5 py-10 sm:px-8">
        <Link href="/jobs/demo" className="text-sm text-ink-muted no-underline hover:text-ink">
          ← Back to demo jobs
        </Link>

        <div className="mt-4">
          <DemoBanner />
        </div>

        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="page-title">{job.title}</h1>
            <p className="mt-1 text-ink-muted">
              {job.company} · {job.location}
            </p>
          </div>
          <span className="badge shrink-0 capitalize">{job.source}</span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {job.tags.map((t) => (
            <span key={t} className="badge">
              {t}
            </span>
          ))}
        </div>

        <article className="card mt-6 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Description</h2>
          <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-ink">{job.description}</p>
        </article>

        <div className="sticky bottom-0 mt-6 flex flex-wrap gap-3 border-t border-stone-200 bg-canvas py-4">
          <Link href={importDestination(job.id, "apply")} className="btn-primary no-underline">
            Apply with Vaylo
          </Link>
          <Link href={importDestination(job.id, "save")} className="btn-secondary no-underline">
            Save job
          </Link>
          <span className="self-center text-sm text-ink-muted">
            You will be asked to sign in, then returned right here.
          </span>
        </div>
      </main>
    </>
  );
}
