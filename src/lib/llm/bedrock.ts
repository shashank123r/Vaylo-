import "server-only";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import type { LlmProvider, LlmRequest, LlmResult } from "./types";
import { LlmError } from "./types";

/**
 * Claude via Amazon Bedrock. Uses the default AWS credential chain (EC2 instance
 * role in production, or env vars locally), so the app handles NO API key.
 * `modelId` is a Bedrock inference-profile id, e.g.
 *   au.anthropic.claude-haiku-4-5-20251001-v1:0
 */
export class BedrockProvider implements LlmProvider {
  readonly name: string;
  private client: BedrockRuntimeClient;
  private model: string;

  constructor(modelId: string, region: string) {
    this.client = new BedrockRuntimeClient({ region });
    this.model = modelId;
    this.name = `bedrock:${modelId}`;
  }

  async generate(req: LlmRequest): Promise<LlmResult> {
    try {
      const out = await this.client.send(
        new ConverseCommand({
          modelId: this.model,
          system: req.system ? [{ text: req.system }] : undefined,
          messages: [{ role: "user", content: [{ text: req.user }] }],
          inferenceConfig: {
            maxTokens: req.maxTokens ?? 1500,
            temperature: req.temperature ?? 0.4,
          },
        }),
      );
      const text = (out.output?.message?.content ?? [])
        .map((b) => ("text" in b && typeof b.text === "string" ? b.text : ""))
        .join("")
        .trim();
      if (!text) throw new LlmError("Bedrock returned no text content");
      return { text, model: this.name };
    } catch (err) {
      if (err instanceof LlmError) throw err;
      const name = (err as { name?: string })?.name;
      const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      const retryable =
        name === "ThrottlingException" ||
        name === "ModelTimeoutException" ||
        name === "ServiceUnavailableException" ||
        status === 429 ||
        (typeof status === "number" && status >= 500);
      // Never leak credentials or raw payloads into the error message.
      throw new LlmError("Bedrock request failed", { cause: err, retryable });
    }
  }
}
