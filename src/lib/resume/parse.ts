import "server-only";

// Resume text extraction. Supports PDF (via unpdf) and DOCX (via mammoth).
// Validates type and size, and sniffs magic bytes so a renamed file cannot slip
// through the extension/mime check.

export const MAX_RESUME_BYTES = 5 * 1024 * 1024; // 5 MB

export const ACCEPTED = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
} as const;

export type ResumeType = (typeof ACCEPTED)[keyof typeof ACCEPTED];

export class UploadError extends Error {}

function sniff(buf: Buffer): ResumeType | null {
  // PDF starts with "%PDF". DOCX is a ZIP: "PK\x03\x04".
  if (buf.length >= 4 && buf.subarray(0, 4).toString("latin1") === "%PDF") return "pdf";
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    return "docx"; // ZIP container; mammoth will reject non-docx zips.
  }
  return null;
}

export function validateUpload(mimeType: string, sizeBytes: number, buf: Buffer): ResumeType {
  if (sizeBytes <= 0) throw new UploadError("Empty file.");
  if (sizeBytes > MAX_RESUME_BYTES) throw new UploadError("File is larger than 5 MB.");
  const declared = ACCEPTED[mimeType as keyof typeof ACCEPTED];
  if (!declared) throw new UploadError("Only PDF and DOCX resumes are accepted.");
  const sniffed = sniff(buf);
  if (!sniffed || sniffed !== declared) {
    throw new UploadError("File contents do not match a PDF or DOCX document.");
  }
  return declared;
}

export async function extractText(buf: Buffer, type: ResumeType): Promise<string> {
  if (type === "pdf") {
    const { extractText: pdfExtract, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await pdfExtract(pdf, { mergePages: true });
    const t: string | string[] = text as string | string[];
    return (Array.isArray(t) ? t.join("\n") : t).trim();
  }
  // docx
  const mammoth = (await import("mammoth")).default ?? (await import("mammoth"));
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return value.trim();
}
