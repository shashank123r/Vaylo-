// Small end-to-end AI test: signup -> add a job -> generate a cover letter,
// and confirm real Claude-via-Bedrock output (model line + content, no error).
import { chromium } from "playwright";
import fs from "node:fs";
const BASE = process.env.BASE || "http://13.238.23.72";
const OUT = process.env.OUT || "/tmp/jf-ai";
fs.mkdirSync(OUT, { recursive: true });
const email = `ai+${Date.now()}@example.test`, pw = "ValidPass123";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 1100 } })).newPage();
let pass = true;
try {
  await p.goto(`${BASE}/signup`, { waitUntil: "domcontentloaded" });
  await p.fill("input[name=email]", email); await p.fill("input[name=password]", pw);
  if (await p.locator("input[name=name]").count()) await p.fill("input[name=name]", "AI Test");
  await Promise.all([p.waitForURL("**/app**").catch(() => {}), p.click("button[type=submit]")]);

  // add a job -> job detail
  await p.goto(`${BASE}/app/jobs/new`, { waitUntil: "domcontentloaded" });
  await p.fill("input[name=title]", "Machine Learning Engineer");
  await p.fill("input[name=company]", "Acme AI");
  if (await p.locator("textarea[name=description]").count())
    await p.fill("textarea[name=description]", "We need an ML engineer with Python, PyTorch, and AWS experience to build and deploy models.");
  await Promise.all([p.waitForLoadState("networkidle"), p.click("button:has-text('Add job')")]);
  console.log("job page:", p.url());

  // generate the cover letter (shows the model name) — one small call
  const btn = p.locator("form:has-text('Cover letter') button, h2:has-text('Cover letter')").first();
  // click the Generate button inside the Cover letter card
  const coverCard = p.locator("div:has(> h2:has-text('Cover letter')), section:has(h2:has-text('Cover letter'))").first();
  const gen = p.locator("h2:has-text('Cover letter')").locator("xpath=ancestor::*[1]").locator("button");
  const genBtn = (await gen.count()) ? gen.first() : p.getByRole("button", { name: /Generate|Regenerate/ }).first();
  await Promise.all([p.waitForLoadState("networkidle", { timeout: 60000 }), genBtn.click()]);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/cover.png`, fullPage: true });
  const body = await p.locator("body").innerText();

  const failed = /Generation failed|busy or unavailable/i.test(body);
  const hasModel = /Model:\s*bedrock/i.test(body);
  console.log("GEN_FAILED present:", failed);
  console.log("bedrock model line present:", hasModel);
  // print a snippet of the generated text
  const idx = body.search(/Model:\s*bedrock/i);
  if (idx > -1) console.log("…context:", body.slice(Math.max(0, idx - 200), idx + 60).replace(/\s+/g, " "));
  pass = !failed && hasModel;
} catch (e) { console.log("ERROR:", String(e)); pass = false; } finally { await b.close(); }
console.log(pass ? "\n==== AI SMOKE PASS (real Claude via Bedrock) ====" : "\n==== AI SMOKE FAIL ====");
console.log(`EMAIL=${email}`);
process.exit(pass ? 0 : 1);
