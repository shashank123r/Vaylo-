"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Client-side log only; no sensitive details are shown to the user.
    console.error("App error boundary:", error?.digest ?? error?.message);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-brick">Something went wrong</p>
      <h1 className="mt-2 text-3xl font-semibold text-ink">We hit an unexpected error</h1>
      <p className="mt-2 text-ink-muted">
        This has been logged. You can try again, or head back to your dashboard.
      </p>
      <div className="mt-6 flex gap-3">
        <button onClick={reset} className="btn-primary">
          Try again
        </button>
        <Link href="/app" className="btn-secondary no-underline">
          Dashboard
        </Link>
      </div>
    </main>
  );
}
