import Link from "next/link";
import { Logo } from "@/components/Logo";
import { safeNext } from "@/lib/http/intent";

function intentNote(next: string): string | null {
  if (next.includes("intent=apply")) return "Sign in to continue your application.";
  if (next.includes("intent=save")) return "Sign in to save this job to your account.";
  if (next.startsWith("/app")) return "Sign in to continue where you left off.";
  return null;
}

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const next = safeNext(sp.next ?? "") ?? "/app";
  const note = intentNote(next);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <div className="card p-6 sm:p-7">
          <h1 className="text-xl font-semibold">Welcome back</h1>
          <p className="mt-1 text-sm text-ink-muted">{note ?? "Sign in to your account."}</p>

          {sp.error && (
            <div className="mt-4 rounded-md border border-danger/30 bg-brick-soft px-3 py-2 text-sm text-ink">
              {sp.error}
            </div>
          )}

          <form method="post" action="/api/auth/login" className="mt-5 space-y-4">
        <input type="hidden" name="next" value={next} />
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
            autoComplete="current-password"
            required
            className="input"
          />
        </div>
            <button type="submit" className="btn-primary w-full">
              Sign in
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-ink-muted">
          New here?{" "}
          <Link href={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link>
        </p>
      </div>
    </main>
  );
}
