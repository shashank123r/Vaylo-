"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { profileSchema } from "@/lib/validation";
import { deleteResume } from "@/lib/resume/service";
import { extractProfileFromResume, applyResumeExtraction } from "@/lib/profile/autofill";
import { isSectionId } from "@/lib/profile/sections";
import type { SectionId } from "@/lib/profile/completion";
import { saveAnswer, deleteAnswer } from "@/lib/answers/bank";

// --- small parsers (no invention: empty => null/absent) ---
const s = (v: FormDataEntryValue | null, max = 500): string | null => {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t.slice(0, max) : null;
};
const csv = (v: FormDataEntryValue | null, max = 50): string[] =>
  (typeof v === "string" ? v : "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, max);
const lines = (v: FormDataEntryValue | null, max = 20): string[] =>
  (typeof v === "string" ? v : "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, max);
const intOrNull = (v: FormDataEntryValue | null): number | null => {
  const n = Number(typeof v === "string" ? v.trim() : "");
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
};
// Tri-state: "yes" -> true, "no" -> false, anything else -> null (unknown/undeclared).
const triBool = (v: FormDataEntryValue | null): boolean | null =>
  v === "yes" ? true : v === "no" ? false : null;

async function requireUserAndProfile() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/app/profile");
  const profile = await db.profile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!profile) redirect("/login?next=/app/profile");
  return { userId: user.id, profileId: profile.id };
}

function backTo(section: SectionId, flag = "saved=1") {
  redirect(`/app/profile?s=${section}&${flag}`);
}

// ------------------ scalar section save (save-as-you-go) ------------------
export async function saveSection(section: string, formData: FormData) {
  if (!isSectionId(section)) redirect("/app/profile");
  const { userId } = await requireUserAndProfile();

  let data: Record<string, unknown> = {};
  switch (section) {
    case "personal":
      data = {
        legalName: s(formData.get("legalName"), 160),
        preferredName: s(formData.get("preferredName"), 120),
        phone: s(formData.get("phone"), 40),
        city: s(formData.get("city"), 120),
        country: s(formData.get("country"), 120),
        address: s(formData.get("address"), 300),
        linkedin: s(formData.get("linkedin"), 300),
        github: s(formData.get("github"), 300),
        portfolio: s(formData.get("portfolio"), 300),
        website: s(formData.get("website"), 300),
      };
      break;
    case "preferences":
      data = {
        targetTitles: csv(formData.get("targetTitles")),
        targetLocations: csv(formData.get("targetLocations")),
        workplaceType: s(formData.get("workplaceType"), 20),
        employmentType: s(formData.get("employmentType"), 20),
        minSalary: intOrNull(formData.get("minSalary")),
        salaryCurrency: s(formData.get("salaryCurrency"), 8),
        salaryPeriod: s(formData.get("salaryPeriod"), 10),
        noticePeriod: s(formData.get("noticePeriod"), 60),
        openToRelocation: triBool(formData.get("openToRelocation")),
      };
      break;
    case "questions": {
      const country = s(formData.get("authCountry"), 120);
      const status = s(formData.get("authStatus"), 60);
      data = {
        needsSponsorship: triBool(formData.get("needsSponsorship")),
        availabilityDate: s(formData.get("availabilityDate"), 60),
        yearsExperience: intOrNull(formData.get("yearsExperience")),
        // Only record a work-authorization fact when both parts are given; never inferred.
        workAuthByCountry: country && status ? { [country]: status } : undefined,
      };
      break;
    }
    case "declarations":
      // All optional + sensitive. "" clears; "prefer_not" is an explicit decline.
      data = {
        gender: s(formData.get("gender"), 60),
        ethnicity: s(formData.get("ethnicity"), 80),
        disabilityStatus: s(formData.get("disabilityStatus"), 60),
        veteranStatus: s(formData.get("veteranStatus"), 60),
      };
      break;
    default:
      redirect(`/app/profile?s=${section}`);
  }

  await db.profile.update({ where: { userId }, data });
  revalidatePath("/app/profile");
  backTo(section);
}

