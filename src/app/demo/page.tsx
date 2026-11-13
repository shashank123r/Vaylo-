import Link from "next/link";
import { MarketingHeader } from "@/components/MarketingHeader";

const flow = [
  { t: "Browse jobs freely", d: "Explore sample listings and full job details without an account." },
  { t: "Click Apply or Save", d: "The first protected action asks you to sign in, then returns you to the exact job and action." },
  { t: "Build your profile", d: "Fill in your details section by section, or upload a resume and we extract what we can to fill empty fields — you review and confirm." },
  { t: "Generate tailored materials", d: "Vaylo drafts a resume and cover letter matched to the role, grounded only in your real experience." },
  { t: "Review and confirm", d: "Nothing is submitted automatically. You review every draft and explicitly confirm before an application is recorded as submitted." },
  { t: "Track your search", d: "Every saved job and application lives in your tracker with statuses and notes." },
];

export const metadata = { title: "How it works" };

export default function DemoPage() {
  return (
    <>
      <MarketingHeader />
      <main className="mx-auto max-w-reading px-5 py-14 sm:px-8">
        <span className="badge">How it works</span>
        <h1 className="mt-4 text-3xl font-semibold tracking-tighter2 sm:text-4xl">
          A workflow that keeps you in control
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-muted">
          Explore everything public without signing up. An account is only needed when you take an
          action that belongs to you, like saving a job or generating application materials.
        </p>

        <ol className="mt-10">
          {flow.map((s, i) => (
            <li key={s.t} className="flex gap-4 border-t border-stone-200 py-5 first:border-t-0">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brick-soft text-sm font-semibold text-brick">
                {i + 1}
              </span>
              <div className="pt-0.5">
                <h3 className="font-semibold text-ink">{s.t}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{s.d}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-10 flex flex-wrap gap-3 border-t border-stone-200 pt-8">
          <Link href="/jobs/demo" className="btn-primary no-underline">
            Explore the demo
          </Link>
          <Link href="/signup" className="btn-secondary no-underline">
            Create an account
          </Link>
        </div>
      </main>
    </>
  );
}
