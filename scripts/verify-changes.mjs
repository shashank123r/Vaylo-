import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
const BASE = process.env.BASE || "http://13.238.23.72";
const OUT = process.env.OUT || "/tmp/jf-changes";
const RESUME = path.resolve("tests/fixtures/sample.pdf");
fs.mkdirSync(OUT, { recursive: true });
const email = `chg+${Date.now()}@example.test`, pw = "ValidPass123";
const R = []; const ok = (n, c, i = "") => { R.push(!!c); console.log(`${c ? "PASS" : "FAIL"}  ${n}${i ? "  — " + i : ""}`); };
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
try {
  // signup
  await p.goto(`${BASE}/signup`, { waitUntil: "domcontentloaded" });
  await p.fill("input[name=email]", email); await p.fill("input[name=password]", pw);
  if (await p.locator("input[name=name]").count()) await p.fill("input[name=name]", "Chg");
  await Promise.all([p.waitForURL("**/app**").catch(() => {}), p.click("button[type=submit]")]);

  // profile personal: required asterisks + required attribute
  await p.goto(`${BASE}/app/profile?s=personal`, { waitUntil: "domcontentloaded" });
  const legalReq = await p.locator("input[name=legalName]").first().getAttribute("required");
  const phoneReq = await p.locator("input[name=phone]").first().getAttribute("required");
  await p.screenshot({ path: `${OUT}/profile-personal.png` });
  ok("Legal name is required", legalReq !== null);
  ok("Phone is required", phoneReq !== null);

  // upload a resume (documents section)
  await p.goto(`${BASE}/app/profile?s=documents`, { waitUntil: "domcontentloaded" });
  const fi = p.locator("input[name=resume]").first();
  if (await fi.count()) {
    await fi.setInputFiles(RESUME);
    const rf = fi.locator("xpath=ancestor::form[1]");
    await Promise.all([p.waitForLoadState("networkidle"), rf.locator("button[type=submit]").first().click()]);
  }
  // now the "Fill from résumé" button should be present
  await p.goto(`${BASE}/app/profile?s=personal`, { waitUntil: "domcontentloaded" });
  const fillBtn = p.locator("button:has-text('Fill from')");
  const hasFill = (await fillBtn.count()) > 0;
  await p.screenshot({ path: `${OUT}/profile-fillbtn.png` });
  ok("'Fill from résumé' button present after upload", hasFill);
  if (hasFill) {
    await Promise.all([p.waitForLoadState("networkidle"), fillBtn.first().click()]);
    const banner = await p.locator("body").innerText();
    ok("fill-from-resume ran (banner shown)", /from your resume|Filled|Nothing new/i.test(banner));
    await p.screenshot({ path: `${OUT}/profile-after-fill.png` });
  }

  // preferences: target roles required
  await p.goto(`${BASE}/app/profile?s=preferences`, { waitUntil: "domcontentloaded" });
  const ttReq = await p.locator("input[name=targetTitles]").first().getAttribute("required");
  ok("Target roles is required", ttReq !== null);

  // auto-apply: FREE user -> only in-browser mode, NOT the paid auto-submit
  await p.goto(`${BASE}/app/auto-apply`, { waitUntil: "domcontentloaded" });
  const aaText = await p.locator("body").innerText();
  await p.screenshot({ path: `${OUT}/auto-apply-free.png` });
  ok("auto-apply shows in-browser (free) mode", /in your browser|Run in my browser|extension/i.test(aaText));
  ok("auto-apply does NOT show paid auto-submit for free user", !/I authorize JobFlow to submit/i.test(aaText));
  ok("auto-apply sidebar shows plan + quota", /Free plan/i.test(aaText) && /submissions left/i.test(aaText));

  // centered pages render
  for (const [n, r] of [["billing", "/app/settings/billing"], ["jobs-new", "/app/jobs/new"], ["extension", "/app/settings/extension"]]) {
    await p.goto(`${BASE}${r}`, { waitUntil: "domcontentloaded" });
    await p.screenshot({ path: `${OUT}/page-${n}.png` });
  }
} catch (e) { ok("ran without throwing", false, String(e)); } finally { await b.close(); }
const pass = R.filter(Boolean).length; console.log(`\n==== ${pass}/${R.length} passed ====  shots: ${OUT}`);
console.log(`EMAIL=${email}`);
process.exit(pass === R.length ? 0 : 1);
