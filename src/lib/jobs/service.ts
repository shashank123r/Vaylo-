import "server-only";
import { db } from "@/lib/db";
import { getDemoJob } from "./demo";
import type { Application, Job } from "@prisma/client";

// Every function here takes userId and ALWAYS filters by it. This is the tenant
// isolation boundary: a user can only ever read or mutate their own rows.

export async function listJobs(userId: string): Promise<Job[]> {
  return db.job.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
}

/** Creates a user-entered job (manual URL/description). Records source "manual". */
export async function createManualJob(
  userId: string,
  input: { title: string; company: string; location?: string; url?: string; description?: string },
): Promise<Job> {
  return db.job.create({
    data: {
      userId,
      title: input.title,
      company: input.company,
      location: input.location || null,
      url: input.url || null,
      source: "manual",
      description: input.description || null,
    },
  });
}

export async function getJob(userId: string, jobId: string): Promise<Job | null> {
  return db.job.findFirst({ where: { id: jobId, userId } });
}

/**
 * Imports a demo job into the user's account. Idempotent per (user, demo source
 * url) so clicking "save" twice does not create duplicates.
 */
export async function importDemoJob(userId: string, demoId: string): Promise<Job> {
  const demo = getDemoJob(demoId);
  if (!demo) throw new Error(`Unknown demo job: ${demoId}`);
  const url = `demo://${demo.id}`;
  const existing = await db.job.findFirst({ where: { userId, url } });
  if (existing) return existing;
  return db.job.create({
    data: {
      userId,
      title: demo.title,
      company: demo.company,
      location: demo.location,
      url,
      source: demo.source,
      description: demo.description,
    },
  });
}

/** Upsert a job the extension detected on a real page. Idempotent per (user, url). */
export async function upsertExtensionJob(
  userId: string,
  input: { company: string; title: string; url?: string; description?: string; source?: string },
): Promise<Job> {
  if (input.url) {
    const existing = await db.job.findFirst({ where: { userId, url: input.url } });
    if (existing) {
      return db.job.update({
        where: { id: existing.id },
        data: {
          title: input.title || existing.title,
          company: input.company || existing.company,
          description: input.description ?? existing.description,
          source: input.source ?? existing.source,
        },
      });
    }
  }
  return db.job.create({
    data: {
      userId,
      title: input.title,
      company: input.company,
      url: input.url || null,
      description: input.description || null,
      source: input.source || "extension",
    },
  });
}

/** Saving a job = ensuring it exists in the user's account (SAVED application). */
export async function saveJob(userId: string, jobId: string): Promise<Application> {
  const job = await getJob(userId, jobId);
  if (!job) throw new Error("Job not found");
  return db.application.upsert({
    where: { jobId: job.id },
    update: {},
    create: { userId, jobId: job.id, status: "SAVED" },
  });
}

export async function getApplication(userId: string, jobId: string): Promise<Application | null> {
  return db.application.findFirst({ where: { jobId, userId } });
}

export async function listApplications(userId: string) {
  return db.application.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: { job: true },
  });
}

/**
 * Records a submission ONLY after the user has explicitly confirmed it. We never
 * mark SUBMITTED without confirmedByUser=true.
 */
export async function confirmSubmission(userId: string, jobId: string): Promise<Application> {
  const app = await getApplication(userId, jobId);
  if (!app) throw new Error("Application not found");
  const updated = await db.application.update({
    where: { id: app.id },
    data: { status: "SUBMITTED", confirmedByUser: true, submittedAt: new Date() },
  });
  await db.applicationEvent.create({
    data: { applicationId: app.id, type: "submitted", detail: "User-confirmed submission" },
  });
  return updated;
}
