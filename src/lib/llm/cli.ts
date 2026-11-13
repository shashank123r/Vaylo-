import "server-only";
import { spawn } from "node:child_process";
import type { LlmProvider, LlmRequest, LlmResult } from "./types";
import { LlmError } from "./types";

// CLI bridge: uses the locally installed `claude` CLI (Claude Code) in print mode
// as the LLM, so the app runs on real Claude using the operator's own Claude Code
// login — no ANTHROPIC_API_KEY required. This is the user's own tool, NOT the
// Anthropic API, and not a fabricated endpoint. Enable with LLM_PROVIDER=cli.
//
// It runs a single non-interactive completion per call, with no tools, a clean
// environment (no inherited Claude Code session vars), and a hard timeout.
export class CliProvider implements LlmProvider {
  readonly name = "cli:claude";
  private bin: string;

  constructor(bin = process.env.CLAUDE_CLI_PATH || "claude") {
    this.bin = bin;
  }

  generate(req: LlmRequest): Promise<LlmResult> {
    const prompt = `${req.system}\n\n${req.user}`;
    const timeoutMs = Number(process.env.LLM_TIMEOUT_MS ?? 90000);
    // Strip Claude Code session vars so the child is a fresh, standalone call.
    const env = { ...process.env };
    for (const k of Object.keys(env)) if (k.startsWith("CLAUDE_CODE_") || k === "CLAUDECODE") delete env[k];

    return new Promise<LlmResult>((resolve, reject) => {
      const child = spawn(this.bin, ["-p", "--output-format", "text"], { env });
      let out = "";
      let err = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new LlmError("claude CLI timed out", { retryable: true }));
      }, timeoutMs);

      child.stdout.on("data", (d) => (out += d.toString()));
      child.stderr.on("data", (d) => (err += d.toString()));
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(new LlmError("Could not run the claude CLI. Is it installed and logged in?", { cause: e }));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0 && out.trim()) resolve({ text: out.trim(), model: this.name });
        else reject(new LlmError(`claude CLI exited with ${code}`, { retryable: code !== 0 }));
      });

      child.stdin.write(prompt);
      child.stdin.end();
    });
  }
}
