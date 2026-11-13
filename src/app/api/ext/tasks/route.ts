import { NextRequest, NextResponse } from "next/server";
import { requireExtensionUser } from "@/lib/extension/auth";
import { claimNext } from "@/lib/autoapply/queue";

// The extension polls this while it is online. It atomically claims ONE queued
// EXTENSION task for THIS user (FOR UPDATE SKIP LOCKED) and returns what to open.
// If the user's browser is closed, nothing polls — the tasks simply wait in the
// queue and are picked up when the extension reconnects. Per-user isolated.
export async function GET(req: NextRequest) {
  const user = await requireExtensionUser(req);
  if (!user) return NextResponse.json({ error: "Invalid or expired pairing" }, { status: 401 });

  // A generous lock: the user may take minutes to review and submit. If they never
  // finish, the lock expires and the task becomes claimable again on a later poll.
  const task = await claimNext({
    channel: "EXTENSION",
    workerId: `ext:${user.id}`,
    userId: user.id,
    lockMs: 15 * 60 * 1000,
  });

  if (!task) return NextResponse.json({ task: null }, { headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(
    {
      task: {
        id: task.id,
        runId: task.runId,
        jobId: task.jobId,
        company: task.company,
        title: task.title,
        url: task.jobUrl,
        clientRef: task.clientRef,
        // EXTENSION tasks never auto-submit: the user reviews and submits themselves.
        autoSubmit: false,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
