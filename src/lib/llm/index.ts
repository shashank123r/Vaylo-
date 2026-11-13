import "server-only";
import { env } from "@/lib/env";
import type { LlmProvider } from "./types";
import { AnthropicProvider } from "./anthropic";
import { BedrockProvider } from "./bedrock";
import { BridgeProvider } from "./bridge";
import { CliProvider } from "./cli";
import { MockProvider } from "./mock";

let singleton: LlmProvider | null = null;

export function getLlm(): LlmProvider {
  if (singleton) return singleton;
  switch (env.LLM_PROVIDER) {
    case "anthropic":
      // env.ts already guarantees the key exists for this provider.
      singleton = new AnthropicProvider(env.ANTHROPIC_API_KEY!, env.ANTHROPIC_MODEL);
      break;
    case "bedrock":
      // Claude via Amazon Bedrock using the default AWS credential chain.
      singleton = new BedrockProvider(env.BEDROCK_MODEL_ID, env.BEDROCK_REGION);
      break;
    case "bridge":
      singleton = new BridgeProvider(env.BRIDGE_BASE_URL!, env.BRIDGE_API_KEY);
      break;
    case "cli":
      // Real Claude via the local Claude Code CLI (no API key needed).
      singleton = new CliProvider(env.CLAUDE_CLI_PATH);
      break;
    case "mock":
    default:
      // Never silently use the mock in production; fail loudly on first use.
      if (env.NODE_ENV === "production") {
        throw new Error(
          "LLM_PROVIDER=mock is not allowed in production. Configure anthropic or a verified bridge.",
        );
      }
      singleton = new MockProvider();
      break;
  }
  return singleton;
}

export { LlmError } from "./types";
export type { LlmProvider, LlmRequest, LlmResult } from "./types";
