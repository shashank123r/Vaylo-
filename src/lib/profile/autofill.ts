import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { getLlm } from "@/lib/llm";
import { generateJson } from "@/lib/llm/json";

// Facts a resume can explicitly supply. Everything is optional: the model returns
// ONLY what the document actually states, and omits anything it cannot ground.
export const resumeExtractionSchema = z.object({
  legalName: z.string().max(160).optional(),
  phone: z.string().max(40).optional(),
  city: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
  linkedin: z.string().max(300).optional(),
  github: z.string().max(300).optional(),
  summary: z.string().max(4000).optional(),
  // Coerced so a stray "6" (string) still parses. Nested required keys are OPTIONAL
  // and values coerced to string, so one oddly-typed field (e.g. a numeric grade)
  // does not void the whole list; applyResumeExtraction filters incomplete entries.
  yearsExperience: z.coerce.number().int().min(0).max(70).optional(),
  skills: z.array(z.coerce.string().max(60)).max(60).optional(),
  education: z
    .array(
      z.object({
        school: z.coerce.string().max(160).optional(),
        degree: z.coerce.string().max(120).optional(),
        field: z.coerce.string().max(120).optional(),
        startDate: z.coerce.string().max(40).optional(),
        endDate: z.coerce.string().max(40).optional(),
        grade: z.coerce.string().max(40).optional(), // verbatim; NEVER converted
        gradeScale: z.coerce.string().max(40).optional(),
      }),
    )
    .max(30)
    .optional(),
  experience: z
    .array(
      z.object({
        company: z.coerce.string().max(160).optional(),
        title: z.coerce.string().max(160).optional(),
        location: z.coerce.string().max(120).optional(),
        startDate: z.coerce.string().max(40).optional(),
        endDate: z.coerce.string().max(40).optional(),
        highlights: z.array(z.coerce.string().max(1000)).max(12).optional(),
      }),
    )
    .max(30)
    .optional(),
  certifications: z
    .array(z.object({ name: z.coerce.string().max(160).optional(), issuer: z.coerce.string().max(160).optional(), issueDate: z.coerce.string().max(40).optional() }))
    .max(30)
    .optional(),
});

export type ResumeExtraction = z.infer<typeof resumeExtractionSchema>;

const EXTRACTION_SYSTEM = `You extract structured facts from a resume into JSON for a job-application profile.

Output a SINGLE JSON object with these keys (include every key the resume has data for):
{
  "legalName": string,
  "phone": string,
  "city": string,            // from a "City, Country" line, the city only
  "country": string,         // the country only
  "linkedin": string,
  "github": string,
  "summary": string,         // the resume's summary / objective / about section
  "yearsExperience": number,
  "skills": string[],        // every skill, tool, framework, language listed
  "education": [{ "school": string, "degree": string, "field": string, "startDate": string, "endDate": string, "grade": string }],
  "experience": [{ "company": string, "title": string, "location": string, "startDate": string, "endDate": string, "highlights": string[] }],
  "certifications": [{ "name": string, "issuer": string, "issueDate": string }]
}

RULES:
- Extract ALL work-experience entries, ALL education entries, and ALL skills that appear. Never leave these arrays empty when the resume lists them.
- Use ONLY facts explicitly in the resume. Do NOT invent or estimate employers, titles, dates, CGPA/grades, years of experience, visa/work authorization, sponsorship, salary, or demographics.
- Copy grades and dates EXACTLY as written (e.g. "3.8", "First Class", "85%"); never convert scales.
- Omit a single field inside an entry if it is not stated; use an empty array for a whole section that is absent.
- Respond with ONLY the JSON object, no prose or code fences.`;

// Calls the LLM to extract grounded facts. Returns {} on any failure (best-effort;
// missing stays missing — never fabricated).
export async function extractProfileFromResume(resumeText: string): Promise<ResumeExtraction> {
  const text = (resumeText ?? "").slice(0, 20000).trim();
  if (text.length < 30) return {};
  try {
    const { data } = await generateJson(getLlm(), resumeExtractionSchema, {
      system: EXTRACTION_SYSTEM,
      user: `Resume text:\n\n${text}\n\nReturn the JSON object of grounded facts now.`,
      maxTokens: 3000,
    });
    return data;
  } catch {
    return {};
  }
}

export interface AutofillReport {
  filled: string[]; // scalar fields newly populated from the resume
  conflicts: string[]; // confirmed fields where the resume differs (held for review)
  addedEducation: number;
  addedExperience: number;
  addedSkills: number;
  addedCertifications: number;
}

const SCALAR_FIELDS = ["legalName", "phone", "city", "country", "linkedin", "github", "summary", "yearsExperience"] as const;

