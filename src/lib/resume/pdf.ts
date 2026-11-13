import "server-only";
import { launchBrowser } from "@/lib/autoapply/browser";
import { mdToHtml } from "@/lib/md/render";

// Clean, ATS-friendly A4 template: selectable text, standard fonts, clear
// headings, no background graphics that could confuse parsers.
function template(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, "Times New Roman", serif; color:#111; font-size:10.5pt; line-height:1.4; margin:0; }
  h1 { font-size:19pt; margin:0 0 2pt; }
  h2 { font-size:11.5pt; margin:13pt 0 4pt; border-bottom:1px solid #888; padding-bottom:2pt; text-transform:uppercase; letter-spacing:0.5px; }
  h3 { font-size:10.5pt; margin:7pt 0 1pt; }
  p { margin:2pt 0; }
  ul { margin:2pt 0 6pt; padding-left:15pt; }
  li { margin:1pt 0; }
  a { color:#111; text-decoration:none; }
  strong { font-weight:700; }
</style></head><body>${body}</body></html>`;
}

/**
 * Renders tailored-resume Markdown to a clean, selectable-text A4 PDF using the
 * headless Chromium already in the image (no extra dependency). Returns the PDF
 * bytes; the caller owns ownership/authorization checks.
 */
export async function renderResumePdf(markdown: string): Promise<Buffer> {
  const html = template(mdToHtml(markdown || "_Empty resume._"));
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
