// Full interactive browser regression for JobFlow (real Chromium via Playwright).
// Covers: signup form -> dashboard -> profile save/persist -> resume upload ->
// browse/save job -> tracker -> auto-apply -> logout -> login -> session persist
// -> mobile. Screenshots each step; verifies no console errors.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE || "http://13.238.23.72";
const OUT = process.env.OUT || "/tmp/jf-reg";
const RESUME = process.env.RESUME || path.resolve("tests/fixtures/sample.pdf");
fs.mkdirSync(OUT, { recursive: true });

const email = `reg+${Date.now()}@example.test`;
const password = "ValidPass123";
const R = [];
const ok = (n, c, info = "") => { R.push({ n, pass: !!c }); console.log(`${c ? "PASS" : "FAIL"}  ${n}${info ? "  — " + info : ""}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
page.on("pageerror", (e) => errs.push(String(e)));
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });

try {
  // --- 1. Signup via the real form ---
  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  if (await page.locator("input[name=name]").count()) await page.fill("input[name=name]", "Reg Tester");
  await Promise.all([page.waitForURL("**/app**", { timeout: 20000 }).catch(() => {}), page.click("button[type=submit]")]);
  ok("signup form -> dashboard", page.url().includes("/app"), page.url());
  await shot("01-dashboard");

  // --- 2. Profile: fill + SAVE + verify persistence after reload ---
  await page.goto(`${BASE}/app/profile`, { waitUntil: "networkidle" });
  await shot("02-profile-top");
  const pctBefore = (await page.locator("text=/%/").first().innerText().catch(() => "")).trim();
  const locInput = page.locator("input[name=location]").first();
  let persisted = false;
  if (await locInput.count()) {
    await locInput.fill("Bengaluru, India");
    const phone = page.locator("input[name=phone]").first();
    if (await phone.count()) await phone.fill("+91 9000000000");
    const form = locInput.locator("xpath=ancestor::form[1]");
    await Promise.all([page.waitForLoadState("networkidle"), form.locator("button[type=submit]").first().click()]);
    await page.goto(`${BASE}/app/profile`, { waitUntil: "networkidle" });
    persisted = (await page.locator("input[name=location]").first().inputValue().catch(() => "")) === "Bengaluru, India";
  }
  ok("profile save persists after reload", persisted, "location=Bengaluru, India");
  const pctAfter = (await page.locator("text=/%/").first().innerText().catch(() => "")).trim();
  ok("completion % present", /%/.test(pctAfter), `before:${pctBefore} after:${pctAfter}`);

  // --- 3. Resume upload ---
  const fileInput = page.locator("input[name=resume]").first();
  let uploaded = false;
  if (await fileInput.count()) {
    await fileInput.setInputFiles(RESUME);
    const rform = fileInput.locator("xpath=ancestor::form[1]");
    await Promise.all([page.waitForLoadState("networkidle"), rform.locator("button[type=submit]").first().click()]);
    await page.goto(`${BASE}/app/profile`, { waitUntil: "networkidle" });
    uploaded = (await page.locator("a:has-text('Download')").count()) > 0;
  }
  await shot("03-after-resume");
  ok("resume upload shows a stored file (Download link)", uploaded);

  // --- 4. Browse jobs + Save one ---
  await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle" });
  await shot("04-jobs");
  const saveBtn = page.locator("button:has-text('Save'), a:has-text('Save')").first();
  let saved = false;
  if (await saveBtn.count()) { await Promise.all([page.waitForLoadState("networkidle"), saveBtn.click()]); saved = true; }
  ok("save job action clickable", saved);

  // --- 5. Tracker shows activity ---
  await page.goto(`${BASE}/app/applications`, { waitUntil: "networkidle" });
  await shot("05-tracker");
  ok("tracker page renders", (await page.locator("body").innerText()).length > 60 && !page.url().includes("/login"));

  // --- 6. Auto-apply screen ---
  await page.goto(`${BASE}/app/auto-apply`, { waitUntil: "networkidle" });
  await shot("06-auto-apply");
  ok("auto-apply page renders", (await page.locator("body").innerText()).length > 120);

  // --- 7. Logout ---
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  const logout = page.locator("button:has-text('Sign out'), button:has-text('Log out'), a:has-text('Sign out')").first();
  if (await logout.count()) await Promise.all([page.waitForLoadState("networkidle"), logout.click()]);
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  ok("after logout, /app redirects to login", page.url().includes("/login"), page.url());

  // --- 8. Login again + session persists across reload ---
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await Promise.all([page.waitForURL("**/app**", { timeout: 20000 }).catch(() => {}), page.click("button[type=submit]")]);
  ok("login -> dashboard", page.url().includes("/app"), page.url());
  await page.reload({ waitUntil: "networkidle" });
  ok("session persists across reload", page.url().includes("/app") && !page.url().includes("/login"));

  // --- 9. Mobile render ---
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await shot("07-mobile-home");
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  await shot("08-mobile-dashboard");
  ok("mobile dashboard renders", page.url().includes("/app"));

  ok("no console/page errors", errs.length === 0, errs.slice(0, 4).join(" | "));
} catch (e) {
  ok("regression ran without throwing", false, String(e));
} finally {
  await browser.close();
}
const passed = R.filter((r) => r.pass).length;
console.log(`\n==== ${passed}/${R.length} passed ====  shots: ${OUT}`);
console.log(`TEST_EMAIL=${email}`);
process.exit(passed === R.length ? 0 : 1);
