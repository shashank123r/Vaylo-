import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current";
import { listApplications } from "@/lib/jobs/service";
import { db } from "@/lib/db";
import { PageHeader, Stat, StatusBadge } from "@/components/ui";
import { IconArrowRight, IconCheck } from "@/components/icons";

export default async function DashboardPage() {
  const user = (await getCurrentUser())!; // layout guarantees a user
  const [apps, profile] = await Promise.all([
    listApplications(user.id),
    db.profile.findUnique({ where: { userId: user.id } }),
  ]);

  const submitted = apps.filter((a) => a.status === "SUBMITTED").length;
  const active = apps.filter((a) => ["INTERVIEWING", "OFFER"].includes(a.status)).length;
  const profileReady = !!profile?.onboardingDone;
  const firstName = user.name?.split(" ")[0];

  // A brand-new account (no profile, no saved jobs) gets a focused onboarding
  // view instead of a wall of zeros.
  const isNewAccount = apps.length === 0;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={firstName ? `Welcome, ${firstName}` : "Welcome"}
        subtitle={
          isNewAccount
            ? "Two quick steps and you're ready to tailor your first application."
            : "Your job search at a glance."
        }
        actions={
          !isNewAccount && (
            <Link href="/app/jobs" className="btn-primary no-underline">
              Browse jobs
            </Link>
          )
        }
      />

      {isNewAccount ? (
        <OnboardingView profileReady={profileReady} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Saved & tracked" value={apps.length} />
            <Stat label="Submitted" value={submitted} />
            <Stat label="Interviewing or offers" value={active} />
          </div>

          {!profileReady && (
            <Link
              href="/app/profile"
              className="card-interactive mt-4 flex items-center justify-between gap-4 border-brick/20 bg-brick-soft p-4 no-underline"
            >
              <div className="min-w-0">
                <p className="font-medium text-ink">Finish your profile</p>
                <p className="mt-0.5 text-sm text-ink-muted">
                  Grounds every tailored resume in your real experience.
                </p>
              </div>
              <IconArrowRight className="shrink-0 text-brick" aria-hidden="true" />
            </Link>
          )}

          <section className="mt-9">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">Recent activity</h2>
              <Link href="/app/applications" className="text-sm font-medium no-underline">
                View tracker
              </Link>
            </div>
            <ul className="overflow-hidden rounded-lg border border-stone-200 bg-surface shadow-card">
              {apps.slice(0, 6).map((a, i) => (
                <li key={a.id} className={i > 0 ? "border-t border-stone-200" : ""}>
                  <Link
                    href={`/app/jobs/${a.jobId}`}
                    className="flex items-center justify-between gap-3 px-4 py-3.5 no-underline transition-colors hover:bg-surface-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{a.job.title}</p>
                      <p className="truncate text-sm text-ink-muted">{a.job.company}</p>
                    </div>
                    <StatusBadge status={a.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function OnboardingView({ profileReady }: { profileReady: boolean }) {
  return (
    <div className="max-w-reading">
      <ol className="overflow-hidden rounded-lg border border-stone-200 bg-surface shadow-card">
        <OnboardingStep
          done={profileReady}
          index={1}
          title="Set up your profile"
          description="Add your experience, skills, and education so tailored resumes stay grounded in real facts."
          href="/app/profile"
          cta={profileReady ? "Review profile" : "Complete profile"}
        />
        <OnboardingStep
          done={false}
          index={2}
          title="Save your first job"
          description="Browse live roles and save one. From there you can tailor a resume, write a cover letter, and track it."
          href="/app/jobs"
          cta="Browse jobs"
          accent
        />
      </ol>
    </div>
  );
}

function OnboardingStep({
  done,
  index,
  title,
  description,
  href,
  cta,
  accent,
}: {
  done: boolean;
  index: number;
  title: string;
  description: string;
  href: string;
  cta: string;
  accent?: boolean;
}) {
  return (
    <li className="flex items-start gap-4 border-b border-stone-200 p-5 last:border-b-0">
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
          done ? "bg-success/12 text-success" : "bg-graphite text-white"
        }`}
        aria-hidden="true"
      >
        {done ? <IconCheck width={15} height={15} /> : index}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">{description}</p>
      </div>
      <Link
        href={href}
        className={`${accent ? "btn-accent" : "btn-secondary"} btn-sm shrink-0 no-underline`}
      >
        {cta}
      </Link>
    </li>
  );
}
