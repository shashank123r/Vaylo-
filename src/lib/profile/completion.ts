// Section-wise profile completion scoring. Pure and deterministic so it can be
// computed on the server from persisted data (survives refreshes) and unit-tested.
//
// Rules (per product spec):
// - Importance tiers: essential, helpful, optional.
// - Completion % is computed ONLY from essential + helpful, non-sensitive fields.
//   Optional and sensitive declarations are EXCLUDED from the denominator, so a
//   user is never pushed to provide sensitive data to raise their score.
// - Nothing is inferred; a field counts only when a real value is present.

export type Tier = "essential" | "helpful" | "optional";

export type SectionId =
  | "personal"
  | "preferences"
  | "education"
  | "experience"
  | "skills"
  | "certifications"
  | "questions"
  | "declarations"
  | "documents";

export const SECTION_LABELS: Record<SectionId, string> = {
  personal: "Personal details",
  preferences: "Work preferences",
  education: "Education",
  experience: "Work experience",
  skills: "Skills & projects",
  certifications: "Certifications",
  questions: "Application questions",
  declarations: "Additional declarations",
  documents: "Resume & documents",
};

// The aggregate the scorer reads. Kept independent of Prisma types so it is easy to
// test and so the DB shape can evolve without breaking the catalog.
export interface ProfileData {
  legalName?: string | null;
  preferredName?: string | null;
  email?: string | null; // from the user account
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  linkedin?: string | null;
  github?: string | null;
  portfolio?: string | null;
  website?: string | null;

  targetTitles?: string[] | null;
  targetLocations?: string[] | null;
  workplaceType?: string | null;
  employmentType?: string | null;
  minSalary?: number | null;
  noticePeriod?: string | null;
  openToRelocation?: boolean | null;

  needsSponsorship?: boolean | null;
  availabilityDate?: string | null;
  yearsExperience?: number | null;
  workAuthByCountry?: Record<string, string> | null;

  // Sensitive declarations — excluded from the denominator.
  gender?: string | null;
  ethnicity?: string | null;
  disabilityStatus?: string | null;
  veteranStatus?: string | null;
  criminalHistory?: string | null;

  educationCount?: number;
  experienceCount?: number;
  skillCount?: number;
  projectCount?: number;
  certificationCount?: number;
  hasResume?: boolean;
}

export interface FieldDef {
  key: string;
  label: string;
  section: SectionId;
  tier: Tier;
  sensitive?: boolean;
  has: (d: ProfileData) => boolean;
}

const str = (v: unknown): boolean => typeof v === "string" && v.trim().length > 0;
const arr = (v: unknown): boolean => Array.isArray(v) && v.length > 0;
const num = (v: unknown): boolean => typeof v === "number" && !Number.isNaN(v);
const bool = (v: unknown): boolean => typeof v === "boolean"; // answered (true/false), not null
const count = (v: unknown): boolean => typeof v === "number" && v > 0;

export const FIELD_CATALOG: FieldDef[] = [
  // Personal
  { key: "legalName", label: "Legal name", section: "personal", tier: "essential", has: (d) => str(d.legalName) },
  { key: "email", label: "Email", section: "personal", tier: "essential", has: (d) => str(d.email) },
  { key: "phone", label: "Phone", section: "personal", tier: "essential", has: (d) => str(d.phone) },
  { key: "city", label: "City", section: "personal", tier: "helpful", has: (d) => str(d.city) },
  { key: "country", label: "Country", section: "personal", tier: "helpful", has: (d) => str(d.country) },
  { key: "linkedin", label: "LinkedIn", section: "personal", tier: "helpful", has: (d) => str(d.linkedin) },
  { key: "preferredName", label: "Preferred name", section: "personal", tier: "optional", has: (d) => str(d.preferredName) },
  { key: "github", label: "GitHub", section: "personal", tier: "optional", has: (d) => str(d.github) },
  { key: "portfolio", label: "Portfolio", section: "personal", tier: "optional", has: (d) => str(d.portfolio) || str(d.website) },

  // Work preferences
  { key: "targetTitles", label: "Target roles", section: "preferences", tier: "essential", has: (d) => arr(d.targetTitles) },
  { key: "workplaceType", label: "Remote/hybrid/on-site", section: "preferences", tier: "helpful", has: (d) => str(d.workplaceType) },
  { key: "targetLocations", label: "Preferred locations", section: "preferences", tier: "helpful", has: (d) => arr(d.targetLocations) },
  { key: "employmentType", label: "Employment type", section: "preferences", tier: "optional", has: (d) => str(d.employmentType) },
  { key: "minSalary", label: "Salary expectation", section: "preferences", tier: "optional", has: (d) => num(d.minSalary) },
  { key: "noticePeriod", label: "Notice period", section: "preferences", tier: "optional", has: (d) => str(d.noticePeriod) },
  { key: "openToRelocation", label: "Open to relocation", section: "preferences", tier: "optional", has: (d) => bool(d.openToRelocation) },

  // Education / experience / skills (presence of at least one entry)
  { key: "education", label: "At least one education entry", section: "education", tier: "helpful", has: (d) => count(d.educationCount) },
  { key: "experience", label: "At least one work experience", section: "experience", tier: "essential", has: (d) => count(d.experienceCount) },
  { key: "skills", label: "Skills listed", section: "skills", tier: "essential", has: (d) => count(d.skillCount) },
  { key: "projects", label: "At least one project", section: "skills", tier: "optional", has: (d) => count(d.projectCount) },

  // Certifications
  { key: "certifications", label: "Certifications (if any)", section: "certifications", tier: "optional", has: (d) => count(d.certificationCount) },

  // Application questions (factual)
  { key: "workAuth", label: "Work authorization", section: "questions", tier: "helpful", has: (d) => !!d.workAuthByCountry && Object.keys(d.workAuthByCountry).length > 0 },
  { key: "needsSponsorship", label: "Sponsorship needed", section: "questions", tier: "helpful", has: (d) => bool(d.needsSponsorship) },
  { key: "yearsExperience", label: "Years of experience", section: "questions", tier: "helpful", has: (d) => num(d.yearsExperience) },
  { key: "availabilityDate", label: "Availability / start date", section: "questions", tier: "optional", has: (d) => str(d.availabilityDate) },

  // Additional declarations — SENSITIVE, excluded from the denominator.
  { key: "gender", label: "Gender", section: "declarations", tier: "optional", sensitive: true, has: (d) => str(d.gender) },
  { key: "ethnicity", label: "Ethnicity", section: "declarations", tier: "optional", sensitive: true, has: (d) => str(d.ethnicity) },
  { key: "disabilityStatus", label: "Disability status", section: "declarations", tier: "optional", sensitive: true, has: (d) => str(d.disabilityStatus) },
  { key: "veteranStatus", label: "Veteran status", section: "declarations", tier: "optional", sensitive: true, has: (d) => str(d.veteranStatus) },

  // Documents
  { key: "resume", label: "Resume uploaded", section: "documents", tier: "essential", has: (d) => !!d.hasResume },
];

