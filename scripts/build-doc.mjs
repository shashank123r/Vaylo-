// Converts docs/FEATURE-GUIDE.md -> a self-contained HTML (images embedded as
// data URIs) and a paginated PDF, using the project's headless Chromium.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const DOCS = path.resolve("docs");
const md = fs.readFileSync(path.join(DOCS, "FEATURE-GUIDE.md"), "utf8");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function inline(s) {
  // images first (so their alt/url aren't treated as links)
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, src) => {
    const abs = path.join(DOCS, src);
    try {
      const data = fs.readFileSync(abs).toString("base64");
      return `<img alt="${esc(alt)}" src="data:image/png;base64,${data}">`;
    } catch {
      return `<em>[missing image: ${esc(src)}]</em>`;
    }
  });
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, t, u) => `<a href="${u}">${esc(t)}</a>`);
  s = s.replace(/`([^`]+)`/g, (_m, c) => `<code>${esc(c)}</code>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return s;
}

const lines = md.replace(/\r\n/g, "\n").split("\n");
const out = [];
let i = 0;
let inList = null; // 'ul' | 'ol'
const closeList = () => { if (inList) { out.push(`</${inList}>`); inList = null; } };

while (i < lines.length) {
  let line = lines[i];
  // fenced code block
  if (/^```/.test(line)) {
    closeList();
    const buf = [];
    i++;
    while (i < lines.length && !/^```/.test(lines[i])) { buf.push(esc(lines[i])); i++; }
    i++;
    out.push(`<pre><code>${buf.join("\n")}</code></pre>`);
    continue;
  }
  // table (header row followed by a separator row)
  if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
    closeList();
    const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    const head = cells(line);
    i += 2;
    const rows = [];
    while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
    let t = "<table><thead><tr>" + head.map((h) => `<th>${inline(h)}</th>`).join("") + "</tr></thead><tbody>";
    for (const r of rows) t += "<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>";
    t += "</tbody></table>";
    out.push(t);
    continue;
  }
  // headings
  let m;
  if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
    closeList();
    const lvl = m[1].length;
    out.push(`<h${lvl}>${inline(m[2])}</h${lvl}>`);
    i++; continue;
  }
  // hr
  if (/^---+\s*$/.test(line)) { closeList(); out.push("<hr>"); i++; continue; }
  // blockquote
  if (/^>\s?/.test(line)) {
    closeList();
    const buf = [];
    while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(inline(lines[i].replace(/^>\s?/, ""))); i++; }
    out.push(`<blockquote>${buf.join("<br>")}</blockquote>`);
    continue;
  }
  // unordered list
  if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
    if (inList !== "ul") { closeList(); out.push("<ul>"); inList = "ul"; }
    out.push(`<li>${inline(m[1])}</li>`); i++; continue;
  }
  // ordered list
  if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) {
    if (inList !== "ol") { closeList(); out.push("<ol>"); inList = "ol"; }
    out.push(`<li>${inline(m[1])}</li>`); i++; continue;
  }
  // blank
  if (line.trim() === "") { closeList(); i++; continue; }
  // paragraph
  closeList();
  out.push(`<p>${inline(line)}</p>`);
  i++;
}
closeList();

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Vaylo / JobFlow — Feature Guide</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color:#1a1a1a; font-size:11pt; line-height:1.5; max-width: 820px; margin: 0 auto; padding: 24px; }
  h1 { font-size:24pt; margin:18pt 0 8pt; }
  h2 { font-size:17pt; margin:20pt 0 6pt; padding-bottom:4pt; border-bottom:2px solid #b4432f; page-break-before: always; }
  h1 + * , h2:first-of-type { page-break-before: avoid; }
  h3 { font-size:13pt; margin:14pt 0 4pt; }
  h4 { font-size:11.5pt; margin:10pt 0 3pt; }
  p, li { margin:4pt 0; }
  ul, ol { margin:4pt 0 8pt; padding-left:20pt; }
  code { background:#f2efe9; padding:1px 4px; border-radius:3px; font-size:9.5pt; }
  pre { background:#f2efe9; padding:10px 12px; border-radius:6px; overflow:auto; page-break-inside:avoid; }
  pre code { background:none; padding:0; }
  img { max-width:100%; height:auto; border:1px solid #ddd; border-radius:6px; margin:8pt 0; page-break-inside:avoid; }
  a { color:#b4432f; text-decoration:none; }
  blockquote { border-left:3px solid #b4432f; background:#faf7f2; margin:8pt 0; padding:6pt 12pt; color:#444; }
  table { border-collapse:collapse; width:100%; margin:8pt 0; font-size:10pt; page-break-inside:avoid; }
  th, td { border:1px solid #ccc; padding:5pt 8pt; text-align:left; vertical-align:top; }
  th { background:#f2efe9; }
  hr { border:none; border-top:1px solid #ddd; margin:14pt 0; }
</style></head><body>${out.join("\n")}</body></html>`;

fs.writeFileSync(path.join(DOCS, "FEATURE-GUIDE.html"), html);
console.log("HTML written:", (html.length / 1024 / 1024).toFixed(1), "MB");

// Render to PDF
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.pdf({ path: path.join(DOCS, "FEATURE-GUIDE.pdf"), format: "A4", printBackground: true, margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" } });
  const kb = (fs.statSync(path.join(DOCS, "FEATURE-GUIDE.pdf")).size / 1024 / 1024).toFixed(1);
  console.log("PDF written:", kb, "MB");
} finally { await browser.close(); }
