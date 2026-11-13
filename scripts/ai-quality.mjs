import { chromium } from "playwright";
const BASE = process.env.BASE || "http://13.238.23.72";
const EMAIL = process.env.EMAIL, PW = process.env.PW || "ValidPass123", JOB = process.env.JOB;
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 1100 } })).newPage();
try {
  await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await p.fill("input[name=email]", EMAIL); await p.fill("input[name=password]", PW);
  await Promise.all([p.waitForURL("**/app**").catch(() => {}), p.click("button[type=submit]")]);

  // fill personal
  await p.goto(`${BASE}/app/profile?s=personal`, { waitUntil: "domcontentloaded" });
  const legal = p.locator("input[name=legalName]").first();
  await legal.fill("Alex Kumar");
  await legal.locator("xpath=ancestor::form[1]").locator("button[type=submit]").first().click();
  await p.waitForLoadState("networkidle");
  // preferences: target roles
  await p.goto(`${BASE}/app/profile?s=preferences`, { waitUntil: "domcontentloaded" });
  const tt = p.locator("input[name=targetTitles]").first();
  await tt.fill("Machine Learning Engineer");
  await tt.locator("xpath=ancestor::form[1]").locator("button[type=submit]").first().click();
  await p.waitForLoadState("networkidle");
  // skills
  await p.goto(`${BASE}/app/profile?s=skills`, { waitUntil: "domcontentloaded" });
  const sk = p.locator("input[name=name]").first();
  await sk.fill("Python, PyTorch, AWS, Docker");
  await sk.locator("xpath=ancestor::form[1]").locator("button:has-text('Add')").first().click();
  await p.waitForLoadState("networkidle");
  // experience
  await p.goto(`${BASE}/app/profile?s=experience`, { waitUntil: "domcontentloaded" });
  await p.locator("input[name=company]").first().fill("DataCorp");
  await p.locator("input[name=title]").first().fill("ML Engineer");
  if (await p.locator("textarea[name=highlights]").count())
    await p.locator("textarea[name=highlights]").first().fill("Built and deployed fraud-detection models in PyTorch on AWS, cutting false positives 30%.");
  await p.locator("input[name=company]").first().locator("xpath=ancestor::form[1]").locator("button:has-text('Add')").first().click();
  await p.waitForLoadState("networkidle");

  // regenerate cover letter on the job
  await p.goto(`${BASE}/app/jobs/${JOB}`, { waitUntil: "domcontentloaded" });
  const gen = p.getByRole("button", { name: /Generate|Regenerate/ });
  await Promise.all([p.waitForLoadState("networkidle", { timeout: 60000 }), gen.first().click()]);
  await p.waitForTimeout(2000);
  const body = await p.locator("body").innerText();
  console.log("GEN_FAILED:", /Generation failed/i.test(body));
  const m = body.match(/Model:\s*(bedrock:[^\s]+)/i);
  console.log("model:", m ? m[1] : "(not shown on page)");
} catch (e) { console.log("ERR", String(e)); } finally { await b.close(); }
