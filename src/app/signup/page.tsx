import Link from "next/link";
import { Logo } from "@/components/Logo";
import { safeNext } from "@/lib/http/intent";

export const metadata = { title: "Create your account" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const next = safeNext(sp.next ?? "") ?? "/app";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <div className="card p-6 sm:p-7">
          <h1 className="text-xl font-semibold">Create your account</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Free to start. You&rsquo;ll return to whatever you were doing.
          </p>

          {sp.error && (
            <div className="mt-4 rounded-md border border-danger/30 bg-brick-soft px-3 py-2 text-sm text-ink">
              {sp.error}
            </div>
          )}

          <form method="post" action="/api/auth/signup" className="mt-5 space-y-4">
        <input type="hidden" name="next" value={next} />
        <div>
          <label className="label" htmlFor="name">
            Name <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <input id="name" name="name" type="text" autoComplete="name" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className="input"
          />
          <p className="mt-1 text-xs text-ink-muted">At least 8 characters.</p>
        </div>
            <button type="submit" className="btn-primary w-full">
              Create account
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-ink-muted">
          Already have an account?{" "}
          <Link href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>
        </p>
      </div>
    </main>
  );
}
