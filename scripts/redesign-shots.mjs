// Captures every key route at desktop/tablet/mobile widths against the local dev
// server, logging per-page console errors + rendered width (to catch overflow).
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE || "http://localhost:3000";
const OUT = process.env.OUT || "/tmp/vaylo-redesign";
const WIDTHS = { desktop: 1440, tablet: 820, mobile: 390 };
fs.mkdirSync(OUT, { recursive: true });

const email = `rd+${Date.now()}@example.test`;
const password = "ValidPass123";
const rows = [];

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });

async function capture(ctx, label, path, width) {
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  page.on("pageerror", (e) => errs.push(String(e)));
  let status = 0;
  try {
    const r = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    status = r ? r.status() : 0;
    await page.waitForTimeout(700);
  } catch (e) {
    rows.push({ label, width, status: "ERR", scrollW: 0, vw: WIDTHS[width], errs: [String(e).slice(0, 120)] });
    await page.close();
    return;
  }
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth).catch(() => 0);
  await page.screenshot({ path: `${OUT}/${label}-${width}.png`, fullPage: false }).catch(() => {});
  rows.push({ label, width, status, scrollW, vw: WIDTHS[width], errs });
  await page.close();
}

async function run(width) {
  const ctx = await browser.newContext({ viewport: { width: WIDTHS[width], height: 1000 } });
  // public
  for (const [label, path] of [
    ["home", "/"], ["pricing", "/pricing"], ["demo", "/demo"],
    ["jobs", "/jobs"], ["jobs-demo", "/jobs/demo"], ["login", "/login"], ["signup", "/signup"],
  ]) await capture(ctx, label, path, width);

  // authed: sign up in this context, then visit app routes
  const lp = await ctx.newPage();
  await lp.goto(`${BASE}/signup`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await lp.fill("input[name=email]", `${width}-${email}`);
  await lp.fill("input[name=password]", password);
  if (await lp.locator("input[name=name]").count()) await lp.fill("input[name=name]", "Redesign Tester");
  await Promise.all([lp.waitForURL("**/app**", { timeout: 60000 }).catch(() => {}), lp.click("button[type=submit]")]);
  await lp.close();

  for (const [label, path] of [
    ["app-dashboard", "/app"], ["app-profile", "/app/profile"], ["app-tracker", "/app/applications"],
    ["app-auto-apply", "/app/auto-apply"], ["app-job-new", "/app/jobs/new"],
    ["app-billing", "/app/settings/billing"], ["app-extension", "/app/settings/extension"],
  ]) await capture(ctx, label, path, width);

  await ctx.close();
}

for (const w of Object.keys(WIDTHS)) {
  console.log(`--- ${w} (${WIDTHS[w]}px) ---`);
  await run(w);
}
await browser.close();

// Report
console.log("\nLABEL                WIDTH    STATUS  SCROLLW  OVERFLOW  ERRS");
for (const r of rows) {
  const overflow = r.scrollW > r.vw + 1 ? `YES(+${r.scrollW - r.vw})` : "no";
  console.log(
    `${r.label.padEnd(20)} ${String(r.vw).padEnd(8)} ${String(r.status).padEnd(7)} ${String(r.scrollW).padEnd(8)} ${overflow.padEnd(9)} ${r.errs.length}`,
  );
}
const anyErr = rows.filter((r) => r.errs.length);
if (anyErr.length) {
  console.log("\nCONSOLE ERRORS:");
  for (const r of anyErr) console.log(`  ${r.label}-${r.width}: ${r.errs.slice(0, 2).join(" | ")}`);
}
console.log(`\nScreenshots in ${OUT}`);
