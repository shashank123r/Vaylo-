import "server-only";
import type { LlmProvider, LlmRequest, LlmResult } from "./types";
import { LlmError } from "./types";

/**
 * Claude Bridge adapter.
 *
 * IMPORTANT, READ BEFORE USING:
 * The spec calls for an "optional Claude Bridge configured through environment
 * variables", but no bridge protocol was documented or discoverable in this
 * repository at build time. This adapter therefore does NOT invent a real
 * vendor API. It defines ONE explicit, minimal contract and calls exactly that.
 * If your bridge speaks a different protocol, change THIS file to match it; do
 * not assume the shape below is correct for any particular bridge product.
 *
 * Expected contract (what this adapter actually sends/expects):
 *   POST {BRIDGE_BASE_URL}/v1/generate
 *   Headers: Authorization: Bearer {BRIDGE_API_KEY}  (only if key is set)
 *            Content-Type: application/json
 *   Body: { "system": string, "prompt": string, "max_tokens": number, "temperature": number }
 *   200 Response: { "text": string, "model"?: string }
 *
 * Until you confirm your bridge matches this, keep LLM_PROVIDER=anthropic or
 * =mock. This adapter fails loudly rather than pretending to work.
 */
export class BridgeProvider implements LlmProvider {
  readonly name = "bridge";
  private baseUrl: string;
  private apiKey?: string;

  constructor(baseUrl: string, apiKey?: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
  }

  async generate(req: LlmRequest): Promise<LlmResult> {
    const url = `${this.baseUrl}/v1/generate`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          system: req.system,
          prompt: req.user,
          max_tokens: req.maxTokens ?? 1500,
          temperature: req.temperature ?? 0.4,
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      throw new LlmError(`Bridge request to ${url} failed (network/timeout)`, { cause: err, retryable: true });
    }
    if (!res.ok) {
      throw new LlmError(`Bridge returned HTTP ${res.status} from ${url}`, { retryable: res.status === 429 || res.status >= 500 });
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch (err) {
      throw new LlmError("Bridge returned a non-JSON response", { cause: err });
    }
    const text = (data as { text?: unknown })?.text;
    if (typeof text !== "string" || !text.trim()) {
      throw new LlmError(
        "Bridge response did not include a non-empty string 'text' field. " +
          "Your bridge protocol likely differs from the documented contract in bridge.ts.",
      );
    }
    const model = (data as { model?: unknown })?.model;
    return { text: text.trim(), model: typeof model === "string" ? `bridge:${model}` : "bridge" };
  }
}
