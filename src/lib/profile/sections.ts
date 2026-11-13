import type { SectionId } from "./completion";

// Ordered walk through the profile wizard. `kind` drives how the section renders:
// "scalar" = a single save-as-you-go form of profile fields; "list" = add/remove
// entries; "documents" = the resume library.
export type SectionKind = "scalar" | "list" | "documents";

export interface SectionDef {
  id: SectionId;
  label: string;
  blurb: string;
  kind: SectionKind;
}

export const SECTIONS: SectionDef[] = [
  { id: "personal", label: "Personal details", blurb: "Who you are and how employers reach you.", kind: "scalar" },
  { id: "preferences", label: "Work preferences", blurb: "Roles, locations and how you want to work.", kind: "scalar" },
  { id: "education", label: "Education", blurb: "Your qualifications. Grades are kept exactly as stated.", kind: "list" },
  { id: "experience", label: "Work experience", blurb: "Roles, dates and what you achieved.", kind: "list" },
  { id: "skills", label: "Skills & projects", blurb: "Skills, tools and project work.", kind: "list" },
  { id: "certifications", label: "Certifications", blurb: "Licenses and credentials, if any.", kind: "list" },
  { id: "questions", label: "Application questions", blurb: "Common factual questions. Never guessed for you.", kind: "scalar" },
  { id: "declarations", label: "Additional declarations", blurb: "Optional & sensitive. Entirely up to you; never required.", kind: "scalar" },
  { id: "documents", label: "Resume & documents", blurb: "Your resume powers autofill and tailoring.", kind: "documents" },
];

export function isSectionId(v: string | undefined): v is SectionId {
  return !!v && SECTIONS.some((s) => s.id === v);
}

export function sectionDef(id: SectionId): SectionDef {
  return SECTIONS.find((s) => s.id === id)!;
}
