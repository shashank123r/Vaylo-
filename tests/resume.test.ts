import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { validateUpload, extractText, UploadError, MAX_RESUME_BYTES } from "@/lib/resume/parse";
import { uploadResume, listResumes, getResumeForDownload, deleteResume } from "@/lib/resume/service";
import { signup } from "@/lib/auth/service";

const fixt = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function makeUser(email: string) {
  const r = await signup({ email, password: "password123" });
  if (!r.ok) throw new Error("signup failed");
  return r.user;
}

describe("resume parsing", () => {
  it("extracts text from a real PDF", async () => {
    const buf = await readFile(fixt("sample.pdf"));
    const type = validateUpload(PDF_MIME, buf.length, buf);
    expect(type).toBe("pdf");
    const text = await extractText(buf, "pdf");
    expect(text).toContain("PDF RESUME SAMPLE TEXT");
  });

  it("extracts text from a real DOCX", async () => {
    const buf = await readFile(fixt("sample.docx"));
    const type = validateUpload(DOCX_MIME, buf.length, buf);
    expect(type).toBe("docx");
    const text = await extractText(buf, "docx");
    expect(text).toContain("DOCX RESUME SAMPLE TEXT");
  });

  it("rejects unsupported types, oversize files, and spoofed content", async () => {
    const pdf = await readFile(fixt("sample.pdf"));
    expect(() => validateUpload("text/plain", pdf.length, pdf)).toThrow(UploadError);
    expect(() => validateUpload(PDF_MIME, MAX_RESUME_BYTES + 1, pdf)).toThrow(UploadError);
    // Declared PDF but bytes are not a PDF -> rejected by magic-byte sniff.
    expect(() => validateUpload(PDF_MIME, 10, Buffer.from("not a pdf!"))).toThrow(UploadError);
  });
});

describe("resume storage + ownership", () => {
  it("stores, lists, downloads for the owner, and isolates across users", async () => {
    const alice = await makeUser("r-alice@example.com");
    const bob = await makeUser("r-bob@example.com");
    const buf = await readFile(fixt("sample.pdf"));

    const file = await uploadResume(alice.id, { filename: "resume.pdf", mimeType: PDF_MIME, buffer: buf });
    expect(file.userId).toBe(alice.id);
    expect(file.parsedText).toContain("PDF RESUME SAMPLE TEXT");

    expect(await listResumes(alice.id)).toHaveLength(1);
    expect(await listResumes(bob.id)).toHaveLength(0);

    // Owner can download; other user cannot (IDOR protection).
    const dl = await getResumeForDownload(alice.id, file.id);
    expect(dl?.data.length).toBe(buf.length);
    expect(await getResumeForDownload(bob.id, file.id)).toBeNull();

    // Bob cannot delete Alice's file; Alice can.
    expect(await deleteResume(bob.id, file.id)).toBe(false);
    expect(await deleteResume(alice.id, file.id)).toBe(true);
    expect(await listResumes(alice.id)).toHaveLength(0);
  });

  it("sanitizes the stored filename", async () => {
    const alice = await makeUser("r-alice2@example.com");
    const buf = await readFile(fixt("sample.docx"));
    const file = await uploadResume(alice.id, {
      filename: "../../etc/passwd.docx",
      mimeType: DOCX_MIME,
      buffer: buf,
    });
    expect(file.filename).not.toContain("/");
    expect(file.filename).not.toContain("..");
  });
});
