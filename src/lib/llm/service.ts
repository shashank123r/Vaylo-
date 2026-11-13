import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { getJob } from "@/lib/jobs/service";
import { getLlm } from "./index";
import { generateWithPolicy } from "./policy";
import { generateJson } from "./json";
import { enforceLlmRateLimit } from "./ratelimit";
import {
  tailorResumePrompt,
  coverLetterPrompt,
  jobFitPrompt,
  type ProfileFacts,
  type JobFacts,
} from "./prompts";
import type { CoverLetter, JobMatch, ResumeVersion } from "@prisma/client";

async function loadProfileFacts(userId: string): Promise<ProfileFacts> {
  const profile = await db.profile.findUnique({
    where: { userId },
    include: {
      experience: { orderBy: { order: "asc" } },
      education: { orderBy: { order: "asc" } },
      skills: true,
      projects: { orderBy: { order: "asc" } },
      certifications: { orderBy: { order: "asc" } },
    },
  });
  if (!profile) {
    return { name: null, headline: null, summary: null, location: null, experience: [], education: [], skills: [], projects: [], certifications: [] };
  }
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  return {
    name: user?.name ?? null,
    headline: profile.headline,
    summary: profile.summary,
    location: profile.location,
    experience: profile.experience.map((e) => ({
      company: e.company,
      title: e.title,
      dates: [e.startDate, e.current ? "Present" : e.endDate].filter(Boolean).join(" to ") || undefined,
      highlights: e.highlights,
    })),
    education: profile.education.map((e) => ({
      school: e.school,
      degree: e.degree ?? undefined,
      field: e.field ?? undefined,
      dates: [e.startDate, e.endDate].filter(Boolean).join(" to ") || undefined,
    })),
    skills: profile.skills.map((s) => s.name),
    projects: profile.projects.map((pr) => ({
      name: pr.name,
      description: pr.description ?? undefined,
      technologies: pr.technologies,
      outcome: pr.outcome ?? undefined,
    })),
    certifications: profile.certifications.map((c) => ({
      name: c.name,
      issuer: c.issuer ?? undefined,
      date: [c.issueDate, c.expiryDate].filter(Boolean).join(" – ") || undefined,
    })),
  };
}

function jobFacts(job: { title: string; company: string; location: string | null; description: string | null }): JobFacts {
  return { title: job.title, company: job.company, location: job.location, description: job.description };
}

/** Tenant-isolated: loads the job via getJob(userId,...) so other users' jobs are unreachable. */
export async function tailorResume(userId: string, jobId: string): Promise<ResumeVersion> {
  const job = await getJob(userId, jobId);
  if (!job) throw new Error("Job not found");
  await enforceLlmRateLimit(userId);
  const facts = await loadProfileFacts(userId);
  const { system, user } = tailorResumePrompt(facts, jobFacts(job));
  const result = await generateWithPolicy(getLlm(), { system, user, maxTokens: 1800 });
  const version = await db.resumeVersion.create({
    data: { userId, jobId, label: `Tailored for ${job.company}`, contentMd: result.text, model: result.model },
  });
  await db.usageEvent.create({ data: { userId, kind: "RESUME_TAILOR" } });
  return version;
}

export async function generateCoverLetter(userId: string, jobId: string): Promise<CoverLetter> {
  const job = await getJob(userId, jobId);
  if (!job) throw new Error("Job not found");
  await enforceLlmRateLimit(userId);
  const facts = await loadProfileFacts(userId);
  const { system, user } = coverLetterPrompt(facts, jobFacts(job));
  const result = await generateWithPolicy(getLlm(), { system, user, maxTokens: 1200 });
  const letter = await db.coverLetter.create({
    data: { userId, jobId, contentMd: result.text, model: result.model },
  });
  await db.usageEvent.create({ data: { userId, kind: "COVER_LETTER" } });
  return letter;
}

// Structured, Zod-validated job-fit analysis. Grounded only in the profile; does
// not fabricate qualifications. Tenant-isolated via getJob.
export const jobFitSchema = z.object({
  score: z.number().int().min(0).max(100),
  strengths: z.array(z.string().max(200)).max(8),
  gaps: z.array(z.string().max(200)).max(8),
  rationale: z.string().max(2000),
});
export type JobFit = z.infer<typeof jobFitSchema>;

export async function analyzeJobFit(userId: string, jobId: string): Promise<JobMatch> {
  const job = await getJob(userId, jobId);
  if (!job) throw new Error("Job not found");
  await enforceLlmRateLimit(userId);
  const facts = await loadProfileFacts(userId);
  const { system, user } = jobFitPrompt(facts, jobFacts(job));
  const { data, model } = await generateJson(getLlm(), jobFitSchema, { system, user, maxTokens: 800 });
  const match = await db.jobMatch.upsert({
    where: { jobId },
    update: { score: data.score, strengths: data.strengths, gaps: data.gaps, rationale: data.rationale, model },
    create: { jobId, score: data.score, strengths: data.strengths, gaps: data.gaps, rationale: data.rationale, model },
  });
  await db.usageEvent.create({ data: { userId, kind: "JOB_MATCH" } });
  return match;
}
