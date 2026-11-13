import { describe, it, expect } from "vitest";
import { renderResumePdf } from "@/lib/resume/pdf";
import { extractText, getDocumentProxy } from "unpdf";

describe("tailored resume PDF", () => {
  it("renders a valid, selectable-text PDF with the real content", async () => {
    const md = [
      "# Jane Doe",
      "",
      "## Experience",
      "",
      "**ML Engineer** | DataCorp",
      "- Built fraud-detection models in PyTorch & AWS, cut false positives 30%",
      "",
      "## Skills",
      "",
      "Python, PyTorch, AWS, Docker",
    ].join("\n");

    const pdf = await renderResumePdf(md);

    // valid PDF bytes
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    // selectable text + page count
    const doc = await getDocumentProxy(new Uint8Array(pdf));
    const { text, totalPages } = await extractText(doc, { mergePages: true });
    expect(totalPages).toBeGreaterThanOrEqual(1);
    expect(totalPages).toBeLessThanOrEqual(2); // short resume must not spill into blank pages
    expect(text).toContain("Jane Doe");
    expect(text).toContain("DataCorp");
    expect(text).toContain("PyTorch");
    // special character preserved (not a broken/escaped symbol)
    expect(text).toContain("&");
  }, 60000);

  it("never throws on empty content", async () => {
    const pdf = await renderResumePdf("");
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 60000);

  it("paginates a long resume across multiple pages without clipping content", async () => {
    // Build a long, realistic multi-section resume (~6 roles x 6 bullets + skills).
    const roles = Array.from({ length: 6 }, (_, i) => {
      const bullets = Array.from({ length: 6 }, (_, b) =>
        `- Delivered measurable result ${i + 1}.${b + 1}: shipped feature set ${b + 1} used by many teams`,
      ).join("\n");
      return `### Senior Engineer ${i + 1} | Company ${i + 1}\n${bullets}`;
    }).join("\n\n");
    const md = `# Jordan Taylor\n\n## Experience\n\n${roles}\n\n## Skills\n\nPython, TypeScript, React, AWS, Docker, Kubernetes, SQL, GraphQL`;

    const pdf = await renderResumePdf(md);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const doc = await getDocumentProxy(new Uint8Array(pdf));
    const { text, totalPages } = await extractText(doc, { mergePages: true });
    // Long content must spill onto more than one page (no truncation to fit).
    expect(totalPages).toBeGreaterThanOrEqual(2);
    // First and LAST content must both survive (nothing clipped off the end).
    expect(text).toContain("Jordan Taylor");
    expect(text).toContain("Senior Engineer 6");
    expect(text).toContain("Kubernetes");
  }, 60000);
});
