import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { adapterFor, ashby } from "../extension/src/adapters/index";
import { applyFills } from "../extension/src/fill";
import type { AutofillProfile } from "../extension/src/adapters/types";

// ~100 realistic application-form fixtures run through the REAL autofill engine
// (adapterFor → detect → plan → applyFills) and validated by re-reading the DOM:
// every field that maps to a known profile fact must actually be filled with the
// right value; sensitive questions must PAUSE; file uploads must be FLAGGED (the
// in-browser path cannot script a file input); cover letters / consent boxes are
// left for the user. Fixtures are NOT proof of live-site compatibility.

const PROFILE: AutofillProfile = {
  name: "Priya Sharma",
  email: "priya.sharma@example.com",
  phone: "+91 98765 43210",
  location: "Bengaluru, India",
  website: "https://priyasharma.dev",
  linkedin: "https://linkedin.com/in/priyasharma",
  github: "https://github.com/priyasharma",
};
const VAL: Record<string, string> = {
  fullName: PROFILE.name!,
  firstName: "Priya",
  lastName: "Sharma",
  email: PROFILE.email,
  phone: PROFILE.phone!,
  location: PROFILE.location!,
  website: PROFILE.website!,
  linkedin: PROFILE.linkedin!,
  github: PROFILE.github!,
};
const IDENTITY = new Set(Object.keys(VAL));

type Style = "for" | "aria" | "labelledby" | "wrap" | "placeholder" | "name";
interface Field {
  key: string; // identity key | "resume" | "sensitive" | "cover" | "consent" | "unknownx"
  label: string;
  type?: string; // text|email|tel|url|textarea|select|checkbox|file|date
  options?: string[];
}
interface Fixture {
  name: string;
  category: string;
  url: string;
  html: string;
  expectFills: Record<string, string>; // id -> expected value
  expectPaused: string[]; // ids that must be skipped as sensitive
  expectFile: boolean;
  expectSkipped: string[]; // ids that must be skipped (cover/consent/unknown) and NOT filled
}

const NAME_ATTR: Record<string, string> = {
  fullName: "full_name",
  firstName: "first_name",
  lastName: "last_name",
  email: "email",
  phone: "phone_number",
  location: "location",
  website: "portfolio_url",
  linkedin: "linkedin_url",
  github: "github_url",
  resume: "resume",
  sensitive: "sponsorship_required",
  cover: "cover_letter",
  consent: "agree_terms",
  unknownx: "referral_source_x9",
};

function control(f: Field, id: string, name: string, extra: string): string {
  const t = f.type ?? "text";
  const base = `id="${id}" name="${name}"${extra ? " " + extra : ""}`;
  if (t === "textarea") return `<textarea ${base}></textarea>`;
  if (t === "select") {
    const opts = (f.options ?? []).map((o) => `<option>${o}</option>`).join("");
    return `<select ${base}><option value="">Select…</option>${opts}</select>`;
  }
  if (t === "file") return `<input type="file" ${base} />`;
  if (t === "checkbox") return `<input type="checkbox" ${base} />`;
  return `<input type="${t}" ${base} />`;
}

const TEXT_LIKE = new Set(["text", "email", "tel", "url", "date"]);

// Render one field in a given labeling style. Non-text controls (select/textarea/
// checkbox/file) can't carry a placeholder, so in placeholder-style they fall back to
// a meaningful name attribute (realistic) — every other style labels them properly.
function renderField(f: Field, style: Style, i: number): string {
  const id = `f${i}`;
  const t = f.type ?? "text";
  let nm = `n${i}`;
  let extra = "";
  let pre = "";
  let wrapOpen = "";
  let wrapClose = "";
  switch (style) {
    case "for":
      pre = `<label for="${id}">${f.label}</label>`;
      break;
    case "aria":
      extra = `aria-label="${f.label}"`;
      break;
    case "labelledby":
      pre = `<span id="l${i}">${f.label}</span>`;
      extra = `aria-labelledby="l${i}"`;
      break;
    case "wrap":
      wrapOpen = `<label>${f.label} `;
      wrapClose = `</label>`;
      break;
    case "placeholder":
      if (TEXT_LIKE.has(t)) extra = `placeholder="${f.label}"`;
      else nm = NAME_ATTR[f.key] ?? `field_${i}`;
      break;
    case "name":
      nm = NAME_ATTR[f.key] ?? `field_${i}`;
      break;
  }
  const ctrl = control(f, id, nm, extra);
  if (wrapOpen) return `<div>${wrapOpen}${ctrl}${wrapClose}</div>`;
  return `<div>${pre}${ctrl}</div>`;
}

