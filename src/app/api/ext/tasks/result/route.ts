import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireExtensionUser } from "@/lib/extension/auth";
import { reportResult } from "@/lib/autoapply/queue";

// The extension reports progress/outcome for a task it claimed. It updates ONLY the
// durable task status (per-user isolated). Quota/entitlement for a user-completed
// submission stays with the existing /api/ext/applications/result flow — this
// endpoint never grants entitlement and never submits.
const schema = z.object({
  taskId: z.string().min(1),
  // Statuses the extension is allowed to report. It can report progress and user-driven
  // outcomes, but NEVER server-verified ones like SUBMITTED_CONFIRMED (the extension
  // doesn't verify employer evidence; the user submits and may report SUBMITTED).
  status: z.enum([
    "OPENED",
    "APPLICATION_FORM_FOUND",
    "AUTOFILLED",
    "FILLED_AND_VALIDATED",
    "NEEDS_USER",
    "NEEDS_USER_ACTION",
    "BLOCKED",
    "EXPIRED",
    "SUBMITTED",
    "UNCERTAIN",
    "FAILED",
  ]),
  reason: z.string().max(500).optional(),
  evidence: z.string().max(1000).optional(),
  stage: z.string().max(60).optional(),
  recoveryUrl: z.string().url().max(2000).optional(),
  fieldsFilled: z.number().int().min(0).max(500).optional(),
});

export async function POST(req: NextRequest) {
  const user = await requireExtensionUser(req);
  if (!user) return NextResponse.json({ error: "Invalid or expired pairing" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const updated = await reportResult(parsed.data.taskId, user.id, {
    status: parsed.data.status,
    reason: parsed.data.reason ?? null,
    evidence: parsed.data.evidence ?? null,
    stage: parsed.data.stage,
    recoveryUrl: parsed.data.recoveryUrl,
    fieldsFilled: parsed.data.fieldsFilled,
  });
  if (!updated) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  return NextResponse.json({ ok: true, status: updated.status });
}
