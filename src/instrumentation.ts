// Next.js instrumentation: runs once when the server process starts (and again
// after a restart). We use it to optionally start the SINGLE in-process SERVER
// auto-apply worker. It is opt-in (AUTOAPPLY_WORKER_INPROC) and only runs in the
// Node.js runtime — never the edge runtime, and never during the build. Because the
// queue is durable in Postgres, a restart simply re-registers this loop and
// recoverStuck() re-queues anything the previous process left in flight.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Read the flag directly (env.ts validation also enforces it, but we avoid pulling
  // server-only modules into the instrumentation entry unless the flag is on).
  if (process.env.AUTOAPPLY_WORKER_INPROC !== "true") return;

  const { runWorkerLoop } = await import("@/lib/autoapply/worker");
  const pollMs = Number(process.env.AUTOAPPLY_WORKER_POLL_MS ?? 5000) || 5000;
  const lockMs = Number(process.env.AUTOAPPLY_WORKER_LOCK_MS ?? 120000) || 120000;
  const workerId = `srv-${process.pid}`;
  // Observable start line so operators can confirm the single worker is live.
  console.log(`[autoapply] in-process SERVER worker started (${workerId}, poll ${pollMs}ms, lock ${lockMs}ms)`);

  // Fire-and-forget: the loop awaits each task (concurrency 1) and never throws out.
  void runWorkerLoop({ workerId, pollMs, lockMs }).catch(() => {
    /* the loop self-heals on transient errors; a hard exit is left to the platform */
  });
}
