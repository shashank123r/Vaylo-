import "server-only";
import { type Page } from "playwright";
import { launchBrowser } from "./browser";
import { inferKey, planFields } from "../../../extension/src/adapters/shared";
import type { AutofillProfile, DetectedField, DetectedForm, FieldType, NavInfo } from "../../../extension/src/adapters/types";

// Server-side apply engine. It opens a real employer application page and applies
// like a careful human: detects the form from accessible labels, fills only safe
// fields grounded in the user's approved data, uploads the resume when a file
// control exists, and PAUSES on anything that needs a human (login, CAPTCHA/anti-bot,
// MFA, required sensitive/legal questions). It SUBMITS only when auto-submit is
// explicitly authorized, and it reports success based on EVIDENCE observed on the
// resulting page — never on the click alone. It never bypasses CAPTCHA/MFA/access
// controls: it stops and asks.

export type ApplyStatus =
  | "submitted_confirmed" // submitted AND a confirmation was observed
  | "submitted_uncertain" // submit clicked but no confirmation seen (verify manually)
  | "filled" // filled, not submitted (prepare mode or not authorized)
  | "paused" // needs a human: login / CAPTCHA / MFA / required sensitive question
  | "expired" // the posting is closed / expired / no longer accepting applications
  | "unsupported" // no application form detected
  | "failed"; // the site reported errors, or automation failed

export interface ApplyInput {
  url: string;
  profile: AutofillProfile;
  resumePath?: string | null;
  autoSubmit: boolean; // the caller wants submission attempted
  authorized: boolean; // the user explicitly authorized live submission for this run
}

export interface ApplyResult {
  status: ApplyStatus;
  filled: { selector: string; label: string }[];
  skipped: { label: string; reason: string }[];
  fileUploaded: boolean;
  reason?: string;
  evidence?: string; // the confirmation text/url we actually observed
}

interface RawField {
  sel: string;
  label: string;
  tag: string;
  type: string;
  name: string;
  required: boolean;
}

function toFieldType(tag: string, type: string): FieldType {
  if (tag === "textarea") return "textarea";
  if (tag === "select") return "select";
  if (["email", "tel", "url", "file", "radio", "checkbox"].includes(type)) return type as FieldType;
  return "text";
}

