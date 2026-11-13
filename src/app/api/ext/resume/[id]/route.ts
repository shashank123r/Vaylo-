import { NextRequest, NextResponse } from "next/server";
import { requireExtensionUser } from "@/lib/extension/auth";
import { getResumeForDownload } from "@/lib/resume/service";

// The extension fetches the user's own resume bytes to upload into a site's real
// file control. Owner-only, via the extension token. Never another user's file.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireExtensionUser(req);
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const result = await getResumeForDownload(user.id, id);
  if (!result) return new NextResponse("Not found", { status: 404 });
  const { file, data } = result;
  return new NextResponse(new Uint8Array(data), {
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
