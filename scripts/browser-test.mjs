// Headless-browser smoke/visual test for the live JobFlow site.
// Drives a real Chromium via Playwright: exercises signup -> dashboard -> pages
// -> logout -> login, screenshots each step, and checks that CSS actually renders.
//
// Usage:  BASE=http://13.238.23.72 OUT=/tmp/shots node scripts/browser-test.mjs
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE || "http://13.238.23.72";
const OUT = process.env.OUT || "/tmp/jf-shots";
fs.mkdirSync(OUT, { recursive: true });

const email = `pwtest+${Date.now()}@example.test`;
const password = "TestPass123!";
const results = [];
const ok = (n, cond, info = "") => { results.push({ n, pass: !!cond, info }); console.log(`${cond ? "PASS" : "FAIL"}  ${n}${info ? "  — " + info : ""}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

async function shot(name) { await page.screenshot({ path: `${OUT}/${name}.png` }); }

try {
  // 1. Homepage + CSS-applied check
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await shot("01-home");
  const h1 = (await page.locator("h1").first().innerText().catch(() => "")).trim();
  const h1Size = await page.locator("h1").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize)).catch(() => 0);
  const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  ok("home: h1 present", h1.length > 0, h1);
  ok("home: CSS applied (h1 font-size > 24px)", h1Size > 24, `${h1Size}px`);
  ok("home: non-serif body font (Tailwind preflight)", !/^(times|serif)/i.test(bodyFont.trim()), bodyFont);

  // 2. Signup
  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  if (await page.locator("input[name=name]").count()) await page.fill("input[name=name]", "PW Test");
  await shot("02-signup");
  await Promise.all([
    page.waitForURL("**/app**", { timeout: 20000 }).catch(() => {}),
    page.click("button[type=submit]"),
  ]);
  ok("signup -> lands on /app", page.url().includes("/app"), page.url());
  await shot("03-dashboard");

  // 3. Authed pages render
  for (const [name, path] of [["04-profile", "/app/profile"], ["05-auto-apply", "/app/auto-apply"], ["06-applications", "/app/applications"], ["07-billing", "/app/settings/billing"]]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await shot(name);
    const txt = (await page.locator("body").innerText()).trim();
    ok(`authed page ${path} renders`, txt.length > 80 && !page.url().includes("/login"), `${txt.length} chars`);
  }

  // 4. Browse jobs (public, arbeitnow provider)
  await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle" });
  await shot("08-jobs");
  const jobsTxt = (await page.locator("body").innerText());
  ok("jobs page renders", jobsTxt.length > 120, `${jobsTxt.length} chars`);

  // 5. Logout (click the logout control)
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  const logout = page.locator("button:has-text('Log out'), button:has-text('Logout'), button:has-text('Sign out'), a:has-text('Log out')").first();
  if (await logout.count()) {
    await Promise.all([page.waitForLoadState("networkidle"), logout.click()]);
    ok("logout works", !page.url().includes("/app") || page.url().endsWith("/"), page.url());
  } else {
    ok("logout control found", false, "no logout button located");
  }

  // 6. Login with the account just created
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await shot("09-login");
  await Promise.all([page.waitForURL("**/app**", { timeout: 20000 }).catch(() => {}), page.click("button[type=submit]")]);
  ok("login -> lands on /app", page.url().includes("/app"), page.url());
  await shot("10-after-login");

  // 7. Mobile viewport render
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await shot("11-mobile-home");
  ok("no console/page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  ok("script completed without throwing", false, String(e));
} finally {
  await browser.close();
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n==== ${passed}/${results.length} passed ====  screenshots in ${OUT}`);
console.log(`TEST_EMAIL=${email}`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