// ------------------ education ------------------
export async function addEducation(formData: FormData) {
  const { profileId } = await requireUserAndProfile();
  const school = s(formData.get("school"), 160);
  if (!school) backTo("education", "error=" + encodeURIComponent("School is required."));
  const n = await db.education.count({ where: { profileId } });
  await db.education.create({
    data: {
      profileId,
      school: school!,
      degree: s(formData.get("degree"), 120),
      field: s(formData.get("field"), 120),
      startDate: s(formData.get("startDate"), 40),
      endDate: s(formData.get("endDate"), 40),
      grade: s(formData.get("grade"), 40), // stored exactly as stated, never converted
      gradeScale: s(formData.get("gradeScale"), 40),
      graduationStatus: s(formData.get("graduationStatus"), 20),
      order: n,
      confirmed: true, // user-entered = confirmed
    },
  });
  revalidatePath("/app/profile");
  backTo("education");
}
export async function deleteEducation(id: string) {
  const { userId } = await requireUserAndProfile();
  await db.education.deleteMany({ where: { id, profile: { userId } } });
  revalidatePath("/app/profile");
  backTo("education");
}

// ------------------ experience ------------------
export async function addExperience(formData: FormData) {
  const { profileId } = await requireUserAndProfile();
  const company = s(formData.get("company"), 160);
  const title = s(formData.get("title"), 160);
  if (!company || !title) backTo("experience", "error=" + encodeURIComponent("Company and title are required."));
  const n = await db.workExperience.count({ where: { profileId } });
  await db.workExperience.create({
    data: {
      profileId,
      company: company!,
      title: title!,
      location: s(formData.get("location"), 120),
      startDate: s(formData.get("startDate"), 40),
      endDate: s(formData.get("endDate"), 40),
      current: formData.get("current") === "on",
      highlights: lines(formData.get("highlights"), 20),
      order: n,
      confirmed: true,
    },
  });
  revalidatePath("/app/profile");
  backTo("experience");
}
export async function deleteExperience(id: string) {
  const { userId } = await requireUserAndProfile();
  await db.workExperience.deleteMany({ where: { id, profile: { userId } } });
  revalidatePath("/app/profile");
  backTo("experience");
}

// ------------------ skills ------------------
export async function addSkill(formData: FormData) {
  const { profileId } = await requireUserAndProfile();
  const names = csv(formData.get("name"), 40); // allow several comma-separated at once
  if (!names.length) backTo("skills", "error=" + encodeURIComponent("Enter at least one skill."));
  const category = s(formData.get("category"), 60);
  await db.skillItem.createMany({ data: names.map((name) => ({ profileId, name, category, confirmed: true })) });
  revalidatePath("/app/profile");
  backTo("skills");
}
export async function deleteSkill(id: string) {
  const { userId } = await requireUserAndProfile();
  await db.skillItem.deleteMany({ where: { id, profile: { userId } } });
  revalidatePath("/app/profile");
  backTo("skills");
}

// ------------------ projects ------------------
export async function addProject(formData: FormData) {
  const { profileId } = await requireUserAndProfile();
  const name = s(formData.get("name"), 160);
  if (!name) backTo("skills", "error=" + encodeURIComponent("Project name is required."));
  const n = await db.project.count({ where: { profileId } });
  await db.project.create({
    data: {
      profileId,
      name: name!,
      description: s(formData.get("description"), 2000),
      technologies: csv(formData.get("technologies"), 30),
      url: s(formData.get("url"), 300),
      outcome: s(formData.get("outcome"), 300),
      order: n,
      confirmed: true,
    },
  });
  revalidatePath("/app/profile");
  backTo("skills");
}
export async function deleteProject(id: string) {
  const { userId } = await requireUserAndProfile();
  await db.project.deleteMany({ where: { id, profile: { userId } } });
  revalidatePath("/app/profile");
  backTo("skills");
}

