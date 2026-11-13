import "server-only";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "@/lib/db";
import { put, get, newKey } from "@/lib/storage";
import { tailorResume } from "@/lib/llm/service";
import { renderResumePdf } from "@/lib/resume/pdf";
import { isSubscribed } from "@/lib/billing/entitlement";
import type { ResumeVersion } from "@prisma/client";

// Per-job LLM tailoring runs ONLY when the user turned it on AND has a paid plan.
// Free tier (and Pro with the toggle off) uses the standard uploaded resume: zero
// LLM cost per application.
export async function shouldTailor(userId: string): Promise<boolean> {
  const profile = await db.profile.findUnique({ where: { userId }, select: { tailorPerJob: true } });
  if (!profile?.tailorPerJob) return false;
  return isSubscribed(userId);
}

// Per-job tailored resume as an IMMUTABLE, owner-private artifact. We tailor the
// resume for a specific job (grounded in the user's real resume + profile — the
// tailoring prompt never invents facts), render it to a PDF, and store that exact
// file with a content hash and a file hash. The artifact is associated with the job
// and reused ONLY when the inputs (job + profile/resume) are unchanged — never
// silently overwritten, never shared across users or jobs.

function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

// Normalized role key so one tailored resume serves multiple SAME-ROLE applications.
function roleKeyOf(title: string): string {
  return (title || "").toLowerCase().replace(/\s+/g, " ").trim().replace(/[?:.!,;]+$/g, "");
}

// A fingerprint of the PROFILE/resume freshness only (NOT the specific job). Reuse is
// gated on (role matches) AND (this hash unchanged) — so a profile/resume edit forces
// regeneration, but the same role with unchanged inputs reuses one artifact.
async function computeProfileHash(userId: string): Promise<string> {
  const [profile, resumeFile] = await Promise.all([
    db.profile.findUnique({ where: { userId }, select: { updatedAt: true } }),
    db.resumeFile.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, select: { id: true, createdAt: true } }),
  ]);
  return sha256(
    [
      profile?.updatedAt?.toISOString() ?? "no-profile",
      resumeFile ? `${resumeFile.id}:${resumeFile.createdAt.toISOString()}` : "no-resume",
    ].join("|"),
  );
}

export interface TailorDeps {
  tailor?: (userId: string, jobId: string) => Promise<ResumeVersion>;
  render?: (markdown: string) => Promise<Buffer>;
}

// Ensure an immutable tailored-resume artifact exists for (user, job). Reuses a
// matching one (same inputsHash, already rendered) or creates a new one. Returns the
// ResumeVersion whose storageKey/fileHash point at the exact file to upload.
export async function ensureTailoredResume(userId: string, jobId: string, deps: TailorDeps = {}): Promise<ResumeVersion> {
  // Tenant isolation: the job must belong to this user.
  const job = await db.job.findFirst({ where: { id: jobId, userId }, select: { id: true, title: true, company: true, description: true } });
  if (!job) throw new Error("Job not found");

  const inputsHash = await computeProfileHash(userId);
  const roleKey = roleKeyOf(job.title);

  // Reuse one tailored resume across SAME-ROLE jobs when the profile/resume inputs are
  // unchanged (role matches AND inputsHash matches) and the artifact is finished.
  const existing = await db.resumeVersion.findFirst({
    where: { userId, roleKey, inputsHash, storageKey: { not: null } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  // Create a fresh tailored version (grounded; the prompt forbids invented facts).
  const tailor = deps.tailor ?? tailorResume;
  const render = deps.render ?? renderResumePdf;
  const version = await tailor(userId, jobId);

  const contentHash = sha256(version.contentMd);
  const pdf = await render(version.contentMd);
  const fileHash = sha256(pdf);
  // Opaque, unguessable private storage key (never a public URL). Owner access is
  // enforced by the userId check in resolveTailoredResumeFile, not by the key.
  const storageKey = newKey();
  await put(storageKey, pdf);

  return db.resumeVersion.update({
    where: { id: version.id },
    data: { contentHash, inputsHash, roleKey, storageKey, fileHash },
  });
}

export interface ResolvedResumeFile {
  path: string;
  filename: string;
  fileHash: string;
  resumeVersionId: string;
}

// Materialize the EXACT tailored file for a version to a temp path for upload.
// Enforces per-user ownership and verifies the stored bytes still match fileHash
// (integrity) so we never upload a wrong/corrupted or another job's/user's file.
export async function resolveTailoredResumeFile(userId: string, resumeVersionId: string): Promise<ResolvedResumeFile | null> {
  const version = await db.resumeVersion.findFirst({ where: { id: resumeVersionId, userId } });
  if (!version || !version.storageKey || !version.fileHash) return null;
  const bytes = await get(version.storageKey);
  if (sha256(bytes) !== version.fileHash) {
    throw new Error("Tailored resume file integrity check failed");
  }
  const dir = await mkdtemp(join(tmpdir(), "jf-tailored-"));
  const safeCompany = (version.label || "resume").replace(/[^\w.\- ]+/g, "_").slice(0, 60);
  const path = join(dir, `${safeCompany || "resume"}.pdf`);
  await writeFile(path, bytes, { mode: 0o600 });
  return { path, filename: `${safeCompany || "resume"}.pdf`, fileHash: version.fileHash, resumeVersionId: version.id };
}
