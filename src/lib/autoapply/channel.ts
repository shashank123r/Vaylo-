import type { AutoApplyChannel } from "@prisma/client";

// Pure channel policy (no DB / no server-only), so it is unit-tested directly.
//
// SERVER: public, no-login ATS application forms where automation is permitted and
// we will actually SUBMIT. There is no value in filling a form server-side without
// submitting (the user never sees that headless tab), so server tasks are created
// only when live submission is authorized for the run.
//
// EXTENSION: everything else — the job runs in the user's own browser via the
// extension, which fills and leaves it for the user (and pauses on login/CAPTCHA).
// This is also where anything login-gated or unsupported server-side goes.

export const SERVER_SUBMITTABLE_RE = /(greenhouse\.io|grnh\.se|lever\.co|ashbyhq\.com)/i;

// True only for public ATS forms we can drive end-to-end server-side without a login.
export function isServerSubmittable(url: string): boolean {
  return SERVER_SUBMITTABLE_RE.test(url);
}

export function decideChannel(url: string, opts: { liveSubmit: boolean }): AutoApplyChannel {
  if (opts.liveSubmit && isServerSubmittable(url)) return "SERVER";
  return "EXTENSION";
}
