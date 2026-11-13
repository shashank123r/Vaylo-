// Captures screenshots of every screen + key states for the feature guide.
// Sets up a fully-populated demo account on the live app, then shoots each page.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE || "http://13.238.23.72";
const OUT = process.env.OUT || "docs/feature-screens";
const RESUME = path.resolve("tests/fixtures/sample.pdf");
fs.mkdirSync(OUT, { recursive: true });
const email = `demo+${Date.now()}@example.test`;
const pw = "ValidPass123";
const log = (m) => console.log(m);

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const shot = async (name, full = true) => { await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); log(`  shot ${name}`); };
const go = async (u) => { await p.goto(`${BASE}${u}`, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(400); };
const clickForm = async (sel, btn) => { const el = p.locator(sel).first(); const f = el.locator("xpath=ancestor::form[1]"); await Promise.all([p.waitForLoadState("networkidle"), f.locator(btn).first().click()]); };

try {
  // ---------- PUBLIC (logged out) ----------
  log("PUBLIC");
  await go("/"); await shot("01-landing");
  await go("/pricing"); await shot("02-pricing");
  await go("/demo"); await shot("03-demo");
  await go("/jobs"); await p.waitForTimeout(1500); await shot("04-browse-jobs");
  await go("/jobs/demo"); await shot("05-demo-listings");
  const demoHref = await p.locator("a[href^='/jobs/demo/']").first().getAttribute("href").catch(() => null);
  if (demoHref) { await go(demoHref); await shot("06-demo-job-detail"); }
  await go("/signup"); await shot("07-signup");
  await go("/login"); await shot("08-login");

  // ---------- SIGN UP ----------
  log("SIGNUP");
  await go("/signup");
  await p.fill("input[name=email]", email); await p.fill("input[name=password]", pw);
  if (await p.locator("input[name=name]").count()) await p.fill("input[name=name]", "Priya Sharma");
  await Promise.all([p.waitForURL("**/app**").catch(() => {}), p.click("button[type=submit]")]);
  await shot("09-dashboard-empty");

  // ---------- PROFILE (populate every section) ----------
  log("PROFILE");
  await go("/app/profile"); await shot("10-profile-overview");
  // personal
  await go("/app/profile?s=personal");
  await p.fill("input[name=legalName]", "Priya Sharma");
  await p.fill("input[name=phone]", "+91 90000 00000");
  await p.fill("input[name=city]", "Bengaluru");
  await p.fill("input[name=country]", "India");
  if (await p.locator("input[name=linkedin]").count()) await p.fill("input[name=linkedin]", "https://linkedin.com/in/priya");
  await shot("11-profile-personal");
  await clickForm("input[name=legalName]", "button[type=submit]");
  // preferences
  await go("/app/profile?s=preferences");
  await p.fill("input[name=targetTitles]", "Machine Learning Engineer, Data Scientist");
  if (await p.locator("input[name=targetLocations]").count()) await p.fill("input[name=targetLocations]", "Bengaluru, Remote");
  await shot("12-profile-preferences");
  await clickForm("input[name=targetTitles]", "button[type=submit]");
  // education
  await go("/app/profile?s=education");
  if (await p.locator("input[name=school]").count()) {
    await p.fill("input[name=school]", "IISc Bengaluru");
    if (await p.locator("input[name=degree]").count()) await p.fill("input[name=degree]", "M.Tech");
    if (await p.locator("input[name=field]").count()) await p.fill("input[name=field]", "Computer Science");
    await shot("13-profile-education");
    await clickForm("input[name=school]", "button:has-text('Add')");
  }
  // experience
  await go("/app/profile?s=experience");
  await p.fill("input[name=company]", "DataCorp");
  await p.fill("input[name=title]", "ML Engineer");
  if (await p.locator("textarea[name=highlights]").count()) await p.fill("textarea[name=highlights]", "Built fraud-detection models in PyTorch on AWS; cut false positives 30%.\nShipped SQL data pipelines.");
  await shot("14-profile-experience");
  await clickForm("input[name=company]", "button:has-text('Add')");
  // skills
  await go("/app/profile?s=skills");
  await p.locator("input[name=name]").first().fill("Python, PyTorch, AWS, Docker, SQL");
  await shot("15-profile-skills");
  await clickForm("input[name=name]", "button:has-text('Add')");
  // certifications
  await go("/app/profile?s=certifications");
  if (await p.locator("input[name=name]").count()) {
    await p.locator("input[name=name]").first().fill("AWS Certified ML Specialty");
    await shot("16-profile-certifications");
    await clickForm("input[name=name]", "button:has-text('Add')");
  }
  // declarations
  await go("/app/profile?s=declarations"); await shot("17-profile-declarations");
  // documents + resume upload
  await go("/app/profile?s=documents");
  if (await p.locator("input[name=resume]").count()) {
    await p.locator("input[name=resume]").first().setInputFiles(RESUME);
    await clickForm("input[name=resume]", "button[type=submit]");
  }
  await go("/app/profile?s=documents"); await shot("18-profile-documents");
  await go("/app/profile?s=personal"); await shot("19-profile-fill-from-resume");
  await go("/app/profile"); await shot("20-profile-overview-filled");

  // ---------- DASHBOARD (now with data) ----------
  await go("/app"); await shot("21-dashboard-active");

  // ---------- JOB: create + generate everything ----------
  log("JOB WORKSPACE");
  await go("/app/jobs/new"); await shot("22-job-new");
  await p.fill("input[name=title]", "Senior Machine Learning Engineer");
  await p.fill("input[name=company]", "Acme AI");
  if (await p.locator("textarea[name=description]").count()) await p.fill("textarea[name=description]", "Seeking a Senior ML Engineer with Python, PyTorch, AWS, SQL to build and deploy production ML models and data pipelines.");
  await Promise.all([p.waitForLoadState("networkidle"), p.click("button:has-text('Add job')")]);
  const jobUrl = p.url();
  await shot("23-job-detail-empty");
  // generate tailored resume (x2 for version history), cover, fit
  for (let i = 0; i < 2; i++) { const g = p.getByRole("button", { name: /^(Generate|Regenerate)$/ }).first(); await Promise.all([p.waitForLoadState("networkidle", { timeout: 60000 }), g.click()]); await p.waitForTimeout(1500); await go(jobUrl.replace(BASE, "")); }
  const cov = p.getByRole("button", { name: /^(Generate|Regenerate)$/ }).nth(1); await Promise.all([p.waitForLoadState("networkidle", { timeout: 60000 }), cov.click()]); await p.waitForTimeout(1500);
  await go(jobUrl.replace(BASE, ""));
  const fit = p.locator("button:has-text('Analyze fit')").first(); if (await fit.count()) { await Promise.all([p.waitForLoadState("networkidle", { timeout: 60000 }), fit.click()]); await p.waitForTimeout(1500); await go(jobUrl.replace(BASE, "")); }
  await shot("24-job-detail-full");

  // ---------- AUTO-APPLY (free) ----------
  await go("/app/auto-apply"); await shot("25-auto-apply-free");

  // ---------- TRACKER ----------
  await go("/app/applications"); await shot("26-tracker");

  // ---------- BILLING ----------
  await go("/app/settings/billing"); await shot("27-billing");

  // ---------- EXTENSION SETTINGS ----------
  await go("/app/settings/extension"); await shot("28-extension-settings");

  // ---------- MOBILE ----------
  log("MOBILE");
  await p.setViewportSize({ width: 390, height: 844 });
  await go("/"); await shot("29-mobile-landing");
  await go("/app"); await shot("30-mobile-dashboard");
  await go(jobUrl.replace(BASE, "")); await shot("31-mobile-job-detail");

  log(`DONE. email=${email}`);
} catch (e) { log("ERROR: " + String(e)); } finally { await b.close(); }