// Confirmation / error signals, matched on the resulting page.
const CONFIRM_RE =
  /(application\s+(received|submitted|complete)|thank\s*you\s+for\s+(applying|your\s+application)|successfully\s+(submitted|applied)|we('|’)?ve\s+received\s+your\s+application|your\s+application\s+has\s+been\s+(submitted|received))/i;

// Reads the form fields, submit/next controls, and blocker signals from the page.
// Self-contained (runs in the page), returns plain data.
function readPageState() {
  function accLabel(el: Element): string {
    const he = el as HTMLElement;
    const id = he.getAttribute("id");
    if (id) {
      const lab = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (lab?.textContent) return lab.textContent.replace(/\s+/g, " ").trim();
    }
    const wrap = he.closest("label");
    if (wrap?.textContent) return wrap.textContent.replace(/\s+/g, " ").trim();
    const al = he.getAttribute("aria-label");
    if (al) return al.trim();
    const labelledby = he.getAttribute("aria-labelledby");
    if (labelledby) {
      const t = labelledby
        .split(/\s+/)
        .map((i) => document.getElementById(i)?.textContent ?? "")
        .join(" ")
        .trim();
      if (t) return t.replace(/\s+/g, " ");
    }
    const ph = he.getAttribute("placeholder");
    if (ph) return ph.trim();
    const nm = he.getAttribute("name");
    return nm ? nm.trim() : "";
  }
  function sel(el: Element): string {
    const id = el.getAttribute("id");
    if (id) return `#${CSS.escape(id)}`;
    const nm = el.getAttribute("name");
    if (nm) return `${el.tagName.toLowerCase()}[name="${CSS.escape(nm)}"]`;
    const all = Array.from(document.querySelectorAll(el.tagName));
    return `${el.tagName.toLowerCase()}:nth-of-type(${all.indexOf(el) + 1})`;
  }

  const controls = Array.from(document.querySelectorAll("input, textarea, select")).filter((el) => {
    const t = (el.getAttribute("type") || "").toLowerCase();
    return !["hidden", "submit", "button", "reset", "image"].includes(t);
  });
  const fields = controls.map((el) => ({
    sel: sel(el),
    label: accLabel(el),
    tag: el.tagName.toLowerCase(),
    type: (el.getAttribute("type") || "").toLowerCase(),
    name: el.getAttribute("name") || "",
    required: el.hasAttribute("required") || el.getAttribute("aria-required") === "true",
  }));

  // Submit / next detection.
  const SUBMIT_RE = /\b(submit|apply|send application|finish)\b/i;
  const NEXT_RE = /\b(next|continue|save\s*(&|and)\s*continue)\b/i;
  let hasSubmit = false,
    hasNext = false,
    submitLabel: string | undefined,
    submitSel: string | undefined;
  for (const b of Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"], a.button'))) {
    const text = (b.textContent || (b as HTMLInputElement).value || "").replace(/\s+/g, " ").trim();
    if (NEXT_RE.test(text) && !SUBMIT_RE.test(text)) hasNext = true;
    else if (SUBMIT_RE.test(text)) {
      hasSubmit = true;
      submitLabel ??= text;
      submitSel ??= sel(b);
    }
  }

  // Blocker signals.
  const hasPassword = !!document.querySelector('input[type="password"]');
  const hasCaptcha =
    !!document.querySelector(
      '.g-recaptcha, .h-captcha, [data-sitekey], iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[title*="captcha" i], #cf-challenge-running',
    );
  const bodyText = (document.body?.innerText || "").slice(0, 20000);

  return { fields, nav: { hasSubmit, hasNext, submitLabel, submitSel }, hasPassword, hasCaptcha, bodyText, url: location.href };
}

function readValidationErrors() {
  const out: string[] = [];
  document.querySelectorAll('[aria-invalid="true"]').forEach((el) => {
    const he = el as HTMLElement;
    const id = he.getAttribute("aria-describedby");
    const msg = id ? document.getElementById(id)?.textContent : "";
    out.push((msg || he.getAttribute("aria-label") || "field").replace(/\s+/g, " ").trim());
  });
  document.querySelectorAll('[role="alert"], .error, .field-error, .ds-field-error').forEach((el) => {
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (t) out.push(t.slice(0, 140));
  });
  return out.slice(0, 10);
}

export async function applyOnPage(page: Page, input: ApplyInput): Promise<ApplyResult> {
  const base: Omit<ApplyResult, "status"> = { filled: [], skipped: [], fileUploaded: false };

  const state = await page.evaluate(readPageState);
  if (!state.fields.length) {
    // Distinguish a closed/expired posting from a plain miss, so the queue records
    // EXPIRED and moves on to the next eligible job.
    const txt: string = await page.evaluate(() => (document.body?.innerText || "").slice(0, 6000)).catch(() => "");
    if (
      /no longer (accepting|available|open)|this (job|position|posting|role|requisition|vacancy) (is|has been|has|was)\s+(closed|expired|filled|removed)|position (has been )?filled|applications?\s+(are\s+)?closed|posting (has )?expired|we are no longer accepting|closed\s+for\s+applications|this listing has expired/i.test(
        txt,
      )
    ) {
      return { ...base, status: "expired", reason: "This posting appears closed or expired — no longer accepting applications." };
    }
    return { ...base, status: "unsupported", reason: "No application form fields were detected on this page." };
  }

  // Hard pauses: never bypass access controls or bot checks.
  if (state.hasCaptcha) {
    return { ...base, status: "paused", reason: "A CAPTCHA / anti-bot check is present. Please solve it, then resume." };
  }
  if (state.hasPassword) {
    return { ...base, status: "paused", reason: "This site requires sign-in / MFA. Please log in, then resume." };
  }

  const detected: DetectedField[] = (state.fields as RawField[]).map((f) => {
    const type = toFieldType(f.tag, f.type);
    return { key: inferKey(f.label, type, f.name), selector: f.sel, label: f.label, type, required: f.required };
  });
  const form: DetectedForm = {
    ats: "generic",
    fields: detected,
    unsupported: [],
    multiStep: state.nav.hasNext && !state.nav.hasSubmit,
    nav: state.nav as NavInfo,
  };
  const plan = planFields(form, input.profile);

  // A REQUIRED sensitive/legal question we won't answer for the user -> pause and
  // ask, never guess. Optional sensitive questions are simply left blank.
  const sensitiveRequired = detected.find((d) => d.required && d.key.startsWith("sensitive:"));
  if (sensitiveRequired) {
    return {
      ...base,
      skipped: plan.skipped,
      status: "paused",
      reason: `A required question needs your decision: "${sensitiveRequired.label}". Answer it, then resume.`,
    };
  }

  // Fill mapped fields.
  const filled: { selector: string; label: string }[] = [];
  for (const f of plan.fills) {
    try {
      const field = detected.find((d) => d.selector === f.selector);
      const t = field?.type;
      if (t === "select") await page.selectOption(f.selector, { label: f.value }).catch(() => page.selectOption(f.selector, f.value));
      else if (t === "checkbox") await page.setChecked(f.selector, true);
      else if (t === "radio") await page.check(f.selector);
      else await page.fill(f.selector, f.value);
      filled.push({ selector: f.selector, label: f.label });
    } catch {
      /* a field that won't fill is skipped, not fatal */
    }
  }

  // Upload the resume into the file control, if present.
  let fileUploaded = false;
  if (plan.fileField && input.resumePath) {
    try {
      await page.setInputFiles(plan.fileField.selector, input.resumePath);
      fileUploaded = true;
    } catch {
      /* upload failure is non-fatal; left for the user */
    }
  }

  const result: Omit<ApplyResult, "status"> = { filled, skipped: plan.skipped, fileUploaded };

  // Prepare mode, multi-step, or not authorized -> stop before submitting.
  if (!input.autoSubmit || !input.authorized) {
    return { ...result, status: "filled", reason: "Filled and ready. Review and submit (auto-submit is off for this run)." };
  }
  if (form.multiStep || !state.nav.hasSubmit || !state.nav.submitSel) {
    return { ...result, status: "filled", reason: "Could not find a single final submit control; left for review." };
  }

  // Submit, then VERIFY by evidence on the resulting page.
  try {
    await Promise.all([
      page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {}),
      page.click(state.nav.submitSel),
    ]);
    await page.waitForTimeout(800);
  } catch (err) {
    return { ...result, status: "failed", reason: `Submit action failed: ${(err as Error)?.message ?? "error"}` };
  }

  // Did the site report validation errors (submission rejected)?
  const errors = await page.evaluate(readValidationErrors).catch(() => []);
  const after = await page.evaluate(() => ({ text: (document.body?.innerText || "").slice(0, 20000), url: location.href }));
  const confirm = after.text.match(CONFIRM_RE) || after.url.match(/thank|confirm|success|complete/i);

  if (confirm) {
    return { ...result, status: "submitted_confirmed", evidence: (confirm[0] || after.url).slice(0, 200) };
  }
  if (errors.length) {
    return { ...result, status: "failed", reason: `The site reported errors after submit: ${errors.slice(0, 3).join("; ")}` };
  }
  return { ...result, status: "submitted_uncertain", reason: "Submitted, but no confirmation was observed. Verify manually before resubmitting." };
}

export async function runApplication(input: ApplyInput): Promise<ApplyResult> {
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    return await applyOnPage(page, input);
  } catch (err) {
    return {
      status: "failed",
      filled: [],
      skipped: [],
      fileUploaded: false,
      reason: err instanceof Error ? err.message : "Browser automation failed.",
    };
  } finally {
    await browser?.close().catch(() => {});
  }
}
