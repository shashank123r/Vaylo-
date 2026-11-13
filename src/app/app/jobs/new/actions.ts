"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current";
import { createManualJob, saveJob } from "@/lib/jobs/service";
import { jobSchema } from "@/lib/validation";

export async function createJobAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/app/jobs/new");

  const parsed = jobSchema.safeParse({
    title: formData.get("title"),
    company: formData.get("company"),
    location: formData.get("location") || undefined,
    url: formData.get("url") || undefined,
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input.";
    redirect(`/app/jobs/new?error=${encodeURIComponent(msg)}`);
  }

  const job = await createManualJob(user.id, parsed.data);
  await saveJob(user.id, job.id);
  redirect(`/app/jobs/${job.id}`);
}
