import "server-only";
import { z } from "zod";
import type { LlmProvider, LlmRequest } from "./types";
import { LlmError } from "./types";
import { generateWithPolicy } from "./policy";

function tryParse(s: string): unknown | undefined {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

// Returns the first balanced {...} or [...] region, ignoring braces inside strings,
// so trailing/leading prose around the JSON does not break parsing.
function balancedRegion(text: string): string | null {
  const start = text.search(/[[{]/);
  if (start === -1) return null;
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

// Extracts a JSON value from model text, tolerating code fences and surrounding
// prose (before AND after the JSON). Throws a clean LlmError (no raw model text).
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1]! : text).trim();

  const direct = tryParse(body);
  if (direct !== undefined) return direct;

  const region = balancedRegion(body);
  if (region !== null) {
    const parsed = tryParse(region);
    if (parsed !== undefined) return parsed;
  }
  throw new LlmError("Model output was not valid JSON.");
}

/** Generates and validates a structured JSON result against a Zod schema. */
export async function generateJson<T>(
  provider: LlmProvider,
  schema: z.ZodType<T>,
  req: LlmRequest,
  opts?: { timeoutMs?: number; maxRetries?: number },
): Promise<{ data: T; model: string }> {
  const res = await generateWithPolicy(provider, req, opts);
  const parsed = extractJson(res.text);
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new LlmError(`Model output did not match the expected shape: ${result.error.issues[0]?.message ?? "invalid"}`);
  }
  return { data: result.data, model: res.model };
}
