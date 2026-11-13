import { NextRequest, NextResponse } from "next/server";
import { requireExtensionUser } from "@/lib/extension/auth";
import { submissionResultSchema } from "@/lib/extension/contracts";
import { recordSubmissionResult } from "@/lib/applications/submit";

// The extension reports the OBSERVED outcome of a submission (confirmed/failed/
// uncertain). The backend is the source of truth: it records idempotently and
// consumes free quota only on a confirmed success.
export async function POST(req: NextRequest) {
  const user = await requireExtensionUser(req);
  if (!user) return NextResponse.json({ error: "Invalid or expired pairing" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = submissionResultSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    const result = await recordSubmissionResult(user.id, parsed.data);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to record result";
    const status = msg === "Job not found" ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
