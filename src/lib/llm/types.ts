// LLM provider abstraction. The app depends only on this interface, so the
// Anthropic API, a self-hosted bridge, or a local mock are interchangeable.

export interface LlmRequest {
  system: string;
  user: string;
  maxTokens?: number;
  /** Lower = more deterministic. */
  temperature?: number;
}

export interface LlmResult {
  text: string;
  /** Identifier of the model/provider that produced the text, for provenance. */
  model: string;
}

export interface LlmProvider {
  readonly name: string;
  generate(req: LlmRequest): Promise<LlmResult>;
}

export class LlmError extends Error {
  /** Transient errors (timeout, 429, 5xx) that are safe to retry. */
  readonly retryable: boolean;
  constructor(
    message: string,
    opts?: { cause?: unknown; retryable?: boolean },
  ) {
    super(message);
    this.name = "LlmError";
    this.cause = opts?.cause;
    this.retryable = opts?.retryable ?? false;
  }
  override cause?: unknown;
}
