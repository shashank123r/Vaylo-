import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current";
import { uploadResume } from "@/lib/resume/service";
import { UploadError } from "@/lib/resume/parse";
import { extractProfileFromResume, applyResumeExtraction } from "@/lib/profile/autofill";
import { logger } from "@/lib/logger";
import { externalUrl } from "@/lib/http/intent";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(externalUrl(req, "/login?next=/app/profile"), 303);
  }

  const form = await req.formData();
  const file = form.get("resume");
  if (!(file instanceof File)) {
    return NextResponse.redirect(
      externalUrl(req, "/app/profile?error=Choose%20a%20PDF%20or%20DOCX%20file."),
      303,
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const saved = await uploadResume(user.id, {
      filename: file.name,
      mimeType: file.type,
      buffer,
    });

    // Best-effort resume autofill: extract grounded facts and populate EMPTY profile
    // fields (never invents, never overwrites confirmed values). A slow or failed LLM
    // must not fail the upload, so this is wrapped and its result is advisory only.
    let autofilled = 0;
    try {
      if (saved.parsedText) {
        const ext = await extractProfileFromResume(saved.parsedText);
        const report = await applyResumeExtraction(user.id, ext);
        autofilled =
          report.filled.length +
          report.addedEducation +
          report.addedExperience +
          report.addedSkills +
          report.addedCertifications;
      }
    } catch (e) {
      logger.warn({ err: (e as Error)?.message }, "resume autofill skipped");
    }

    const dest = `/app/profile?s=documents&uploaded=1${autofilled ? `&autofilled=${autofilled}` : ""}`;
    return NextResponse.redirect(externalUrl(req, dest), 303);
  } catch (err) {
    const msg = err instanceof UploadError ? err.message : "Upload failed.";
    if (!(err instanceof UploadError)) logger.error({ err }, "resume upload failed");
    return NextResponse.redirect(
      externalUrl(req, `/app/profile?error=${encodeURIComponent(msg)}`),
      303,
    );
  }
}
