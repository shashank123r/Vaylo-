// Full E2E: signup -> populate profile -> add job -> tailor resume -> download the
// PDF via the real route -> verify selectable text + page count with unpdf.
import { chromium } from "playwright";
import { extractText, getDocumentProxy } from "unpdf";
import fs from "node:fs";
const BASE = process.env.BASE || "http://13.238.23.72";
const email = `pdf+${Date.now()}@example.test`, pw = "ValidPass123";
const R = []; const ok = (n, c, i = "") => { R.push(!!c); console.log(`${c ? "PASS" : "FAIL"}  ${n}${i ? "  — " + i : ""}`); };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 1100 } });
const p = await ctx.newPage();
try {
  await p.goto(`${BASE}/signup`, { waitUntil: "domcontentloaded" });
  await p.fill("input[name=email]", email); await p.fill("input[name=password]", pw);
  if (await p.locator("input[name=name]").count()) await p.fill("input[name=name]", "Priya Sharma");
  await Promise.all([p.waitForURL("**/app**").catch(() => {}), p.click("button[type=submit]")]);

  // minimal profile so tailoring has facts
  await p.goto(`${BASE}/app/profile?s=skills`, { waitUntil: "domcontentloaded" });
  let sk = p.locator("input[name=name]").first();
  await sk.fill("Python, PyTorch, AWS, Docker, SQL");
  await sk.locator("xpath=ancestor::form[1]").locator("button:has-text('Add')").first().click();
  await p.waitForLoadState("networkidle");
  await p.goto(`${BASE}/app/profile?s=experience`, { waitUntil: "domcontentloaded" });
  await p.locator("input[name=company]").first().fill("DataCorp");
  await p.locator("input[name=title]").first().fill("ML Engineer");
  if (await p.locator("textarea[name=highlights]").count())
    await p.locator("textarea[name=highlights]").first().fill("Built fraud-detection models in PyTorch on AWS; cut false positives 30%. Shipped SQL data pipelines.");
  await p.locator("input[name=company]").first().locator("xpath=ancestor::form[1]").locator("button:has-text('Add')").first().click();
  await p.waitForLoadState("networkidle");

  // add a job
  await p.goto(`${BASE}/app/jobs/new`, { waitUntil: "domcontentloaded" });
  await p.fill("input[name=title]", "Senior Machine Learning Engineer");
  await p.fill("input[name=company]", "Acme AI");
  if (await p.locator("textarea[name=description]").count())
    await p.fill("textarea[name=description]", "Seeking a Senior ML Engineer with Python, PyTorch, AWS, and SQL to build and deploy production models.");
  await Promise.all([p.waitForLoadState("networkidle"), p.click("button:has-text('Add job')")]);
  const jobUrl = p.url();
  ok("job created", jobUrl.includes("/app/jobs/"), jobUrl);

  // tailor the resume (first Generate button is the tailored-resume one)
  const gen = p.getByRole("button", { name: /^(Generate|Regenerate)$/ }).first();
  await Promise.all([p.waitForLoadState("networkidle", { timeout: 60000 }), gen.click()]);
  await p.waitForTimeout(1500);
  const body = await p.locator("body").innerText();
  ok("tailor did not error", !/Generation failed/i.test(body));

  // find the Download PDF link
  const href = await p.locator("a:has-text('Download PDF')").first().getAttribute("href");
  ok("Download PDF link present", !!href, href || "");
  if (href) {
    const resp = await ctx.request.get(`${BASE}${href}`);
    ok("PDF download HTTP 200", resp.status() === 200, `status ${resp.status()}`);
    const ct = resp.headers()["content-type"] || "";
    ok("content-type is application/pdf", ct.includes("application/pdf"), ct);
    const buf = Buffer.from(await resp.body());
    fs.writeFileSync("/tmp/tailored.pdf", buf);
    ok("valid PDF bytes", buf.subarray(0, 5).toString("latin1") === "%PDF-", `${buf.length} bytes`);
    const doc = await getDocumentProxy(new Uint8Array(buf));
    const { text, totalPages } = await extractText(doc, { mergePages: true });
    ok("PDF has selectable text (name)", /Priya Sharma/i.test(text), text.slice(0, 60).replace(/\s+/g, " "));
    ok("PDF reflects real skills (PyTorch)", /PyTorch/i.test(text));
    ok("PDF page count sane (1-3)", totalPages >= 1 && totalPages <= 3, `${totalPages} pages`);

    // authz: a signed-out context must NOT download it
    const anon = await b.newContext();
    const r2 = await anon.request.get(`${BASE}${href}`);
    ok("unauth download blocked (404)", r2.status() === 404, `status ${r2.status()}`);
    await anon.close();
  }
} catch (e) { ok("ran without throwing", false, String(e)); } finally { await b.close(); }
const pass = R.filter(Boolean).length;
console.log(`\n==== ${pass}/${R.length} passed ====`);
console.log(`EMAIL=${email}`);
process.exit(pass === R.length ? 0 : 1);
