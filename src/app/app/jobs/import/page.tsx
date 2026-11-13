import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current";
import { getDemoJob } from "@/lib/jobs/demo";
import { importDemoJob, saveJob } from "@/lib/jobs/service";
import { isIntent } from "@/lib/http/intent";

/**
 * Completes the progressive-signup flow: a visitor clicked a protected action on
 * a public demo job, authenticated, and landed here with the preserved demo id
 * and intent. We import the job into their account and resume the exact action.
 */
export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string; intent?: string }>;
}) {
  const user = (await getCurrentUser())!; // /app layout guarantees a user
  const sp = await searchParams;
  const demoId = sp.demo ?? "";
  const intent = isIntent(sp.intent) ? sp.intent : "save";

  if (!getDemoJob(demoId)) {
    redirect("/jobs");
  }

  const job = await importDemoJob(user.id, demoId);
  // Both "save" and "apply" first ensure the job is tracked (SAVED).
  await saveJob(user.id, job.id);

  // Resume the exact action in the workspace.
  redirect(`/app/jobs/${job.id}${intent === "apply" ? "?start=apply" : ""}`);
}
