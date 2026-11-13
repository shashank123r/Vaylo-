import Link from "next/link";
import { MarketingHeader } from "@/components/MarketingHeader";
import { JobCard } from "@/components/JobCard";
import { DemoBanner } from "@/components/DemoBanner";
import { filterDemoJobs, DEMO_JOBS } from "@/lib/jobs/demo";

const sources = ["greenhouse", "lever", "ashby"] as const;

export default async function DemoJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; remote?: string; source?: string }>;
}) {
  const sp = await searchParams;
  const remote = sp.remote === "true" ? true : sp.remote === "false" ? false : undefined;
  const jobs = filterDemoJobs({ q: sp.q, remote, source: sp.source });

  return (
    <>
      <MarketingHeader />
      <main className="mx-auto max-w-content px-5 py-10 sm:px-8">
        <DemoBanner />
        <div className="mt-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="page-title">Demo jobs</h1>
            <p className="page-subtitle">
              Sample listings to try the workflow. Saving or applying imports a copy into your account.
            </p>
          </div>
          <span className="badge">{DEMO_JOBS.length} samples</span>
        </div>

        <form method="get" className="mt-6 flex flex-wrap items-end gap-3" aria-label="Filter demo jobs">
          <div className="min-w-[220px] flex-1">
            <label className="label" htmlFor="q">
              Search
            </label>
            <input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Title, company, skill…" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="source">
              Source
            </label>
            <select id="source" name="source" defaultValue={sp.source ?? ""} className="input">
              <option value="">All</option>
              {sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="remote">
              Location
            </label>
            <select id="remote" name="remote" defaultValue={sp.remote ?? ""} className="input">
              <option value="">Any</option>
              <option value="true">Remote</option>
              <option value="false">On-site / hybrid</option>
            </select>
          </div>
          <button type="submit" className="btn-primary">
            Apply filters
          </button>
          {(sp.q || sp.source || sp.remote) && (
            <Link href="/jobs/demo" className="btn-ghost no-underline">
              Clear
            </Link>
          )}
        </form>

        <div className="mt-8">
          {jobs.length === 0 ? (
            <div className="card flex flex-col items-center gap-2 p-12 text-center">
              <p className="font-medium">No demo roles match those filters.</p>
              <Link href="/jobs/demo" className="btn-secondary mt-2 no-underline">
                Clear filters
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} basePath="/jobs/demo" />
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
