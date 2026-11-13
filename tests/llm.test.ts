import { describe, it, expect } from "vitest";
import { z } from "zod";
import type { LlmProvider, LlmResult } from "@/lib/llm/types";
import { LlmError } from "@/lib/llm/types";
import { generateWithPolicy, MAX_OUTPUT_CHARS } from "@/lib/llm/policy";
import { generateJson } from "@/lib/llm/json";
import { enforceLlmRateLimit } from "@/lib/llm/ratelimit";
import { analyzeJobFit } from "@/lib/llm/service";
import { CliProvider } from "@/lib/llm/cli";
import { signup } from "@/lib/auth/service";
import { createManualJob } from "@/lib/jobs/service";
import { db } from "@/lib/db";

type Behavior = { text: string } | { throw: Error } | { hang: true };

class FakeProvider implements LlmProvider {
  readonly name = "fake";
  calls = 0;
  constructor(private behaviors: Behavior[]) {}
  generate(): Promise<LlmResult> {
    const b = this.behaviors[Math.min(this.calls, this.behaviors.length - 1)]!;
    this.calls++;
    if ("hang" in b) return new Promise<LlmResult>(() => {}); // never resolves
    if ("throw" in b) return Promise.reject(b.throw);
    return Promise.resolve({ text: b.text, model: "fake" });
  }
}

const req = { system: "s", user: "u" };

describe("generateWithPolicy", () => {
  it("retries a retryable error then succeeds (no double-count on success)", async () => {
    const p = new FakeProvider([{ throw: new LlmError("429", { retryable: true }) }, { text: "ok" }]);
    const res = await generateWithPolicy(p, req, { maxRetries: 2 });
    expect(res.text).toBe("ok");
    expect(p.calls).toBe(2);
  });

  it("does not retry a non-retryable error", async () => {
    const p = new FakeProvider([{ throw: new LlmError("bad", { retryable: false }) }, { text: "ok" }]);
    await expect(generateWithPolicy(p, req, { maxRetries: 2 })).rejects.toThrow("bad");
    expect(p.calls).toBe(1);
  });

  it("gives up after maxRetries", async () => {
    const p = new FakeProvider([{ throw: new LlmError("flaky", { retryable: true }) }]);
    await expect(generateWithPolicy(p, req, { maxRetries: 2 })).rejects.toThrow();
    expect(p.calls).toBe(3);
  });

  it("times out and retries, then succeeds", async () => {
    const p = new FakeProvider([{ hang: true }, { text: "recovered" }]);
    const res = await generateWithPolicy(p, req, { timeoutMs: 40, maxRetries: 1 });
    expect(res.text).toBe("recovered");
  });

  it("caps output size", async () => {
    const p = new FakeProvider([{ text: "x".repeat(MAX_OUTPUT_CHARS + 500) }]);
    const res = await generateWithPolicy(p, req, { maxRetries: 0 });
    expect(res.text.length).toBe(MAX_OUTPUT_CHARS);
  });

  it("never leaks a provider's raw error text", async () => {
    const p = new FakeProvider([{ throw: new Error("secret sk-live-ABCDEF leaked here") }]);
    try {
      await generateWithPolicy(p, req, { maxRetries: 0 });
      throw new Error("should have thrown");
    } catch (e) {
      expect(String((e as Error).message)).not.toMatch(/sk-live/);
      expect(e).toBeInstanceOf(LlmError);
    }
  });
});

describe("CLI bridge provider", () => {
  it("fails with a clean LlmError when the claude binary is missing (no leak)", async () => {
    const p = new CliProvider("jobflow-nonexistent-binary-xyz");
    await expect(p.generate({ system: "s", user: "u" })).rejects.toThrow(/claude CLI|could not run/i);
    expect(p.name).toBe("cli:claude");
  });
});

describe("generateJson (schema validation)", () => {
  const schema = z.object({ score: z.number(), ok: z.boolean() });
  it("parses valid JSON, including code-fenced", async () => {
    const p = new FakeProvider([{ text: '```json\n{"score": 90, "ok": true}\n```' }]);
    const { data } = await generateJson(p, schema, req);
    expect(data).toEqual({ score: 90, ok: true });
  });
  it("rejects malformed JSON", async () => {
    const p = new FakeProvider([{ text: "not json at all" }]);
    await expect(generateJson(p, schema, req)).rejects.toThrow(/JSON/i);
  });
  it("rejects schema violations", async () => {
    const p = new FakeProvider([{ text: '{"score":"high","ok":"yes"}' }]);
    await expect(generateJson(p, schema, req)).rejects.toThrow(/shape|match/i);
  });
  it("extracts a balanced JSON object from surrounding prose (before AND after)", async () => {
    const p = new FakeProvider([
      { text: 'Sure! Here is the result:\n{"score": 42, "ok": false}\nLet me know if you need more.' },
    ]);
    const { data } = await generateJson(p, schema, req);
    expect(data).toEqual({ score: 42, ok: false });
  });
  it("is not fooled by braces inside strings", async () => {
    const p = new FakeProvider([{ text: 'prefix {"score": 7, "ok": true, "note": "a } b { c"} suffix' }]);
    const { data } = await generateJson(p, z.object({ score: z.number(), ok: z.boolean(), note: z.string() }), req);
    expect(data).toEqual({ score: 7, ok: true, note: "a } b { c" });
  });
});

describe("LLM auth + rate limit", () => {
  async function makeUser(email: string) {
    const r = await signup({ email, password: "password123" });
    if (!r.ok) throw new Error("signup failed");
    return r.user;
  }

  it("enforces a per-user rate limit (test limit=5)", async () => {
    const user = await makeUser("llm1@example.com");
    for (let i = 0; i < 5; i++) await db.usageEvent.create({ data: { userId: user.id, kind: "RESUME_TAILOR" } });
    await expect(enforceLlmRateLimit(user.id)).rejects.toThrow(/too fast/i);
  });

  it("isolates job-fit analysis to the owner", async () => {
    const alice = await makeUser("llm-a@example.com");
    const bob = await makeUser("llm-b@example.com");
    const job = await createManualJob(alice.id, { title: "ML", company: "Acme", url: "https://x.com/1" });
    await expect(analyzeJobFit(bob.id, job.id)).rejects.toThrow(/Job not found/);
  });
});
