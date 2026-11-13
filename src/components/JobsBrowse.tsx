import Link from "next/link";
import { getJobProvider, DEFAULT_PAGE_SIZE, type JobListing } from "@/lib/jobs/provider";
import { importDestination } from "@/lib/http/intent";

// Shared job-browsing experience. Rendered both on the public /jobs route (wrapped
// by the marketing header) and inside the app shell at /app/jobs (wrapped by the
// sidebar layout), so logged-in users stay in the app when they browse jobs.

function buildQuery(sp: Record<string, string | undefined>, overrides: Record<string, string | number>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v) params.set(k, v);
  for (const [k, v] of Object.entries(overrides)) params.set(k, String(v));
  return `?${params.toString()}`;
}

function JobRow({ job, selectedHref, active }: { job: JobListing; selectedHref: string; active: boolean }) {
  return (
    <Link
      href={`${selectedHref}#detail`}
      aria-current={active ? "true" : undefined}
      className={`block rounded-lg border p-4 no-underline transition-colors ${
        active
          ? "border-brick/40 bg-brick-soft"
          : "border-stone-200 bg-surface hover:border-stone-300 hover:bg-surface-2"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 break-words text-sm font-semibold leading-snug text-ink">{job.title}</h3>
        <span className="badge shrink-0 capitalize">{job.source}</span>
      </div>
      <p className="mt-1 break-words text-sm text-ink-muted">
        {job.company}
        {job.location ? ` · ${job.location}` : ""}
      </p>
      <div className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
        {job.remote !== null && <span className="badge shrink-0">{job.remote ? "Remote" : "On-site"}</span>}
        {job.employmentType && <span className="min-w-0 truncate">{job.employmentType}</span>}
        {job.postedAt && <span className="ml-auto shrink-0">{job.postedAt}</span>}
      </div>
    </Link>
  );
}

function DetailPane({ job }: { job: JobListing }) {
  return (
    <div id="detail" className="card flex max-h-[calc(100vh-7rem)] flex-col p-0">
      <div className="border-b border-stone-200 p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="break-words text-xl font-semibold">{job.title}</h2>
            <p className="mt-1 break-words text-ink-muted">
              {job.company}
              {job.location ? ` · ${job.location}` : ""}
            </p>
          </div>
          <span className="badge shrink-0 capitalize">{job.source}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-ink-muted">
          {job.remote !== null && <span className="badge">{job.remote ? "Remote" : "On-site / hybrid"}</span>}
          {job.employmentType && <span className="badge">{job.employmentType}</span>}
          {job.postedAt && <span className="badge">Posted {job.postedAt}</span>}
          {job.salary && <span className="badge">{job.salary}</span>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {job.demo ? (
            <>
              <Link href={importDestination(job.id, "apply")} className="btn-primary no-underline">
                Apply with Vaylo
              </Link>
              <Link href={importDestination(job.id, "save")} className="btn-secondary no-underline">
                Save
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
        </div>
      </div>
      <div className="overflow-y-auto p-6">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Description</h3>
        {job.description ? (
          <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-ink">{job.description}</p>
        ) : (
          <p className="mt-3 text-sm italic text-ink-muted">No description provided by the source.</p>
        )}
      </div>
    </div>
  );
}

export async function JobsBrowse({ sp }: { sp: Record<string, string | undefined> }) {
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const result = await getJobProvider().search({
    q: sp.q,
    location: sp.location,
    remote: sp.remote === "true" ? true : sp.remote === "false" ? false : undefined,
    source: sp.source,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const selected = result.results.find((j) => j.id === sp.selected) ?? result.results[0] ?? null;
  const hasNext = result.total >= 0 ? page < totalPages : Boolean(result.hasMore);

  return (
    <>
      <div className="page-header">
        <div className="min-w-0">
          <h1 className="page-title">Browse jobs</h1>
          <p className="page-subtitle">
            Real listings from your connected job source, with a link back to each employer.
          </p>
        </div>
        <Link href="/jobs/demo" className="btn-secondary no-underline">
          Explore the demo
        </Link>
      </div>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3" aria-label="Job search">
        <div className="min-w-[200px] flex-1">
          <label className="label" htmlFor="q">
            Search
          </label>
          <input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Title or skill" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="location">
            Location
          </label>
          <input id="location" name="location" defaultValue={sp.location ?? ""} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="remote">
            Workplace
          </label>
          <select id="remote" name="remote" defaultValue={sp.remote ?? ""} className="input">
            <option value="">Any</option>
            <option value="true">Remote</option>
            <option value="false">On-site / hybrid</option>
          </select>
        </div>
        <button type="submit" className="btn-primary">
          Search
        </button>
      </form>

      {!result.configured ? (
        <section className="card mt-8 p-8 text-center" aria-live="polite">
          <h2 className="text-lg font-semibold">Job search isn’t connected yet</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-ink-muted">
            Vaylo never shows invented listings. A real job-source provider has not been configured for this
            instance, so there are no live results. You can explore a labeled demo, or add a specific job by
            pasting its link.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link href="/jobs/demo" className="btn-primary no-underline">
              Explore the demo
            </Link>
            <Link href="/app/jobs/new" className="btn-secondary no-underline">
              Add a job by URL
            </Link>
          </div>
        </section>
      ) : result.error ? (
        <section className="card mt-8 p-8 text-center">
          <h2 className="text-lg font-semibold">The job source returned an error</h2>
          <p className="mt-2 text-sm text-ink-muted">{result.error}</p>
        </section>
      ) : result.results.length === 0 ? (
        <section className="card mt-8 flex flex-col items-center gap-2 p-10 text-center">
          <p className="font-medium">No jobs matched your search.</p>
          <p className="text-sm text-ink-muted">Try a broader query. We never pad results with fake jobs.</p>
        </section>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
            <p>
              {result.total >= 0 ? `${result.total} result(s)` : "Latest roles"} from{" "}
              <span className="capitalize">{result.source}</span>, fetched{" "}
              {new Date(result.fetchedAt).toLocaleTimeString()}. Page {page} of {totalPages}.
            </p>
            {result.attribution && (
              <a href={result.attribution.url} target="_blank" rel="noreferrer noopener" className="underline">
                {result.attribution.label}
              </a>
            )}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
            {/* List column */}
            <div className="min-w-0">
              <ul className="space-y-2">
                {result.results.map((job) => (
                  <li key={job.id}>
                    <JobRow
                      job={job}
                      selectedHref={buildQuery(sp, { selected: job.id, page })}
                      active={selected?.id === job.id}
                    />
                  </li>
                ))}
              </ul>
              {(page > 1 || hasNext) && (
                <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
                  {page > 1 ? (
                    <Link href={buildQuery(sp, { page: page - 1 })} className="btn-secondary no-underline">
                      ← Previous
                    </Link>
                  ) : (
                    <span />
                  )}
                  <span className="text-ink-muted">
                    {result.total >= 0 ? `Page ${page} of ${totalPages}` : `Page ${page}`}
                  </span>
                  {hasNext ? (
                    <Link href={buildQuery(sp, { page: page + 1 })} className="btn-secondary no-underline">
                      Next →
                    </Link>
                  ) : (
                    <span />
                  )}
                </nav>
              )}
            </div>

            {/* Detail column */}
            <div className="lg:sticky lg:top-6 lg:self-start">{selected && <DetailPane job={selected} />}</div>
          </div>
        </>
      )}
    </>
  );
}
