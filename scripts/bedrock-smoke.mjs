// Proves the deployed container can call Claude on Bedrock using the EC2
// instance-role credentials (default AWS credential chain) — the exact path the
// app's BedrockProvider uses.
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

const region = process.env.BEDROCK_REGION || "ap-southeast-2";
const modelId = process.env.BEDROCK_MODEL_ID || "au.anthropic.claude-haiku-4-5-20251001-v1:0";
const client = new BedrockRuntimeClient({ region });

try {
  const out = await client.send(
    new ConverseCommand({
      modelId,
      messages: [{ role: "user", content: [{ text: "Reply with exactly: CONTAINER_BEDROCK_OK" }] }],
      inferenceConfig: { maxTokens: 20, temperature: 0 },
    }),
  );
  const text = (out.output?.message?.content ?? []).map((b) => b.text || "").join("").trim();
  console.log("model:", modelId);
  console.log("response:", text);
  process.exit(/CONTAINER_BEDROCK_OK/.test(text) ? 0 : 1);
} catch (e) {
  console.log("BEDROCK CALL FAILED:", e.name, "-", e.message);
  process.exit(1);
}
