import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current";
import { getJob, getApplication } from "@/lib/jobs/service";
import { db } from "@/lib/db";
import { MarkdownView } from "@/components/MarkdownView";
import { actionTailorResume, actionCoverLetter, actionConfirmSubmit, actionAnalyzeFit, actionDeleteResumeVersion, actionRenameResumeVersion } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { StatusBadge } from "@/components/ui";
import { IconArrowRight } from "@/components/icons";

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ start?: string; error?: string }>;
}) {
  const user = (await getCurrentUser())!;
  const { id } = await params;
  const { start, error } = await searchParams;

  const job = await getJob(user.id, id);
  if (!job) redirect("/app"); // tenant isolation: not your job -> gone

  const [application, resumeVersions, coverLetters, fit] = await Promise.all([
    getApplication(user.id, id),
    db.resumeVersion.findMany({ where: { userId: user.id, jobId: id }, orderBy: { createdAt: "desc" } }),
    db.coverLetter.findMany({ where: { userId: user.id, jobId: id }, orderBy: { createdAt: "desc" } }),
    db.jobMatch.findUnique({ where: { jobId: id } }),
  ]);

  const latestResume = resumeVersions[0];
  const latestCover = coverLetters[0];
  const submitted = application?.status === "SUBMITTED";

  return (
    <div className="animate-fade-in">
      <Link
        href="/app/applications"
        className="inline-flex items-center gap-1 text-sm text-ink-muted no-underline hover:text-ink"
      >
        <IconArrowRight width={14} height={14} className="rotate-180" aria-hidden="true" />
        Tracker
      </Link>
      {error && (
        <div className="mt-3 rounded-md border border-danger/30 bg-brick-soft px-3 py-2 text-sm text-ink">{error}</div>
      )}

      <div className="mt-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="page-title break-words">{job.title}</h1>
          <p className="mt-1.5 break-words text-ink-muted">
            {job.company}
            {job.location ? ` · ${job.location}` : ""}
          </p>
        </div>
        <StatusBadge status={application?.status ?? "SAVED"} />
      </div>

      {start === "apply" && !submitted && (
        <div className="card mt-5 border-brick/20 bg-brick-soft p-4 text-sm text-ink">
          Continue your application below: generate your tailored materials, review them, then
          confirm when you&rsquo;re ready.
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Tailored resume */}
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Tailored resume</h2>
            <form action={actionTailorResume.bind(null, job.id)}>
              <SubmitButton className="btn-secondary" pendingText="Generating…">
                {latestResume ? "Regenerate" : "Generate"}
              </SubmitButton>
            </form>
          </div>
          {latestResume ? (
            <>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-ink-muted">Model: {latestResume.model}</p>
                <a
                  href={`/api/resume-versions/${latestResume.id}/download`}
                  className="btn-primary no-underline"
                  download
                >
                  Download PDF
                </a>
              </div>
              <div className="mt-3 max-h-96 overflow-auto rounded-md border border-stone-200 bg-surface-2 p-4">
                <MarkdownView md={latestResume.contentMd} />
              </div>

              {resumeVersions.length > 1 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Version history</p>
                  <ul className="mt-2 space-y-1.5">
                    {resumeVersions.slice(1).map((v) => (
                      <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-stone-200 px-3 py-2 text-sm">
                        <form action={actionRenameResumeVersion.bind(null, job.id, v.id)} className="flex min-w-0 flex-1 items-center gap-2">
                          <input
                            name="label"
                            defaultValue={v.label}
                            aria-label="Version name"
                            className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-ink-muted hover:border-stone-200 focus:border-stone-300 focus:bg-surface focus:text-ink focus:outline-none"
                          />
                          <span className="shrink-0 text-xs text-ink-muted">{new Date(v.createdAt).toLocaleDateString()}</span>
                          <button type="submit" className="shrink-0 text-xs hover:underline">Rename</button>
                        </form>
                        <span className="flex shrink-0 items-center gap-3">
                          <a href={`/api/resume-versions/${v.id}/download`} className="no-underline hover:underline" download>PDF</a>
                          <form action={actionDeleteResumeVersion.bind(null, job.id, v.id)}>
                            <button type="submit" className="text-danger hover:underline">Delete</button>
                          </form>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm text-ink-muted">
              No version yet. Generate one grounded in your profile and this role.
            </p>
          )}
        </section>

        {/* Cover letter */}
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Cover letter</h2>
            <form action={actionCoverLetter.bind(null, job.id)}>
              <SubmitButton className="btn-secondary" pendingText="Generating…">
                {latestCover ? "Regenerate" : "Generate"}
              </SubmitButton>
            </form>
          </div>
          {latestCover ? (
            <>
              <p className="mt-2 text-xs text-ink-muted">Model: {latestCover.model}</p>
              <div className="mt-3 max-h-96 overflow-auto rounded-md border border-stone-200 bg-surface-2 p-4">
                <MarkdownView md={latestCover.contentMd} />
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-ink-muted">No cover letter yet.</p>
          )}
        </section>
      </div>

      {/* Job-fit analysis (structured, evidence-based) */}
      <section className="card mt-6 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Job-fit analysis</h2>
          <form action={actionAnalyzeFit.bind(null, job.id)}>
            <SubmitButton className="btn-secondary" pendingText="Analyzing…">
              {fit ? "Re-analyze" : "Analyze fit"}
            </SubmitButton>
          </form>
        </div>
        {fit ? (
          <div className="mt-3 text-sm">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-semibold tabular-nums">{fit.score}</span>
              <span className="text-ink-muted">/ 100 match</span>
              {fit.model && <span className="badge">{fit.model}</span>}
            </div>
            {fit.strengths.length > 0 && (
              <>
                <h4 className="mt-3 font-medium">Strengths</h4>
                <ul className="mt-1 list-disc pl-5 text-ink-muted">
                  {fit.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </>
            )}
            {fit.gaps.length > 0 && (
              <>
                <h4 className="mt-3 font-medium">Gaps to address</h4>
                <ul className="mt-1 list-disc pl-5 text-ink-muted">
                  {fit.gaps.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </>
            )}
            {fit.rationale && <p className="mt-3 text-ink-muted">{fit.rationale}</p>}
            <p className="mt-3 text-xs text-ink-muted">
              A model estimate from your profile versus this role. Review it yourself; it never
              invents qualifications you do not have.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">
            Get an evidence-based estimate of how your profile matches this role.
          </p>
        )}
      </section>

      {/* Job description */}
      <section className="card mt-6 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Role</h2>
        <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed">{job.description}</p>
      </section>

      {/* Submission: explicit confirmation required, no automatic sending */}
      <section className="card mt-6 p-5">
        <h2 className="font-semibold">Submission</h2>
        {submitted ? (
          <p className="mt-2 text-sm text-success">
            Marked as submitted on {application?.submittedAt?.toLocaleDateString()}. This records your
            tracker status; Vaylo never submits on your behalf without the browser extension and
            your confirmation.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-ink-muted">
              Automated form filling runs through the browser extension and always requires your
              confirmation — it never submits for you. After you submit on the employer&rsquo;s site,
              record it here to keep your tracker accurate.
            </p>
            <form action={actionConfirmSubmit.bind(null, job.id)} className="mt-4 flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="confirm" required className="h-4 w-4 accent-brick" />
                I reviewed my materials and want to mark this as submitted.
              </label>
              <SubmitButton className="btn-primary" pendingText="Marking…">
                Mark as submitted
              </SubmitButton>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
