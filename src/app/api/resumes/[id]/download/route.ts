import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current";
import { getResumeForDownload } from "@/lib/resume/service";

// Owner-only download. A user can only ever fetch their own file; anyone else
// (or a guest) gets 404, so file ids are not an IDOR surface.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Not found", { status: 404 });

  const { id } = await params;
  const result = await getResumeForDownload(user.id, id);
  if (!result) return new NextResponse("Not found", { status: 404 });

  const { file, data } = result;
  const body = new Uint8Array(data);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(file.filename)}"`,
      "Content-Length": String(data.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
