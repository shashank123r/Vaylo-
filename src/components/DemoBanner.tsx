export function DemoBanner() {
  return (
    <div
      role="note"
      className="rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-sm text-ink"
    >
      <strong>Demo data.</strong> These are sample listings for exploring Vaylo, not real jobs.
      Real job search appears on the{" "}
      <a href="/jobs" className="underline">
        Browse jobs
      </a>{" "}
      page once a job source is connected.
    </div>
  );
}
