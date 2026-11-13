import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current";
import { getRunStatus } from "@/lib/autoapply/queue";

// Returns the live status of a run's tasks (per-user isolated). This is what the
// user sees when they "come back" — each job's real durable status + reason/evidence.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const runId = req.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });

  const status = await getRunStatus(user.id, runId);
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}
