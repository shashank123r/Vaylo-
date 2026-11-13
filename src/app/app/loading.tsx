// Shown as a Suspense fallback while an /app route's server data loads, so
// navigation feels responsive instead of blank.
export default function Loading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-live="polite">
      <div className="flex items-center gap-3 text-ink-muted">
        <span
          className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-brick"
          aria-hidden="true"
        />
        <span className="text-sm">Loading…</span>
      </div>
    </div>
  );
}
