import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { renderResumePdf } from "@/lib/resume/pdf";

// Owner-only download of a tailored resume version as a PDF. A user can only ever
// fetch their own version; anyone else (or a guest) gets 404, so version ids are
// not an IDOR surface.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Not found", { status: 404 });

  const { id } = await params;
  const version = await db.resumeVersion.findFirst({
    where: { id, userId: user.id },
    include: { job: true },
  });
  if (!version) return new NextResponse("Not found", { status: 404 });

  const pdf = await renderResumePdf(version.contentMd);
  const company = (version.job?.company || "resume").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "resume";
  const filename = `Tailored-Resume-${company}.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdf.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
