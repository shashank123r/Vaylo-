import "server-only";
import { db } from "@/lib/db";
import { computeCompletion, computeReadiness, type ProfileData, type CompletionResult, type Readiness } from "./completion";

// Loads everything the completion scorer needs for a user, from PERSISTED data, so
// the percentage is authoritative on the server and survives refreshes. Tenant-safe:
// only ever reads this user's own rows.
export async function loadProfileData(userId: string): Promise<ProfileData> {
  const [user, profile] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { email: true } }),
    db.profile.findUnique({
      where: { userId },
      include: {
        _count: { select: { education: true, experience: true, skills: true, projects: true, certifications: true } },
      },
    }),
  ]);

  const resumeCount = await db.resumeFile.count({ where: { userId } });

  const wac = profile?.workAuthByCountry;
  const workAuthByCountry =
    wac && typeof wac === "object" && !Array.isArray(wac) ? (wac as Record<string, string>) : null;

  return {
    legalName: profile?.legalName ?? null,
    preferredName: profile?.preferredName ?? null,
    email: user?.email ?? null,
    phone: profile?.phone ?? null,
    city: profile?.city ?? null,
    country: profile?.country ?? null,
    linkedin: profile?.linkedin ?? null,
    github: profile?.github ?? null,
    portfolio: profile?.portfolio ?? null,
    website: profile?.website ?? null,

    targetTitles: profile?.targetTitles ?? [],
    targetLocations: profile?.targetLocations ?? [],
    workplaceType: profile?.workplaceType ?? null,
    employmentType: profile?.employmentType ?? null,
    minSalary: profile?.minSalary ?? null,
    noticePeriod: profile?.noticePeriod ?? null,
    openToRelocation: profile?.openToRelocation ?? null,

    needsSponsorship: profile?.needsSponsorship ?? null,
    availabilityDate: profile?.availabilityDate ?? null,
    yearsExperience: profile?.yearsExperience ?? null,
    workAuthByCountry,

    gender: profile?.gender ?? null,
    ethnicity: profile?.ethnicity ?? null,
    disabilityStatus: profile?.disabilityStatus ?? null,
    veteranStatus: profile?.veteranStatus ?? null,
    criminalHistory: profile?.criminalHistory ?? null,

    educationCount: profile?._count.education ?? 0,
    experienceCount: profile?._count.experience ?? 0,
    skillCount: profile?._count.skills ?? 0,
    projectCount: profile?._count.projects ?? 0,
    certificationCount: profile?._count.certifications ?? 0,
    hasResume: resumeCount > 0,
  };
}

// Authoritative, server-computed completion for a user.
export async function getProfileCompletion(userId: string): Promise<CompletionResult> {
  return computeCompletion(await loadProfileData(userId));
}

// Completion + readiness in one pass (both from the same persisted snapshot).
export async function getProfileStatus(userId: string): Promise<{ completion: CompletionResult; readiness: Readiness }> {
  const data = await loadProfileData(userId);
  const completion = computeCompletion(data);
  return { completion, readiness: computeReadiness(data, completion) };
}
