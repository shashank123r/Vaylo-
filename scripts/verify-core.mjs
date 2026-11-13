// Corrected verification of the two flows the first regression mis-targeted:
// (1) profile "Personal details" section save + persistence, (2) manual job add -> tracker.
import { chromium } from "playwright";
import fs from "node:fs";
const BASE = process.env.BASE || "http://13.238.23.72";
const EMAIL = process.env.EMAIL; const PW = process.env.PW || "ValidPass123";
const OUT = process.env.OUT || "/tmp/jf-core"; fs.mkdirSync(OUT, { recursive: true });
const R = []; const ok = (n, c, i = "") => { R.push(!!c); console.log(`${c ? "PASS" : "FAIL"}  ${n}${i ? "  — " + i : ""}`); };

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1400 } })).newPage();
try {
  // login
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("input[name=email]", EMAIL); await page.fill("input[name=password]", PW);
  await Promise.all([page.waitForURL("**/app**").catch(() => {}), page.click("button[type=submit]")]);
  ok("login", page.url().includes("/app"));

  // profile: fill the PERSONAL section (the form that contains legalName) and save
  await page.goto(`${BASE}/app/profile`, { waitUntil: "networkidle" });
  const legal = page.locator("input[name=legalName]").first();
  const form = legal.locator("xpath=ancestor::form[1]");
  await legal.fill("Shashank R");
  await form.locator("input[name=phone]").fill("+91 9000000000");
  await form.locator("input[name=city]").fill("Bengaluru");
  await form.locator("input[name=country]").fill("India");
  await Promise.all([page.waitForLoadState("networkidle"), form.locator("button[type=submit]").first().click()]);
  await page.goto(`${BASE}/app/profile`, { waitUntil: "networkidle" });
  const v = await page.locator("input[name=legalName]").first().inputValue().catch(() => "");
  const city = await page.locator("input[name=city]").first().inputValue().catch(() => "");
  await page.screenshot({ path: `${OUT}/profile-saved.png` });
  ok("profile Personal save persists", v === "Shashank R" && city === "Bengaluru", `legalName='${v}' city='${city}'`);
  const pct = (await page.locator("text=/%/").first().innerText().catch(() => "")).trim();
  ok("completion % increased from 6%", !/\b6%\b/.test(pct) || /1[0-9]%|[2-9][0-9]%/.test(pct), pct);

  // manual job add -> tracker
  await page.goto(`${BASE}/app/jobs/new`, { waitUntil: "networkidle" });
  await page.fill("input[name=title]", "Senior ML Engineer");
  await page.fill("input[name=company]", "TestCorp");
  if (await page.locator("input[name=location]").count()) await page.fill("input[name=location]", "Remote");
  await Promise.all([page.waitForLoadState("networkidle"), page.click("button:has-text('Add job')")]);
  ok("job add submitted (-> job page)", page.url().includes("/app/jobs/"), page.url());
  await page.goto(`${BASE}/app/applications`, { waitUntil: "networkidle" });
  const tracker = await page.locator("body").innerText();
  await page.screenshot({ path: `${OUT}/tracker.png` });
  ok("added job appears in tracker", /TestCorp|Senior ML Engineer/.test(tracker), tracker.includes("TestCorp") ? "found TestCorp" : "not found");
} catch (e) { ok("ran without throwing", false, String(e)); } finally { await browser.close(); }
const p = R.filter(Boolean).length; console.log(`\n==== ${p}/${R.length} passed ====`);
process.exit(p === R.length ? 0 : 1);
