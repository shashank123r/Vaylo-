import type {
  AutofillProfile,
  DetectedField,
  DetectedForm,
  FieldPlan,
  FieldType,
  NavInfo,
  ValidationError,
} from "./types";
import { normalizeQuestion } from "../qnorm";

// ---- element -> accessible label -------------------------------------------
export function accessibleLabel(doc: Document, el: Element): string {
  // el.labels is the most reliable association and works INSIDE a shadow root
  // (where doc.querySelector cannot see the <label for>). Ashby relies on this.
  const labels = (el as HTMLInputElement).labels;
  if (labels && labels.length && labels[0]?.textContent) return clean(labels[0].textContent);
  // Resolve id/aria lookups within the element's OWN root (document or shadow root).
  const root = (el.getRootNode?.() as Document | ShadowRoot | null) ?? doc;
  const q = (sel: string): Element | null => root.querySelector?.(sel) ?? doc.querySelector(sel);
  const byId = (rid: string): Element | null =>
    (root as Document).getElementById?.(rid) ?? doc.getElementById(rid);

  const id = el.getAttribute("id");
  if (id) {
    const lab = q(`label[for="${cssEscape(id)}"]`);
    if (lab?.textContent) return clean(lab.textContent);
  }
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) return clean(ariaLabel);
  const labelledby = el.getAttribute("aria-labelledby");
  if (labelledby) {
    const parts = labelledby
      .split(/\s+/)
      .map((rid) => byId(rid)?.textContent ?? "")
      .join(" ");
    if (parts.trim()) return clean(parts);
  }
  const wrapping = el.closest("label");
  if (wrapping?.textContent) return clean(wrapping.textContent);
  const placeholder = el.getAttribute("placeholder");
  if (placeholder) return clean(placeholder);
  return clean(el.getAttribute("name") ?? "");
}

const clean = (s: string) => s.replace(/\s+/g, " ").replace(/\*$/, "").trim();

// ---- canonical key inference (incl. sensitive-question guarding) -----------
const SENSITIVE: [RegExp, string][] = [
  [
    /sponsor|visa|work\s*authoriz|authori[sz]ed?\s+to\s+work|legally\s+(authori|eligib|entitled|allowed)|right\s+to\s+work|work\s+permit|employment\s+eligib|require\s+sponsorship|eligib/i,
    "work authorization / sponsorship",
  ],
  [/gender|sex\b/i, "gender"],
  [/race|ethnic/i, "race / ethnicity"],
  [/veteran/i, "veteran status"],
  [/disab/i, "disability status"],
  [/salary|compensation|pay expectation|desired pay/i, "salary expectation"],
  [/felony|criminal|conviction/i, "criminal history"],
  [/date of birth|birth\s*date|\bage\b/i, "date of birth / age"],
];

