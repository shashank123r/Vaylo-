// Proves the production container can run the auto-apply browser: launches
// Chromium with the container-safe flags, fills a form, attaches a file, submits,
// and detects the confirmation — the exact capability the engine relies on.
import { chromium } from "playwright";
import fs from "node:fs";

const html = `<!doctype html><html><body>
<h1>Apply</h1>
<form id="f" onsubmit="document.body.innerHTML='<h1>Application received</h1><p>Reference #ABC123</p>';return false;">
  <input name="full_name" placeholder="Full name" />
  <input name="email" type="email" />
  <input type="file" name="resume" />
  <button type="submit">Submit application</button>
</form></body></html>`;
const url = "data:text/html," + encodeURIComponent(html);

let okLaunch = false, okFill = false, okFile = false, okConfirm = false;
const b = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
okLaunch = true;
try {
  const p = await (await b.newContext()).newPage();
  await p.goto(url, { waitUntil: "load" });
  await p.fill("input[name=full_name]", "Test User");
  await p.fill("input[name=email]", "test@example.test");
  okFill = (await p.inputValue("input[name=full_name]")) === "Test User";
  fs.writeFileSync("/tmp/smoke-resume.pdf", "%PDF-1.4\n% smoke\n");
  await p.setInputFiles("input[name=resume]", "/tmp/smoke-resume.pdf");
  okFile = true;
  await p.click("button[type=submit]");
  const txt = await p.locator("body").innerText();
  okConfirm = /received|reference/i.test(txt);
  console.log("post-submit text:", txt.replace(/\s+/g, " ").trim());
} finally {
  await b.close();
}
console.log(JSON.stringify({ okLaunch, okFill, okFile, okConfirm }));
process.exit(okLaunch && okFill && okFile && okConfirm ? 0 : 1);
