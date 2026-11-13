import type { Adapter, DetectedField, DetectedForm } from "./types";
import { buildFields, planFields, detectNavigation, textContentOf } from "./shared";

// Generic, best-effort adapter for application forms on sites we have no dedicated
// adapter for (company portals, Workday, SmartRecruiters, iCIMS, custom careers
// pages, LinkedIn-style forms, …). It is intentionally CONSERVATIVE: it only
// activates when the page clearly contains a real APPLICATION form, so it never
// fills a newsletter box or a search field. It is used as a FALLBACK — specific
// adapters (Greenhouse/Lever/Ashby) still win via pickAdapter; this runs only when
// none match. It fills the same safe fields and skips sensitive/unknown ones, and
// like every adapter it NEVER submits.

// Find the most application-like <form> on the page: one with a resume/file upload,
// else one with an email input. Returns null when there is no such form.
function findApplicationForm(doc: Document): Element | null {
  const forms = Array.from(doc.querySelectorAll("form"));
  const withFile = forms.find((f) => f.querySelector('input[type="file"]'));
  if (withFile) return withFile;
  const withEmail = forms.find(
    (f) => f.querySelector('input[type="email"]') || f.querySelector('input[name*="email" i], input[id*="email" i]'),
  );
  if (withEmail) return withEmail;
  return null;
}

// A real application (vs. a newsletter signup or search box): it has a file upload,
// OR it has an email field AND a name field. This keeps false positives low.
function looksLikeApplication(fields: DetectedField[]): boolean {
  const hasFile = fields.some((f) => f.key === "resume");
  const hasEmail = fields.some((f) => f.key === "email");
  const hasName = fields.some((f) => ["firstName", "lastName", "fullName"].includes(f.key));
  return hasFile || (hasEmail && hasName);
}

export const generic: Adapter = {
  name: "generic",
  // Matches any web page; only used as an explicit fallback (not registered in the
  // ADAPTERS list that pickAdapter scans), so specific adapters always take priority.
  matches: (url: string) => /^https?:\/\//i.test(url),
  detect(doc: Document): DetectedForm | null {
    const form = findApplicationForm(doc);
    if (!form) return null;
    const fields = buildFields(form, doc);
    if (fields.length === 0 || !looksLikeApplication(fields)) return null;
    const unsupported = fields
      .filter((f) => f.key === "unknown" || f.key.startsWith("sensitive:"))
      .map((f) => f.label)
      .filter(Boolean);
    const nav = detectNavigation(form);
    return {
      ats: "generic",
      company: textContentOf(doc, [".company-name", "[class*='company']", "[data-company]"]) ?? undefined,
      title: textContentOf(doc, ["h1", ".job-title", "[class*='title']", "title"]) ?? undefined,
      fields,
      unsupported,
      multiStep: nav.hasNext,
      nav,
    };
  },
  plan: (form, profile) => planFields(form, profile),
};