export function inferKey(label: string, type: FieldType, hint: string): string {
  // Normalize separators (snake_case / kebab-case / dotted) and camelCase to spaces
  // so name-only and non-standard field identifiers map just like readable labels:
  // "full_name", "firstName", "linkedin-url", "contactNumber" all resolve correctly.
  const norm = (x: string) =>
    (x || "")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .replace(/[._\-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const s = `${norm(label)} ${norm(hint)}`;
  if (type === "file" || /\bresume\b|\bcv\b|upload|attach/.test(s)) return "resume";
  for (const [re, reason] of SENSITIVE) if (re.test(s)) return `sensitive:${reason}`;
  if (/cover\s*letter|motivation\s*letter/.test(s)) return "coverLetter";
  if (/e\s?mail|\bemail\b/.test(s)) return "email";
  if (/phone|mobile|\btel\b|cell\b|contact\s*(number|no)/.test(s)) return "phone";
  // A question about ANOTHER person's name (referral, reference, emergency contact)
  // must never be auto-filled with the applicant's own name — leave it for the user.
  if (/referr|refer(?:ral|red|ence)|\breference\b|emergency|next\s*of\s*kin|someone\s|\btheir\s+name\b/.test(s)) return "unknown";
  if (/first\s*name|given\s*name|forename/.test(s)) return "firstName";
  if (/last\s*name|sur\s*name|family\s*name/.test(s)) return "lastName";
  if (/full\s*name|your\s*name|^name$|\bname\b|candidate\s*name|applicant\s*name/.test(s)) return "fullName";
  if (/linked\s*in/.test(s)) return "linkedin";
  if (/git\s*hub/.test(s)) return "github";
  if (/portfolio|personal\s*(web)?\s*site|\bwebsite\b|web\s*site|\burl\b/.test(s)) return "website";
  if (/location|\bcity\b|\btown\b|\bcountry\b|based\s+in|where.*based|current\s*(location|city)|place of residence/.test(s)) return "location";
  return "unknown";
}

// ---- element type + selector ------------------------------------------------
export function fieldType(el: Element): FieldType {
  const tag = el.tagName.toLowerCase();
  if (tag === "textarea") return "textarea";
  if (tag === "select") return "select";
  if (tag === "input") {
    const t = (el.getAttribute("type") ?? "text").toLowerCase();
    if (["email", "tel", "url", "file", "radio", "checkbox"].includes(t)) return t as FieldType;
    return "text";
  }
  return "unknown";
}

function cssEscape(s: string): string {
  // Minimal CSS.escape fallback for attribute values/ids.
  return s.replace(/["\\]/g, "\\$&");
}

export function selectorFor(el: Element): string {
  const id = el.getAttribute("id");
  if (id) return /^[A-Za-z][\w-]*$/.test(id) ? `#${id}` : `[id="${cssEscape(id)}"]`;
  const name = el.getAttribute("name");
  if (name) return `${el.tagName.toLowerCase()}[name="${cssEscape(name)}"]`;
  // Fallback: positional selector within the document.
  const same = Array.from(el.ownerDocument!.querySelectorAll(el.tagName.toLowerCase()));
  const idx = same.indexOf(el);
  return `${el.tagName.toLowerCase()}:nth-of-type(${idx + 1})`;
}

// Collect form controls under a root, descending into OPEN shadow roots (React
// component libraries like Ashby render the application fields inside a shadow DOM,
// which a plain querySelectorAll cannot see). De-duplicated.
export function deepCollectControls(root: Element | Document | ShadowRoot): Element[] {
  const seen = new Set<Element>();
  const out: Element[] = [];
  const add = (el: Element) => {
    if (!seen.has(el)) {
      seen.add(el);
      out.push(el);
    }
  };
  const walk = (node: Element | Document | ShadowRoot) => {
    node.querySelectorAll?.("input, textarea, select").forEach(add);
    node.querySelectorAll?.("*").forEach((el) => {
      const sr = (el as HTMLElement).shadowRoot;
      if (sr) walk(sr);
    });
  };
  walk(root);
  return out;
}

// ---- generic field extraction within a container ---------------------------
export function buildFields(container: Element, doc: Document): DetectedField[] {
  const out: DetectedField[] = [];
  const els = deepCollectControls(container);
  els.forEach((el) => {
    const type = fieldType(el);
    if (type === "unknown") return;
    const inputType = (el.getAttribute("type") ?? "").toLowerCase();
    if (["hidden", "submit", "button", "reset"].includes(inputType)) return;
    const label = accessibleLabel(doc, el);
    const hint = `${el.getAttribute("name") ?? ""} ${el.getAttribute("id") ?? ""} ${el.getAttribute("autocomplete") ?? ""}`;
    const required = el.hasAttribute("required") || el.getAttribute("aria-required") === "true";
    out.push({ key: inferKey(label, type, hint), selector: selectorFor(el), label, type, required });
  });
  return out;
}

// ---- shared mapping: approved profile -> safe fills ------------------------
export function planFields(form: DetectedForm, profile: AutofillProfile): FieldPlan {
  const fills: FieldPlan["fills"] = [];
  const skipped: FieldPlan["skipped"] = [];
  let fileField: FieldPlan["fileField"] = null;

  const nameParts = (profile.name ?? "").trim().split(/\s+/).filter(Boolean);
  const first = nameParts[0] ?? "";
  const last = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

  const push = (f: DetectedField, value: string | null, missingReason: string) => {
    if (value && value.trim()) fills.push({ selector: f.selector, value, key: f.key, label: f.label });
    else skipped.push({ selector: f.selector, label: f.label, reason: missingReason });
  };

  // Answer bank: the user's OWN previously-saved answer to this exact (normalized)
  // question. Never invented — only returns a value the user explicitly saved.
  const bankAnswer = (label: string): string | undefined => {
    const a = profile.answers?.[normalizeQuestion(label)];
    return a && a.trim() ? a : undefined;
  };

  for (const f of form.fields) {
    if (f.key.startsWith("sensitive:")) {
      // Sensitive/EEO/work-auth questions PAUSE by default and are never fabricated.
      // Only fill one if the user has explicitly saved their own answer to it.
      const saved = bankAnswer(f.label);
      if (saved) fills.push({ selector: f.selector, value: saved, key: "answerBank", label: f.label });
      else skipped.push({ selector: f.selector, label: f.label, reason: `Sensitive (${f.key.slice(10)}) — answer this yourself.` });
      continue;
    }
    switch (f.key) {
      case "resume":
        fileField = { selector: f.selector, label: f.label };
        break;
      case "email":
        push(f, profile.email, "No email on file.");
        break;
      case "phone":
        push(f, profile.phone, "No phone in your profile.");
        break;
      case "firstName":
        push(f, first, "No name in your profile.");
        break;
      case "lastName":
        push(f, last, "No last name in your profile.");
        break;
      case "fullName":
        push(f, profile.name, "No name in your profile.");
        break;
      case "linkedin":
        push(f, profile.linkedin, "No LinkedIn in your profile.");
        break;
      case "github":
        push(f, profile.github, "No GitHub in your profile.");
        break;
      case "website":
        push(f, profile.website, "No website in your profile.");
        break;
      case "location":
        push(f, profile.location, "No location in your profile.");
        break;
      case "coverLetter":
        skipped.push({ selector: f.selector, label: f.label, reason: "Cover letter left for your review." });
        break;
      default: {
        // Custom/unknown question: fill from the answer bank if the user saved an
        // answer to it (no LLM); otherwise leave it for the user.
        const saved = bankAnswer(f.label);
        if (saved) fills.push({ selector: f.selector, value: saved, key: "answerBank", label: f.label });
        else skipped.push({ selector: f.selector, label: f.label, reason: "Unrecognized field — review manually." });
      }
    }
  }
  return { fills, skipped, fileField };
}

export function textContentOf(doc: Document, selectors: string[]): string | undefined {
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    const t = el?.textContent?.trim();
    if (t) return clean(t);
  }
  return undefined;
}

// ---- navigation / multi-step detection -------------------------------------
const SUBMIT_RE = /\b(submit|apply|send application|finish)\b/i;
const NEXT_RE = /\b(next|continue|review|save and continue|proceed)\b/i;

export function detectNavigation(container: Element): NavInfo {
  const buttons = Array.from(
    container.querySelectorAll('button, input[type="submit"], [role="button"], a.button'),
  );
  let hasSubmit = false;
  let hasNext = false;
  let submitLabel: string | undefined;
  let nextLabel: string | undefined;
  for (const b of buttons) {
    const text = clean(b.textContent ?? b.getAttribute("value") ?? b.getAttribute("aria-label") ?? "");
    if (!text) continue;
    if (SUBMIT_RE.test(text) && !NEXT_RE.test(text)) {
      hasSubmit = true;
      submitLabel ??= text;
    } else if (NEXT_RE.test(text)) {
      hasNext = true;
      nextLabel ??= text;
    }
  }
  return { hasSubmit, hasNext, submitLabel, nextLabel };
}

// ---- required-field / validation error detection ---------------------------
export function collectValidationErrors(container: Element, doc: Document): ValidationError[] {
  const errors: ValidationError[] = [];
  const seen = new Set<string>();
  // 1) Fields marked invalid by the site.
  container.querySelectorAll('[aria-invalid="true"]').forEach((el) => {
    const label = accessibleLabel(doc, el);
    const describedby = el.getAttribute("aria-describedby");
    let message = "";
    if (describedby) {
      message = describedby
        .split(/\s+/)
        .map((rid) => doc.getElementById(rid)?.textContent ?? "")
        .join(" ")
        .trim();
    }
    const key = `${label}|${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    errors.push({ selector: selectorFor(el), label, message: clean(message) || "This field needs attention." });
  });
  // 2) Standalone error/alert messages.
  container.querySelectorAll('[role="alert"], .error, .field-error, [class*="error-message"]').forEach((el) => {
    const message = clean(el.textContent ?? "");
    if (!message) return;
    const key = `alert|${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    errors.push({ label: "", message });
  });
  return errors;
}
