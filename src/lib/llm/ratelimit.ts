import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { LlmError } from "./types";

// Per-user LLM rate limit, enforced server-side. Uses recorded UsageEvents in the
// trailing 60s as the signal. The client cannot choose another user or a higher
// limit; userId always comes from the authenticated session/extension token.
export async function enforceLlmRateLimit(userId: string): Promise<void> {
  const since = new Date(Date.now() - 60_000);
  const count = await db.usageEvent.count({ where: { userId, createdAt: { gte: since } } });
  if (count >= env.LLM_RATE_LIMIT_PER_MIN) {
    throw new LlmError("You are generating too fast. Please wait a moment and try again.");
  }
}
