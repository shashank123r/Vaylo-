import { NextRequest, NextResponse } from "next/server";
import { requireExtensionUser } from "@/lib/extension/auth";
import { upsertExtensionJob } from "@/lib/jobs/service";
import { extJobSchema } from "@/lib/extension/contracts";

// The extension reports a job it detected on a real career page. We store the
// user-scoped job (idempotent by url) and return its id.
export async function POST(req: NextRequest) {
  const user = await requireExtensionUser(req);
  if (!user) return NextResponse.json({ error: "Invalid or expired pairing" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = extJobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const job = await upsertExtensionJob(user.id, parsed.data);
  return NextResponse.json(
    { jobId: job.id, title: job.title, company: job.company },
    { headers: { "Cache-Control": "no-store" } },
  );
}
