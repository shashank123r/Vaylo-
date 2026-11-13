import Link from "next/link";
import { MarketingHeader } from "@/components/MarketingHeader";

const steps = [
  { n: "01", t: "Keep one profile", d: "Your experience, education, and skills live in one place you control." },
  { n: "02", t: "Tailor per role", d: "A resume and cover letter matched to each job, grounded in your real experience." },
  { n: "03", t: "Review, then apply", d: "Draft answers and autofill forms. You confirm before anything is submitted." },
  { n: "04", t: "Track everything", d: "Every saved job and application in one tracker, with clear statuses." },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <MarketingHeader />
      <main className="mx-auto w-full max-w-content flex-1 px-5 sm:px-8">
        <section className="mx-auto max-w-3xl py-20 text-center sm:py-28">
          <span className="badge">Browse without an account</span>
          <h1 className="mx-auto mt-6 max-w-[16ch] text-[2.5rem] font-semibold leading-[1.05] tracking-tighter3 text-ink sm:text-[3.5rem]">
            Apply with evidence, not guesswork.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-ink-muted">
            Vaylo tailors each resume and cover letter to the role, drafts application answers for your
            review, and tracks every submission. You stay in control, and confirm before anything is sent.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link href="/jobs" className="btn-primary no-underline">
              Browse jobs
            </Link>
            <Link href="/demo" className="btn-secondary no-underline">
              See how it works
            </Link>
          </div>
          <p className="mt-6 text-sm text-ink-faint">
            No account needed to explore. No fabricated listings, metrics, or submissions.
          </p>
        </section>

        <section className="border-t border-stone-200 py-16">
          <h2 className="section-label text-center">How it works</h2>
          <ol className="mx-auto grid max-w-4xl gap-x-10 gap-y-8 sm:grid-cols-2">
            {steps.map((s) => (
              <li key={s.n} className="flex gap-4">
                <span className="text-sm font-semibold tabular-nums text-brick">{s.n}</span>
                <div>
                  <h3 className="text-base font-semibold text-ink">{s.t}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t border-stone-200">
        <div className="mx-auto max-w-content px-5 py-8 text-sm leading-relaxed text-ink-muted sm:px-8">
          Vaylo discovers jobs, matches them to your resume, tailors your application materials, autofills
          supported employer forms, and tracks every application. Autofill supports Greenhouse, Lever, and
          Ashby today. Sample listings are clearly labeled demo data; real search appears once a job source
          is connected.
        </div>
      </footer>
    </div>
  );
}
