import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { generic, adapterFor, pickAdapter } from "../extension/src/adapters/index";
import { detectBlock } from "../extension/src/block";
import { applyFills } from "../extension/src/fill";
import { pickCareersJobLinks, type DiscoveredLink } from "../extension/src/jobfilter";
import type { AutofillProfile } from "../extension/src/adapters/types";

// Mirrors the content script's readAnchorsInPage: gather absolute URL + text.
function anchorsOf(doc: Document, pageUrl: string): DiscoveredLink[] {
  return Array.from(doc.querySelectorAll("a[href]")).map((a) => {
    let url = a.getAttribute("href") || "";
    try {
      url = new URL(url, pageUrl).toString();
    } catch {
      /* keep raw */
    }
    const title = (a.querySelector("h1,h2,h3,h4")?.textContent || a.textContent || "").replace(/\s+/g, " ").trim();
    return { url, title };
  });
}

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

describe("adapterFor fallback", () => {
  it("uses a dedicated adapter when available, else generic", () => {
    expect(adapterFor("https://boards.greenhouse.io/acme/jobs/1").name).toBe("greenhouse");
    expect(adapterFor("https://careers.acme.com/apply").name).toBe("generic");
    // pickAdapter stays specific-only (null for non-ATS) — preserves existing behavior.
    expect(pickAdapter("https://careers.acme.com/apply")).toBeNull();
  });
});

describe("generic adapter on a custom portal form", () => {
  it("detects the form, fills safe fields, skips sensitive, flags upload", () => {
    const doc = docOf("generic-portal.html");
    const form = generic.detect(doc)!;
    expect(form).not.toBeNull();
    expect(form.ats).toBe("generic");
    expect(form.title).toBe("Senior Platform Engineer");

    const plan = generic.plan(form, profile);
    // Safe fields are mapped.
    expect(plan.fills.find((f) => f.key === "email")?.value).toBe(profile.email);
    expect(plan.fills.find((f) => f.key === "fullName")?.value).toBe(profile.name);
    expect(plan.fills.find((f) => f.key === "phone")?.value).toBe(profile.phone);
    expect(plan.fills.find((f) => f.key === "linkedin")?.value).toBe(profile.linkedin);
    expect(plan.fills.find((f) => f.key === "github")?.value).toBe(profile.github);
    // No fill is ever a sensitive question.
    for (const fill of plan.fills) expect(fill.key.startsWith("sensitive:")).toBe(false);
    // The sponsorship question is detected and skipped with an explanation.
    expect(plan.skipped.some((s) => /Sensitive/i.test(s.reason))).toBe(true);
    // The resume upload control is detected (user must attach; scripts can't).
    expect(plan.fileField).not.toBeNull();
    // Cover letter is left for the user.
    expect(plan.skipped.some((s) => /cover letter/i.test(s.reason))).toBe(true);
  });

  it("actually writes the values into the live DOM and never submits", () => {
    const dom = new JSDOM(html("generic-portal.html"));
    const doc = dom.window.document;
    const form = generic.detect(doc)!;
    const plan = generic.plan(form, profile);
    const outcome = applyFills(doc, plan);
    expect(outcome.filled.length).toBeGreaterThanOrEqual(5);
    expect((doc.querySelector("#em") as HTMLInputElement).value).toBe(profile.email);
    expect((doc.querySelector("#fn") as HTMLInputElement).value).toBe(profile.name);
    // Sensitive + file + cover letter are untouched.
    expect((doc.querySelector("#visa") as HTMLInputElement).value).toBe("");
    expect((doc.querySelector("#cv") as HTMLInputElement).value).toBe("");
  });
});

describe("generic adapter conservatism (no false positives)", () => {
  it("does NOT treat a newsletter signup as an application", () => {
    expect(generic.detect(docOf("newsletter.html"))).toBeNull();
  });
});

describe("careers landing page → crawl to real postings (the Anthropic live bug)", () => {
  it("gathers anchors from a careers page and keeps only the job-board / posting links", () => {
    const pageUrl = "https://www.anthropic.com/careers";
    const anchors = anchorsOf(docOf("careers-landing.html"), pageUrl);
    const links = pickCareersJobLinks(anchors, pageUrl);
    const urls = links.map((l) => l.url);
    // The two Greenhouse postings, the Greenhouse board, and the same-origin job.
    expect(urls).toContain("https://job-boards.greenhouse.io/anthropic/jobs/4020295008");
    expect(urls).toContain("https://job-boards.greenhouse.io/anthropic/jobs/4020295009");
    expect(urls).toContain("https://boards.greenhouse.io/anthropic");
    expect(urls).toContain("https://www.anthropic.com/jobs/data-scientist");
    // Nav / social / legal links are dropped.
    expect(urls.some((u) => /\/about$|twitter|\/privacy$|\/careers$|anthropic\.com\/$/.test(u))).toBe(false);
    expect(links.length).toBe(4);
  });
});

describe("login / CAPTCHA pause", () => {
  it("flags a sign-in wall as blocked", () => {
    expect(detectBlock(docOf("login-wall.html"))).toMatch(/sign-in/i);
  });
  it("does NOT flag a normal application form", () => {
    expect(detectBlock(docOf("generic-portal.html"))).toBeNull();
  });
});