function buildFixture(name: string, category: string, url: string, fields: Field[], style: Style): Fixture {
  const expectFills: Record<string, string> = {};
  const expectPaused: string[] = [];
  const expectSkipped: string[] = [];
  let expectFile = false;
  const rows: string[] = [];
  fields.forEach((f, i) => {
    const id = `f${i}`;
    rows.push(renderField(f, style, i));
    if (IDENTITY.has(f.key)) expectFills[id] = VAL[f.key]!;
    else if (f.key === "resume") expectFile = true;
    else if (f.key === "sensitive") expectPaused.push(id);
    else if (f.key === "cover" || f.key === "consent" || f.key === "unknownx") expectSkipped.push(id);
  });
  // Every application form has an email field somewhere so findApplicationForm picks
  // it; shapes without an explicit email still include one implicitly via the set.
  const html = `<!doctype html><html><head><title>${name}</title></head><body>
    <h1>${name}</h1>
    <form id="application_form">${rows.join("\n")}
      <button type="submit">Submit application</button>
    </form></body></html>`;
  return { name, category, url, html, expectFills, expectPaused, expectFile, expectSkipped };
}

const GENERIC_URL = "https://careers.acme.com/apply";
const ATS_URLS: Record<string, string> = {
  greenhouse: "https://boards.greenhouse.io/acme/jobs/1",
  lever: "https://jobs.lever.co/acme/8f3a2b1c",
  ashby: "https://jobs.ashbyhq.com/acme/abc123",
};

const locOpts = ["Remote", "Bengaluru, India", "Mumbai, India"];
const yesno = ["Yes", "No"];

// The shape matrix: each is a list of fields. Email is always present so the form is
// recognized as an application (and so the generic adapter accepts it).
const SHAPES: { key: string; cat: string; fields: Field[] }[] = [
  { key: "minimal", cat: "minimal", fields: [{ key: "fullName", label: "Full name" }, { key: "email", label: "Email", type: "email" }] },
  { key: "contact", cat: "contact", fields: [{ key: "fullName", label: "Full name" }, { key: "email", label: "Email", type: "email" }, { key: "phone", label: "Phone", type: "tel" }] },
  { key: "splitname", cat: "split-name", fields: [{ key: "firstName", label: "First name" }, { key: "lastName", label: "Last name" }, { key: "email", label: "Email address", type: "email" }, { key: "phone", label: "Mobile number", type: "tel" }] },
  { key: "location", cat: "location", fields: [{ key: "fullName", label: "Full name" }, { key: "email", label: "Email", type: "email" }, { key: "location", label: "Current location" }] },
  { key: "locationselect", cat: "location-select", fields: [{ key: "fullName", label: "Full name" }, { key: "email", label: "Email", type: "email" }, { key: "location", label: "Location", type: "select", options: locOpts }] },
  { key: "links", cat: "links", fields: [{ key: "fullName", label: "Full name" }, { key: "email", label: "Email", type: "email" }, { key: "linkedin", label: "LinkedIn", type: "url" }, { key: "github", label: "GitHub", type: "url" }, { key: "website", label: "Portfolio", type: "url" }] },
  { key: "full", cat: "full-identity", fields: [{ key: "firstName", label: "First name" }, { key: "lastName", label: "Last name" }, { key: "email", label: "Email", type: "email" }, { key: "phone", label: "Phone", type: "tel" }, { key: "location", label: "City" }, { key: "linkedin", label: "LinkedIn profile", type: "url" }, { key: "github", label: "GitHub", type: "url" }, { key: "website", label: "Website", type: "url" }] },
  { key: "withfile", cat: "file-upload", fields: [{ key: "fullName", label: "Full name" }, { key: "email", label: "Email", type: "email" }, { key: "resume", label: "Upload your resume", type: "file" }] },
  { key: "sensitive", cat: "sensitive-pause", fields: [{ key: "fullName", label: "Full name" }, { key: "email", label: "Email", type: "email" }, { key: "sensitive", label: "Will you require visa sponsorship?", type: "select", options: yesno }] },
  { key: "cover", cat: "cover-letter", fields: [{ key: "fullName", label: "Full name" }, { key: "email", label: "Email", type: "email" }, { key: "cover", label: "Cover letter", type: "textarea" }] },
  { key: "consent", cat: "consent", fields: [{ key: "fullName", label: "Full name" }, { key: "email", label: "Email", type: "email" }, { key: "consent", label: "I agree to the privacy terms", type: "checkbox" }] },
  { key: "kitchensink", cat: "kitchen-sink", fields: [{ key: "firstName", label: "First name" }, { key: "lastName", label: "Last name" }, { key: "email", label: "Email", type: "email" }, { key: "phone", label: "Phone", type: "tel" }, { key: "location", label: "Location", type: "select", options: locOpts }, { key: "linkedin", label: "LinkedIn", type: "url" }, { key: "github", label: "GitHub", type: "url" }, { key: "website", label: "Portfolio site", type: "url" }, { key: "resume", label: "Resume / CV", type: "file" }, { key: "sensitive", label: "Are you legally authorized to work?", type: "select", options: yesno }, { key: "cover", label: "Cover letter", type: "textarea" }, { key: "consent", label: "I agree to the terms", type: "checkbox" }] },
];

