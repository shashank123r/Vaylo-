// Shown instantly during navigation to /jobs while the live listings load (the
// upstream fetch can take a couple of seconds). Keeps the transition from feeling
// stuck. Motion is disabled automatically for users who prefer reduced motion.
export default function Loading() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-content flex-col items-center justify-center gap-3 px-6 text-ink-muted">
      <span
        className="h-6 w-6 animate-spin rounded-full border-2 border-stone-300 border-t-brick"
        role="status"
        aria-label="Loading jobs"
      />
      <p className="text-sm">Loading jobs…</p>
    </div>
  );
}
