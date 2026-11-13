import "server-only";
import { env } from "@/lib/env";
import type { LlmProvider, LlmRequest, LlmResult } from "./types";
import { LlmError } from "./types";

// Hard cap on model output we will accept/store, independent of maxTokens.
export const MAX_OUTPUT_CHARS = 100_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new LlmError(`LLM request timed out after ${ms}ms`, { retryable: true })), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Calls a provider with a timeout, bounded retries with exponential backoff on
 * transient (retryable) errors only, and an output-size cap. Retries happen only
 * on failure, so a successful call is never billed twice.
 */
export async function generateWithPolicy(
  provider: LlmProvider,
  req: LlmRequest,
  opts?: { timeoutMs?: number; maxRetries?: number },
): Promise<LlmResult> {
  const timeoutMs = opts?.timeoutMs ?? env.LLM_TIMEOUT_MS;
  const maxRetries = opts?.maxRetries ?? env.LLM_MAX_RETRIES;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await withTimeout(provider.generate(req), timeoutMs);
      if (res.text.length > MAX_OUTPUT_CHARS) {
        return { ...res, text: res.text.slice(0, MAX_OUTPUT_CHARS) };
      }
      return res;
    } catch (e) {
      lastErr = e;
      const retryable = e instanceof LlmError && e.retryable;
      if (attempt < maxRetries && retryable) {
        await sleep(100 * 2 ** attempt);
        continue;
      }
      break;
    }
  }
  if (lastErr instanceof LlmError) throw lastErr;
  // Never surface a provider's raw error (which could contain internal detail).
  throw new LlmError("LLM request failed");
}
