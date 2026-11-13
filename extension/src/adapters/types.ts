// Shared types for ATS adapters. This module is pure DOM logic with NO Node or
// server imports, so it runs both in the Chrome content script and in jsdom tests.

export type FieldType =
  | "text"
  | "email"
  | "tel"
  | "url"
  | "textarea"
  | "select"
  | "file"
  | "radio"
  | "checkbox"
  | "unknown";

export interface DetectedField {
  key: string; // canonical key (email, firstName, …) or "sensitive:<reason>" or "unknown"
  selector: string;
  label: string;
  type: FieldType;
  required: boolean;
}

export interface NavInfo {
  hasNext: boolean; // a "Next/Continue" control exists -> multi-step form
  hasSubmit: boolean; // a final "Submit/Apply" control exists
  nextLabel?: string;
  submitLabel?: string;
}

export interface ValidationError {
  selector?: string;
  label: string;
  message: string;
}

export interface DetectedForm {
  ats: string;
  company?: string;
  title?: string;
  fields: DetectedField[];
  unsupported: string[]; // labels we detected but will not auto-fill
  multiStep: boolean;
  nav: NavInfo;
}

export interface FillInstruction {
  selector: string;
  value: string;
  key: string;
  label: string;
}

export interface SkippedField {
  selector?: string;
  label: string;
  reason: string;
}

export interface FieldPlan {
  fills: FillInstruction[];
  skipped: SkippedField[];
  fileField?: { selector: string; label: string } | null; // resume/CV upload control
}

// Subset of the backend AutofillProfile the adapters need. Only truthful,
// user-approved facts; never secrets.
export interface AutofillProfile {
  name: string | null;
  email: string;
  phone: string | null;
  location: string | null;
  website: string | null;
  linkedin: string | null;
  github: string | null;
  // Answer bank: normalized question -> the user's OWN saved answer. Used to fill
  // custom/unknown (and user-saved sensitive) questions WITHOUT any LLM call.
  answers?: Record<string, string>;
}

export interface Adapter {
  name: string;
  matches(url: string): boolean;
  detect(doc: Document): DetectedForm | null;
  plan(form: DetectedForm, profile: AutofillProfile): FieldPlan;
}