// ------------------ certifications ------------------
export async function addCertification(formData: FormData) {
  const { profileId } = await requireUserAndProfile();
  const name = s(formData.get("name"), 160);
  if (!name) backTo("certifications", "error=" + encodeURIComponent("Certification name is required."));
  const n = await db.certification.count({ where: { profileId } });
  await db.certification.create({
    data: {
      profileId,
      name: name!,
      issuer: s(formData.get("issuer"), 160),
      issueDate: s(formData.get("issueDate"), 40),
      expiryDate: s(formData.get("expiryDate"), 40),
      credentialId: s(formData.get("credentialId"), 120),
      url: s(formData.get("url"), 300),
      order: n,
      confirmed: true,
    },
  });
  revalidatePath("/app/profile");
  backTo("certifications");
}
export async function deleteCertification(id: string) {
  const { userId } = await requireUserAndProfile();
  await db.certification.deleteMany({ where: { id, profile: { userId } } });
  revalidatePath("/app/profile");
  backTo("certifications");
}

// ------------------ existing: legacy scalar save + resume delete ------------------
export async function saveProfile(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/app/profile");

  const parsed = profileSchema.safeParse({
    headline: formData.get("headline") || undefined,
    location: formData.get("location") || undefined,
    phone: formData.get("phone") || undefined,
    website: formData.get("website") || undefined,
    linkedin: formData.get("linkedin") || undefined,
    github: formData.get("github") || undefined,
    summary: formData.get("summary") || undefined,
    targetTitles: formData.get("targetTitles") || undefined,
  });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`/app/profile?error=${encodeURIComponent(msg)}`);
  }

  const d = parsed.data;
  const targetTitles = (d.targetTitles ?? "").split(",").map((x) => x.trim()).filter(Boolean);

  await db.profile.update({
    where: { userId: user.id },
    data: {
      headline: d.headline ?? null,
      location: d.location ?? null,
      phone: d.phone ?? null,
      website: d.website ?? null,
      linkedin: d.linkedin ?? null,
      github: d.github ?? null,
      summary: d.summary ?? null,
      targetTitles,
      onboardingDone: true,
    },
  });
  revalidatePath("/app/profile");
  redirect("/app/profile?saved=1");
}

export async function deleteResumeAction(resumeId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/app/profile");
  await deleteResume(user.id, resumeId);
  revalidatePath("/app/profile");
}

// Re-run resume autofill on demand from the latest uploaded resume. Fills only
// empty fields (never overwrites confirmed values, never invents). Extraction
// quality depends on the configured LLM (mock returns placeholder data).
export async function autofillFromResumeAction() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/app/profile");
  const resume = await db.resumeFile.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { parsedText: true },
  });
  if (!resume) backTo("documents", "error=" + encodeURIComponent("Upload a resume first."));
  if (!resume!.parsedText) backTo("documents", "error=" + encodeURIComponent("Could not read text from your resume."));
  const ext = await extractProfileFromResume(resume!.parsedText!);
  const report = await applyResumeExtraction(user.id, ext);
  const n =
    report.filled.length + report.addedEducation + report.addedExperience + report.addedSkills + report.addedCertifications;
  revalidatePath("/app/profile");
  backTo("personal", `autofilled=${n}`);
}

// ------------------ answer bank + resume-tailoring toggle ------------------
export async function saveAnswerAction(formData: FormData) {
  const { userId } = await requireUserAndProfile();
  const question = s(formData.get("question"), 500);
  const answer = s(formData.get("answer"), 2000);
  if (question && answer) await saveAnswer(userId, question, answer, "USER");
  revalidatePath("/app/profile");
  redirect("/app/profile?answers=1");
}

export async function deleteAnswerAction(id: string) {
  const { userId } = await requireUserAndProfile();
  await deleteAnswer(userId, id);
  revalidatePath("/app/profile");
  redirect("/app/profile?answers=1");
}

export async function setTailorPerJobAction(formData: FormData) {
  const { userId } = await requireUserAndProfile();
  await db.profile.update({ where: { userId }, data: { tailorPerJob: formData.get("tailorPerJob") === "on" } });
  revalidatePath("/app/profile");
  redirect("/app/profile?answers=1");
}