/**
 * Applies extracted facts to the user's profile WITHOUT inventing or erasing:
 * - Fills only empty scalar fields; marks them resume-derived (confirmed:false).
 * - If a field was user-confirmed and the resume differs, records a conflict for
 *   review instead of overwriting.
 * - Adds education/experience/certifications only when that section is empty; adds
 *   only skills not already present. Never deletes anything.
 */
export async function applyResumeExtraction(userId: string, ext: ResumeExtraction): Promise<AutofillReport> {
  const report: AutofillReport = {
    filled: [],
    conflicts: [],
    addedEducation: 0,
    addedExperience: 0,
    addedSkills: 0,
    addedCertifications: 0,
  };

  const profile = await db.profile.findUnique({
    where: { userId },
    include: {
      fieldMeta: true,
      _count: { select: { education: true, experience: true, certifications: true } },
      skills: { select: { name: true } },
    },
  });
  if (!profile) return report;

  const metaByField = new Map(profile.fieldMeta.map((m) => [m.field, m]));
  const scalarUpdate: Record<string, unknown> = {};

  for (const field of SCALAR_FIELDS) {
    const incoming = ext[field as keyof ResumeExtraction];
    if (incoming === undefined || incoming === null || incoming === "") continue;
    const current = (profile as Record<string, unknown>)[field];
    const meta = metaByField.get(field);

    const isEmpty = current === null || current === undefined || current === "";
    if (isEmpty) {
      scalarUpdate[field] = incoming;
      report.filled.push(field);
      await db.profileFieldMeta.upsert({
        where: { profileId_field: { profileId: profile.id, field } },
        create: { profileId: profile.id, field, source: "RESUME", confirmed: false },
        update: { source: "RESUME", confirmed: false, conflictValue: null },
      });
    } else if (meta?.confirmed && String(current) !== String(incoming)) {
      // User-confirmed value differs from the resume: hold for review, don't overwrite.
      report.conflicts.push(field);
      await db.profileFieldMeta.update({
        where: { profileId_field: { profileId: profile.id, field } },
        data: { conflictValue: String(incoming) },
      });
    }
    // else: value present but unconfirmed -> leave as-is (never erase/overwrite silently).
  }
  if (Object.keys(scalarUpdate).length) {
    await db.profile.update({ where: { userId }, data: scalarUpdate });
  }

  // Multi-entry: add only into empty sections (avoid duplicates). Drop entries that
  // lack their anchor fact (never create a blank record).
  const eduValid = (ext.education ?? []).filter((e): e is typeof e & { school: string } => !!e.school);
  const expValid = (ext.experience ?? []).filter(
    (x): x is typeof x & { company: string; title: string } => !!x.company && !!x.title,
  );
  const certValid = (ext.certifications ?? []).filter((c): c is typeof c & { name: string } => !!c.name);

  if (eduValid.length && profile._count.education === 0) {
    await db.education.createMany({
      data: eduValid.map((e, i) => ({
        profileId: profile.id,
        school: e.school,
        degree: e.degree ?? null,
        field: e.field ?? null,
        startDate: e.startDate ?? null,
        endDate: e.endDate ?? null,
        grade: e.grade ?? null,
        gradeScale: e.gradeScale ?? null,
        order: i,
        source: "RESUME",
        confirmed: false,
      })),
    });
    report.addedEducation = eduValid.length;
  }
  if (expValid.length && profile._count.experience === 0) {
    await db.workExperience.createMany({
      data: expValid.map((x, i) => ({
        profileId: profile.id,
        company: x.company,
        title: x.title,
        location: x.location ?? null,
        startDate: x.startDate ?? null,
        endDate: x.endDate ?? null,
        highlights: x.highlights ?? [],
        order: i,
        source: "RESUME",
        confirmed: false,
      })),
    });
    report.addedExperience = expValid.length;
  }
  if (certValid.length && profile._count.certifications === 0) {
    await db.certification.createMany({
      data: certValid.map((c, i) => ({
        profileId: profile.id,
        name: c.name,
        issuer: c.issuer ?? null,
        issueDate: c.issueDate ?? null,
        order: i,
        source: "RESUME",
        confirmed: false,
      })),
    });
    report.addedCertifications = certValid.length;
  }
  if (ext.skills?.length) {
    const existing = new Set(profile.skills.map((s) => s.name.toLowerCase()));
    const toAdd = ext.skills.filter((s) => s.trim() && !existing.has(s.toLowerCase()));
    if (toAdd.length) {
      await db.skillItem.createMany({ data: toAdd.map((name) => ({ profileId: profile.id, name, source: "RESUME" as const, confirmed: false })) });
      report.addedSkills = toAdd.length;
    }
  }

  return report;
}
