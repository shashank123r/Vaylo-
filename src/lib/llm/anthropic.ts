import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { LlmProvider, LlmRequest, LlmResult } from "./types";
import { LlmError } from "./types";

// Adapter for the official Anthropic API. The API key is read server-side only
// and never leaves the server.
export class AnthropicProvider implements LlmProvider {
  readonly name: string;
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.name = `anthropic:${model}`;
  }

  async generate(req: LlmRequest): Promise<LlmResult> {
    try {
      const msg = await this.client.messages.create({
        model: this.model,
        max_tokens: req.maxTokens ?? 1500,
        temperature: req.temperature ?? 0.4,
        system: req.system,
        messages: [{ role: "user", content: req.user }],
      });
      const text = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      if (!text) throw new LlmError("Anthropic returned no text content");
      return { text, model: this.name };
    } catch (err) {
      if (err instanceof LlmError) throw err;
      const status = (err as { status?: number })?.status;
      const retryable = status === 429 || (typeof status === "number" && status >= 500) || status === undefined;
      // Do not include the API key or raw provider payload in the message.
      throw new LlmError("Anthropic request failed", { cause: err, retryable });
    }
  }
}
