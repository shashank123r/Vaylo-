import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { pickAdapter, greenhouse, lever, ashby, collectValidationErrors } from "../extension/src/adapters/index";
import type { AutofillProfile } from "../extension/src/adapters/types";

const html = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/ats/${name}`, import.meta.url)), "utf8");
const docOf = (name: string) => new JSDOM(html(name)).window.document;

const profile: AutofillProfile = {
  name: "Shashank R",
  email: "shashank@example.com",
  phone: "+91 90000 00000",
  location: "Hyderabad",
  website: "https://shashank.dev",
  linkedin: "https://linkedin.com/in/shashankr2005",
  github: "https://github.com/shashank123r",
};

describe("adapter routing", () => {
  it("routes each ATS url and returns null for unsupported sites", () => {
    expect(pickAdapter("https://boards.greenhouse.io/acme/jobs/1")?.name).toBe("greenhouse");
    expect(pickAdapter("https://jobs.lever.co/clearwater/abc")?.name).toBe("lever");
    expect(pickAdapter("https://jobs.ashbyhq.com/terrapin/abc")?.name).toBe("ashby");
    expect(pickAdapter("https://careers.example.com/apply")).toBeNull();
  });
});

function checkSafety(form: ReturnType<typeof greenhouse.detect>, plan: ReturnType<typeof greenhouse.plan>) {
  // No fill is ever a sensitive question.
  for (const fill of plan.fills) expect(fill.key.startsWith("sensitive:")).toBe(false);
  // A sensitive question is present and was skipped with an explanation.
  const sensitive = form!.fields.find((f) => f.key.startsWith("sensitive:"));
  expect(sensitive).toBeDefined();
  expect(plan.skipped.some((s) => /Sensitive/i.test(s.reason))).toBe(true);
  // The resume file control is detected (for real file upload, not a text fill).
  expect(plan.fileField).not.toBeNull();
}

describe("greenhouse adapter", () => {
  it("detects the form, maps safe fields, and skips sensitive ones", () => {
    const doc = docOf("greenhouse.html");
    const form = greenhouse.detect(doc)!;
    expect(form.title).toBe("Senior ML Engineer");
    const plan = greenhouse.plan(form, profile);
    const emailFill = plan.fills.find((f) => f.key === "email");
    expect(emailFill?.value).toBe(profile.email);
    expect(plan.fills.find((f) => f.key === "firstName")?.value).toBe("Shashank");
    expect(plan.fills.find((f) => f.key === "lastName")?.value).toBe("R");
    expect(plan.fills.find((f) => f.key === "linkedin")?.value).toBe(profile.linkedin);
    // Cover letter and unknown custom question are left for the user.
    expect(plan.skipped.some((s) => /Cover letter/i.test(s.reason))).toBe(true);
    expect(plan.skipped.some((s) => /Unrecognized/i.test(s.reason))).toBe(true);
    checkSafety(form, plan);
  });
});

describe("lever adapter (wrapping labels)", () => {
  it("reads labels from wrapping <label> and maps full name", () => {
    const doc = docOf("lever.html");
    const form = lever.detect(doc)!;
    expect(form.title).toBe("Generative AI Engineer");
    const plan = lever.plan(form, profile);
    expect(plan.fills.find((f) => f.key === "fullName")?.value).toBe(profile.name);
    expect(plan.fills.find((f) => f.key === "email")?.value).toBe(profile.email);
    checkSafety(form, plan);
  });
});

describe("navigation / multi-step detection", () => {
  it("flags a single-step form (submit, no next)", () => {
    const form = greenhouse.detect(docOf("greenhouse.html"))!;
    expect(form.nav.hasSubmit).toBe(true);
    expect(form.nav.hasNext).toBe(false);
    expect(form.multiStep).toBe(false);
  });

  it("flags a multi-step form (next present)", () => {
    const form = greenhouse.detect(docOf("greenhouse-multistep.html"))!;
    expect(form.nav.hasNext).toBe(true);
    expect(form.multiStep).toBe(true);
    expect(form.nav.nextLabel).toMatch(/continue/i);
  });
});

describe("validation-error detection", () => {
  it("reports aria-invalid fields with their messages and alert text", () => {
    const doc = docOf("greenhouse-errors.html");
    const errors = collectValidationErrors(doc.querySelector("form")!, doc);
    expect(errors.some((e) => /valid email/i.test(e.message))).toBe(true);
    expect(errors.some((e) => /problem with your submission/i.test(e.message))).toBe(true);
  });
});

describe("ashby adapter (aria-label)", () => {
  it("reads aria-labels and skips a missing-data field with a reason", () => {
    const doc = docOf("ashby.html");
    const form = ashby.detect(doc)!;
    expect(form.title).toBe("Computer Vision Engineer");
    const noWebsiteProfile: AutofillProfile = { ...profile, phone: null };
    const plan = ashby.plan(form, noWebsiteProfile);
    // Phone has no value now -> skipped with a clear reason, never fabricated.
    expect(plan.fills.find((f) => f.key === "phone")).toBeUndefined();
    expect(plan.skipped.some((s) => /No phone/i.test(s.reason))).toBe(true);
    checkSafety(form, plan);
  });
});
