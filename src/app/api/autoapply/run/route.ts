import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current";
import { enqueueAutoApplyRun } from "@/lib/autoapply/enqueue";

// Starts an autonomous auto-apply RUN: the server discovers, matches, dedupes, and
// ENQUEUES durable tasks, then returns immediately with a runId. No browser work
// happens here. ALL submission gates live in enqueueAutoApplyRun (fail-closed
// authorizeLiveSubmit: master switch + paid plan + per-run authorization); this
// route cannot bypass them. The `authorize` checkbox only sets the REQUEST — the
// server still refuses live submission unless every gate is satisfied.
const schema = z.object({
  q: z.string().max(200).optional(),
  location: z.string().max(120).optional(),
  minScore: z.coerce.number().int().min(0).max(100).default(40),
  maxApplications: z.coerce.number().int().min(1).max(10).default(3),
  authorize: z.boolean().default(false),
  exclusions: z.array(z.string().max(80)).max(25).optional(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const d = parsed.data;

  const result = await enqueueAutoApplyRun(user.id, {
    q: d.q,
    location: d.location,
    minScore: d.minScore,
    maxApplications: d.maxApplications,
    // The user's authorization is the ONLY thing the UI controls. Whether live
    // submission actually happens is decided server-side by the fail-closed gate.
    autoSubmit: d.authorize,
    authorized: d.authorize,
    exclusions: d.exclusions,
  });

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
