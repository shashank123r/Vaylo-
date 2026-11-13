"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { tailorResume, generateCoverLetter, analyzeJobFit } from "@/lib/llm/service";
import { confirmSubmission, getJob } from "@/lib/jobs/service";
import { logger } from "@/lib/logger";

async function userOrRedirect(jobId: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/jobs/${jobId}`);
  return user;
}

// LLM generation can fail (timeout, rate limit, provider error). Never let that
// throw into an error boundary — surface a friendly message on the job page.
const GEN_FAILED = "Generation failed. The AI service was busy or unavailable. Please try again.";

export async function actionTailorResume(jobId: string) {
  const user = await userOrRedirect(jobId);
  // getJob enforces tenant isolation; a job that is not this user's is unreachable.
  const job = await getJob(user.id, jobId);
  if (!job) redirect("/app");
  try {
    await tailorResume(user.id, jobId);
  } catch (err) {
    logger.warn({ jobId }, `tailor resume failed: ${(err as Error)?.message}`);
    redirect(`/app/jobs/${jobId}?error=${encodeURIComponent(GEN_FAILED)}`);
  }
  revalidatePath(`/app/jobs/${jobId}`);
}

export async function actionCoverLetter(jobId: string) {
  const user = await userOrRedirect(jobId);
  const job = await getJob(user.id, jobId);
  if (!job) redirect("/app");
  try {
    await generateCoverLetter(user.id, jobId);
  } catch (err) {
    logger.warn({ jobId }, `cover letter failed: ${(err as Error)?.message}`);
    redirect(`/app/jobs/${jobId}?error=${encodeURIComponent(GEN_FAILED)}`);
  }
  revalidatePath(`/app/jobs/${jobId}`);
}

export async function actionAnalyzeFit(jobId: string) {
  const user = await userOrRedirect(jobId);
  const job = await getJob(user.id, jobId);
  if (!job) redirect("/app");
  try {
    await analyzeJobFit(user.id, jobId);
  } catch (err) {
    // Surface nothing sensitive; the page simply shows no new analysis.
    logger.warn({ jobId }, `job-fit analysis failed: ${(err as Error)?.message}`);
  }
  revalidatePath(`/app/jobs/${jobId}`);
}

// Delete one tailored-resume version (owner-only). Deleting a version never
// touches other versions, the original resume, or the job.
export async function actionDeleteResumeVersion(jobId: string, versionId: string) {
  const user = await userOrRedirect(jobId);
  await db.resumeVersion.deleteMany({ where: { id: versionId, userId: user.id } });
  revalidatePath(`/app/jobs/${jobId}`);
}

// Rename one tailored-resume version's label (owner-only). Empty input is ignored
// so a version always keeps a usable label.
export async function actionRenameResumeVersion(jobId: string, versionId: string, formData: FormData) {
  const user = await userOrRedirect(jobId);
  const label = String(formData.get("label") ?? "").trim().slice(0, 80);
  if (label) {
    await db.resumeVersion.updateMany({ where: { id: versionId, userId: user.id }, data: { label } });
  }
  revalidatePath(`/app/jobs/${jobId}`);
}

export async function actionConfirmSubmit(jobId: string) {
  const user = await userOrRedirect(jobId);
  const job = await getJob(user.id, jobId);
  if (!job) redirect("/app");
  // Only ever runs from an explicit user confirmation in the UI.
  await confirmSubmission(user.id, jobId);
  revalidatePath(`/app/jobs/${jobId}`);
}