export interface MissingField {
  key: string;
  label: string;
  section: SectionId;
  tier: Tier;
}

export interface SectionProgress {
  section: SectionId;
  label: string;
  total: number; // counted (non-sensitive, essential+helpful) fields in section
  complete: number;
  percent: number;
}

export interface CompletionResult {
  percent: number;
  countedTotal: number;
  countedComplete: number;
  tiers: Record<Tier, { total: number; complete: number }>;
  sections: SectionProgress[];
  missingEssential: MissingField[];
  missingHelpful: MissingField[];
}

// A field counts toward the score only if it is non-sensitive and essential/helpful.
function isCounted(f: FieldDef): boolean {
  return !f.sensitive && (f.tier === "essential" || f.tier === "helpful");
}

export interface Readiness {
  ready: boolean; // enough verified info to start applying to supported roles
  blockers: MissingField[]; // essential gaps that must be filled first
  mayPause: string[]; // unknown FACTUAL answers that will pause (not block) specific applications
}

// Readiness is NOT the same as 100% completion, and never implies guaranteed
// eligibility or universal ATS compatibility. It reports whether the essentials are
// present, and which unknown factual answers would pause a specific application
// (we pause and ask rather than guess).
export function computeReadiness(data: ProfileData, completion: CompletionResult): Readiness {
  const mayPause: string[] = [];
  if (!data.workAuthByCountry || Object.keys(data.workAuthByCountry).length === 0)
    mayPause.push("Work authorization is not stated — some employers ask this before applying.");
  if (typeof data.needsSponsorship !== "boolean")
    mayPause.push("Sponsorship need is unanswered — some applications require it.");
  if (!data.hasResume) mayPause.push("No resume uploaded — many forms require one.");

  return {
    ready: completion.missingEssential.length === 0,
    blockers: completion.missingEssential,
    mayPause,
  };
}

export function computeCompletion(data: ProfileData): CompletionResult {
  const tiers: Record<Tier, { total: number; complete: number }> = {
    essential: { total: 0, complete: 0 },
    helpful: { total: 0, complete: 0 },
    optional: { total: 0, complete: 0 },
  };
  const sectionAgg = new Map<SectionId, { total: number; complete: number }>();
  const missingEssential: MissingField[] = [];
  const missingHelpful: MissingField[] = [];

  let countedTotal = 0;
  let countedComplete = 0;

  for (const f of FIELD_CATALOG) {
    const present = f.has(data);
    // Tier breakdown counts every non-sensitive field (informational).
    if (!f.sensitive) {
      tiers[f.tier].total++;
      if (present) tiers[f.tier].complete++;
    }

    if (isCounted(f)) {
      countedTotal++;
      const sec = sectionAgg.get(f.section) ?? { total: 0, complete: 0 };
      sec.total++;
      if (present) {
        countedComplete++;
        sec.complete++;
      } else if (f.tier === "essential") {
        missingEssential.push({ key: f.key, label: f.label, section: f.section, tier: f.tier });
      } else {
        missingHelpful.push({ key: f.key, label: f.label, section: f.section, tier: f.tier });
      }
      sectionAgg.set(f.section, sec);
    }
  }

  const sections: SectionProgress[] = [...sectionAgg.entries()].map(([section, v]) => ({
    section,
    label: SECTION_LABELS[section],
    total: v.total,
    complete: v.complete,
    percent: v.total ? Math.round((100 * v.complete) / v.total) : 100,
  }));

  return {
    percent: countedTotal ? Math.round((100 * countedComplete) / countedTotal) : 0,
    countedTotal,
    countedComplete,
    tiers,
    sections,
    missingEssential,
    missingHelpful,
  };
}
