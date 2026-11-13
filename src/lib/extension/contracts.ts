import { z } from "zod";

// Validated contracts for extension -> backend requests. All inputs are untrusted.

export const extJobSchema = z.object({
  company: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  url: z.string().trim().url().max(2000).optional(),
  description: z.string().trim().max(20000).optional(),
  source: z.enum(["greenhouse", "lever", "ashby", "workday", "manual", "extension"]).optional(),
});

export const submissionResultSchema = z.object({
  jobId: z.string().trim().min(1).max(64),
  clientRef: z.string().trim().min(8).max(128), // idempotency key from the extension
  outcome: z.enum(["CONFIRMED", "FAILED", "UNCERTAIN"]),
  detail: z.string().trim().max(2000).optional(),
});

export type ExtJobInput = z.infer<typeof extJobSchema>;
export type SubmissionResultInput = z.infer<typeof submissionResultSchema>;
