import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current";
import { resumeTask } from "@/lib/autoapply/queue";

// Resume a task the user paused on (login wall / CAPTCHA / required answer) AFTER
// they have cleared it. Re-queues the SAME task — never creates a duplicate
// application, and refuses to resume an UNCERTAIN task (it must be reconciled first).
const schema = z.object({ taskId: z.string().min(1) });

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const r = await resumeTask(user.id, parsed.data.taskId);
  if (!r.ok) {
    const code = r.reason === "not_found" ? 404 : 409;
    return NextResponse.json({ error: r.reason }, { status: code });
  }
  return NextResponse.json({ ok: true, status: r.task?.status });
}
