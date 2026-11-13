// Visits EVERY page in a real browser, screenshots each, and records per-page
// console errors, HTTP status, and rendered size. Reports a table at the end.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE || "http://13.238.23.72";
const OUT = process.env.OUT || "/tmp/jf-allpages";
fs.mkdirSync(OUT, { recursive: true });
const email = `pages+${Date.now()}@example.test`;
const password = "ValidPass123";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();

let curErrors = [];
page.on("console", (m) => m.type() === "error" && curErrors.push(m.text()));
page.on("pageerror", (e) => curErrors.push(String(e)));

const rows = [];
async function visit(name, path, { screenshot = true } = {}) {
  curErrors = [];
  let status = 0;
  try {
    const resp = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    status = resp ? resp.status() : 0;
  } catch (e) {
    rows.push({ name, path, status: "ERR", len: 0, errs: [String(e)], finalUrl: page.url() });
    return;
  }
  const len = (await page.locator("body").innerText().catch(() => "")).trim().length;
  if (screenshot) await page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
  rows.push({ name, path, status, len, errs: [...curErrors], finalUrl: page.url() });
}

async function login() {
  await page.goto(`${BASE}/signup`, { waitUntil: "domcontentloaded" });
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  if (await page.locator("input[name=name]").count()) await page.fill("input[name=name]", "Pages Tester");
  await Promise.all([page.waitForURL("**/app**", { timeout: 20000 }).catch(() => {}), page.click("button[type=submit]")]);
}

try {
  // ---- PUBLIC pages (logged out) ----
  await visit("pub-home", "/");
  await visit("pub-pricing", "/pricing");
  await visit("pub-demo", "/demo");
  await visit("pub-jobs", "/jobs");
  await visit("pub-jobs-demo", "/jobs/demo");
  await visit("pub-login", "/login");
  await visit("pub-signup", "/signup");

  // a real job detail id (from the Browse Jobs list) + a demo job detail id
  await page.goto(`${BASE}/jobs`, { waitUntil: "domcontentloaded" });
  const realHref = await page.locator("a[href^='/jobs/']").first().getAttribute("href").catch(() => null);
  if (realHref && !realHref.includes("/demo")) await visit("pub-job-detail", realHref);
  await page.goto(`${BASE}/jobs/demo`, { waitUntil: "domcontentloaded" });
  const demoHref = await page.locator("a[href^='/jobs/demo/']").first().getAttribute("href").catch(() => null);
  if (demoHref) await visit("pub-demo-detail", demoHref);

  // ---- AUTHED pages ----
  await login();
  await visit("app-dashboard", "/app");
  await visit("app-profile", "/app/profile");
  await visit("app-tracker", "/app/applications");
  await visit("app-auto-apply", "/app/auto-apply");
  await visit("app-job-new", "/app/jobs/new");
  await visit("app-billing", "/app/settings/billing");
  await visit("app-extension", "/app/settings/extension");

  // create a job -> its detail page
  await page.goto(`${BASE}/app/jobs/new`, { waitUntil: "domcontentloaded" });
  await page.fill("input[name=title]", "QA Engineer");
  await page.fill("input[name=company]", "PageTest Co");
  await Promise.all([page.waitForLoadState("networkidle"), page.click("button:has-text('Add job')")]);
  if (page.url().includes("/app/jobs/")) {
    curErrors = [];
    const len = (await page.locator("body").innerText()).trim().length;
    await page.screenshot({ path: `${OUT}/app-job-detail.png` });
    rows.push({ name: "app-job-detail", path: page.url().replace(BASE, ""), status: 200, len, errs: [...curErrors], finalUrl: page.url() });
  }
} catch (e) {
  rows.push({ name: "FATAL", path: "-", status: "ERR", len: 0, errs: [String(e)], finalUrl: page.url() });
} finally {
  await browser.close();
}

console.log("\nPAGE".padEnd(20), "STATUS".padEnd(8), "SIZE".padEnd(7), "CONSOLE-ERRORS");
let bad = 0;
for (const r of rows) {
  const okStatus = r.status === 200 || (typeof r.status === "number" && r.status >= 200 && r.status < 400);
  const okRender = r.len > 50;
  const okErrs = r.errs.length === 0;
  if (!(okStatus && okRender && okErrs)) bad++;
  const flag = okStatus && okRender && okErrs ? "ok" : "*** CHECK ***";
  console.log(r.name.padEnd(20), String(r.status).padEnd(8), String(r.len).padEnd(7), (r.errs[0] || "").slice(0, 50), flag);
}
console.log(`\n==== ${rows.length - bad}/${rows.length} pages clean ====  shots in ${OUT}`);
console.log(`TEST_EMAIL=${email}`);
process.exit(bad === 0 ? 0 : 1);