const STYLES: Style[] = ["for", "aria", "labelledby", "wrap", "placeholder", "name"];

const fixtures: Fixture[] = [];
// Core matrix: every shape × every labeling style on the generic adapter.
for (const shape of SHAPES) {
  for (const style of STYLES) {
    fixtures.push(buildFixture(`${shape.key}/${style}`, shape.cat, GENERIC_URL, shape.fields, style));
  }
}
// ATS adapter variants on the full + kitchen-sink shapes across all styles.
const fullFields = SHAPES.find((s) => s.key === "full")!.fields;
const sinkFields = SHAPES.find((s) => s.key === "kitchensink")!.fields;
for (const [ats, url] of Object.entries(ATS_URLS)) {
  for (const style of STYLES) {
    fixtures.push(buildFixture(`${ats}-full/${style}`, `ats:${ats}`, url, fullFields, style));
    fixtures.push(buildFixture(`${ats}-sink/${style}`, `ats:${ats}`, url, sinkFields, style));
  }
}
// A few deliberately-hard variants.
fixtures.push(buildFixture("hard-nonstandard-names", "hard", GENERIC_URL, fullFields, "name"));
fixtures.push(buildFixture("hard-placeholder-only-links", "hard", GENERIC_URL, SHAPES.find((s) => s.key === "links")!.fields, "placeholder"));

describe("autofill form fixtures (~100) — every fillable field verified persisted", () => {
  it("fills all legitimately-fillable fields; pauses sensitive; flags uploads", () => {
    const matrix: Record<string, { pass: number; fail: number; paused: number; flagged: number }> = {};
    const failures: string[] = [];

    for (const fx of fixtures) {
      const bucket = (matrix[fx.category] ??= { pass: 0, fail: 0, paused: 0, flagged: 0 });
      const dom = new JSDOM(fx.html, { url: fx.url });
      const doc = dom.window.document;
      const adapter = adapterFor(fx.url);
      const form = adapter.detect(doc);
      if (!form) {
        bucket.fail++;
        failures.push(`${fx.name}: no form detected`);
        continue;
      }
      const plan = adapter.plan(form, PROFILE);
      applyFills(doc, plan);

      let ok = true;
      // 1) Every mapped identity field must be filled with the exact value.
      for (const [id, expected] of Object.entries(fx.expectFills)) {
        const el = doc.querySelector(`#${id}`) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
        const actual = el ? el.value : "(missing)";
        if (actual !== expected) {
          ok = false;
          failures.push(`${fx.name}: field #${id} expected "${expected}" got "${actual}"`);
        }
      }
      // 2) Sensitive questions must be paused (skipped, never filled).
      for (const id of fx.expectPaused) {
        const skipped = plan.skipped.some((s) => s.selector === `#${id}` && /sensitive/i.test(s.reason));
        const el = doc.querySelector(`#${id}`) as HTMLInputElement | HTMLSelectElement | null;
        if (!skipped || (el && el.value)) {
          ok = false;
          failures.push(`${fx.name}: sensitive #${id} not correctly paused`);
        } else bucket.paused++;
      }
      // 3) File upload must be flagged (never scripted in the browser path).
      if (fx.expectFile) {
        if (!plan.fileField) {
          ok = false;
          failures.push(`${fx.name}: resume upload not flagged`);
        } else bucket.flagged++;
      }
      // 4) Cover letter / consent / unknown must be left for the user (not filled).
      for (const id of fx.expectSkipped) {
        const el = doc.querySelector(`#${id}`) as HTMLInputElement | HTMLTextAreaElement | null;
        // A checkbox's .value is always "on" regardless of checked, so check .checked.
        const isCheckbox = el?.getAttribute("type") === "checkbox";
        const filled = el ? (isCheckbox ? (el as HTMLInputElement).checked : !!el.value) : false;
        const inSkipped = plan.skipped.some((s) => s.selector === `#${id}`);
        if (filled || !inSkipped) {
          ok = false;
          failures.push(`${fx.name}: #${id} should be left for the user`);
        }
      }

      if (ok) bucket.pass++;
      else bucket.fail++;
    }

    const total = fixtures.length;
    const passed = Object.values(matrix).reduce((n, b) => n + b.pass, 0);
    // Human-readable matrix for the report.
    console.log(
      `\nAUTOFILL FIXTURE MATRIX (${passed}/${total})\n` +
        Object.entries(matrix)
          .map(([c, b]) => `  ${c}: ${b.pass} pass / ${b.fail} fail  (paused ${b.paused}, uploads flagged ${b.flagged})`)
          .join("\n") +
        (failures.length ? `\nFAILURES:\n  ${failures.slice(0, 30).join("\n  ")}` : ""),
    );

    expect(total).toBeGreaterThanOrEqual(100);
    expect(failures).toEqual([]);
    expect(passed).toBe(total);
  });
});

