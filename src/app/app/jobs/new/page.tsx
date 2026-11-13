import Link from "next/link";
import { createJobAction } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader } from "@/components/ui";
import { IconArrowRight } from "@/components/icons";

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-reading animate-fade-in">
      <Link
        href="/app/applications"
        className="inline-flex items-center gap-1 text-sm text-ink-muted no-underline hover:text-ink"
      >
        <IconArrowRight width={14} height={14} className="rotate-180" aria-hidden="true" />
        Tracker
      </Link>
      <div className="mt-3">
        <PageHeader
          title="Add a job"
          subtitle="Paste a job link and its description from any employer site. We store what you enter — we don't fetch the page for you. The description lets Vaylo tailor your materials."
        />
      </div>

      {sp.error && (
        <div className="mb-4 rounded-md border border-danger/30 bg-brick-soft px-3 py-2 text-sm text-ink">
          {sp.error}
        </div>
      )}

      <form action={createJobAction} className="card space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="title">
              Job title
            </label>
            <input id="title" name="title" required className="input" placeholder="Machine Learning Engineer" />
          </div>
          <div>
            <label className="label" htmlFor="company">
              Company
            </label>
            <input id="company" name="company" required className="input" placeholder="Acme Inc." />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="location">
              Location <span className="font-normal text-ink-muted">(optional)</span>
            </label>
            <input id="location" name="location" className="input" placeholder="Remote / City" />
          </div>
          <div>
            <label className="label" htmlFor="url">
              Job URL <span className="font-normal text-ink-muted">(optional)</span>
            </label>
            <input id="url" name="url" type="url" className="input" placeholder="https://…" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="description">
            Job description
          </label>
          <textarea
            id="description"
            name="description"
            rows={10}
            className="input"
            placeholder="Paste the full job description here so Vaylo can tailor your resume and cover letter to it."
          />
        </div>
        <SubmitButton pendingText="Adding…">Add job</SubmitButton>
      </form>
    </div>
  );
}
