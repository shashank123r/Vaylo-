import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-brick">404</p>
      <h1 className="mt-2 text-3xl font-semibold text-ink">Page not found</h1>
      <p className="mt-2 text-ink-muted">
        The page you are looking for does not exist or may have moved.
      </p>
      <div className="mt-6 flex gap-3">
        <Link href="/app" className="btn-primary no-underline">
          Go to dashboard
        </Link>
        <Link href="/" className="btn-secondary no-underline">
          Home
        </Link>
      </div>
    </main>
  );
}
