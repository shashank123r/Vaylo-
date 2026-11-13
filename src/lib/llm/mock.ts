import type { LlmProvider, LlmRequest, LlmResult } from "./types";

/**
 * Deterministic local provider for development and tests. It performs NO network
 * calls and does NOT invent facts: it echoes and lightly restructures the input
 * it is given, and labels its output as mock-generated. This exists so the app
 * is fully runnable without API credentials. It must never be used to present
 * generated content to real users as if produced by a real model.
 */
export class MockProvider implements LlmProvider {
  readonly name = "mock";

  async generate(req: LlmRequest): Promise<LlmResult> {
    // Job-fit shape: return a valid, clearly-labeled structure so the structured
    // path is runnable in development without a real model.
    const wantsJobFit = /score/i.test(req.system) && /strengths/i.test(req.system) && /gaps/i.test(req.system);
    if (wantsJobFit) {
      return {
        text: JSON.stringify({
          score: 50,
          strengths: ["(mock) Overlaps with your listed skills"],
          gaps: ["(mock) Configure a real model for a genuine assessment"],
          rationale: "Mock output. This is a development stub, not a real job-fit analysis.",
        }),
        model: this.name,
      };
    }
    // Pull any JSON-shaped instruction out so structured callers still parse.
    const wantsJson = /json/i.test(req.system) || /json/i.test(req.user);
    if (wantsJson) {
      return {
        text: JSON.stringify({
          mock: true,
          note: "Deterministic mock output. Configure a real LLM provider for production.",
          summary: firstLine(req.user).slice(0, 240),
        }),
        model: this.name,
      };
    }
    const text = [
      "[MOCK OUTPUT - development stub, not a real model]",
      "",
      "This is deterministic placeholder text generated without any LLM call.",
      "It restates the request so the workflow is testable end to end:",
      "",
      firstLine(req.user).slice(0, 500),
    ].join("\n");
    return { text, model: this.name };
  }
}

function firstLine(s: string): string {
  return s.split("\n").find((l) => l.trim().length > 0)?.trim() ?? s.trim();
}