// Reproduces the REAL Ashby (Linear) structure that broke live: NO <form> element,
// application fields rendered inside a SHADOW ROOT, _systemfield_* ids/names, labels
// via <label for=id> (el.labels), UUID custom-question names, and a bare light-DOM
// file input with no name/label. Regression guard for the shadow-DOM fix.
describe("Ashby formless shadow-DOM application (real Linear layout)", () => {
  it("detects fields inside the shadow root, fills name/email/github/linkedin/location, flags resume", () => {
    const dom = new JSDOM(`<!doctype html><html><body><input type="file" /><div id="host"></div></body></html>`, {
      url: "https://jobs.ashbyhq.com/linear/application",
    });
    const host = dom.window.document.getElementById("host")!;
    const sr = host.attachShadow({ mode: "open" });
    sr.innerHTML = `
      <div><label for="_systemfield_name">Name</label><input id="_systemfield_name" name="_systemfield_name" type="text"/></div>
      <div><label for="_systemfield_email">Email</label><input id="_systemfield_email" name="_systemfield_email" type="text"/></div>
      <div><label for="_systemfield_resume">Resume</label><input id="_systemfield_resume" name="_systemfield_resume" type="file"/></div>
      <div><label for="u1">Github</label><input id="u1" name="1c843a13-aaaa-bbbb" type="text"/></div>
      <div><label for="u2">LinkedIn</label><input id="u2" name="ca5c9d78-cccc-dddd" type="text"/></div>
      <div><label for="u3">What country are you based in?</label><input id="u3" name="dd11-eeee" type="text"/></div>
      <div><label for="u4">Notice Period</label><input id="u4" name="ff22-gggg" type="text"/></div>
      <div><label for="u5">Cover letter</label><textarea id="u5" name="hh33-iiii"></textarea></div>`;
    const doc = dom.window.document;

    const form = ashby.detect(doc);
    expect(form).not.toBeNull();
    // 1 bare file input + 8 shadow controls — NOT just the single light-DOM file input.
    expect(form!.fields.length).toBeGreaterThanOrEqual(8);

    const plan = ashby.plan(form!, PROFILE);
    applyFills(doc, plan);

    expect((sr.querySelector("#_systemfield_name") as HTMLInputElement).value).toBe(PROFILE.name);
    expect((sr.querySelector("#_systemfield_email") as HTMLInputElement).value).toBe(PROFILE.email);
    expect((sr.querySelector("#u1") as HTMLInputElement).value).toBe(PROFILE.github);
    expect((sr.querySelector("#u2") as HTMLInputElement).value).toBe(PROFILE.linkedin);
    expect((sr.querySelector("#u3") as HTMLInputElement).value).toBe(PROFILE.location); // country → location
    // Resume upload flagged for the user (never scripted), cover letter left for review.
    expect(plan.fileField).not.toBeNull();
    expect(plan.skipped.some((s) => /cover letter/i.test(s.reason))).toBe(true);
  });
});
