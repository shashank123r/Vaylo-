import { z } from "zod";

// Shared, validated contracts used by both API routes and server actions.

export const signupSchema = z.object({
  email: z.string().email("Enter a valid email."),
  password: z.string().min(8, "Use at least 8 characters."),
  name: z.string().trim().max(120).optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email."),
  password: z.string().min(1, "Enter your password."),
});

export const profileSchema = z.object({
  headline: z.string().trim().max(160).optional(),
  location: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  website: z.string().trim().max(200).optional(),
  linkedin: z.string().trim().max(200).optional(),
  github: z.string().trim().max(200).optional(),
  summary: z.string().trim().max(4000).optional(),
  targetTitles: z.string().trim().max(400).optional(), // comma-separated in the form
});

export const jobSchema = z.object({
  title: z.string().trim().min(1, "Job title is required.").max(200),
  company: z.string().trim().min(1, "Company is required.").max(200),
  location: z.string().trim().max(160).optional(),
  url: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .refine((v) => !v || /^https?:\/\//i.test(v), "Enter a valid http(s) URL or leave it blank."),
  description: z.string().trim().max(20000).optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type JobInput = z.infer<typeof jobSchema>;
