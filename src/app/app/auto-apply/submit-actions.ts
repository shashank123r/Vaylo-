"use server";

import { getCurrentUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { runAutoApply, type RunSummary } from "@/lib/autoapply/run";

export interface AutoSubmitState {
  summary?: RunSummary;
  error?: string;
  needsProfile?: boolean; // profile too empty to match jobs against
}

// Runs the server-side auto-apply queue. Whether anything is actually SUBMITTED is
// decided inside runAutoApply by authorizeLiveSubmit: it needs the instance master
// switch on, an active paid plan, AND the explicit per-run authorization below.
// Otherwise it fills and stops ("prepared"). It never bypasses login/CAPTCHA/MFA.
export async function runAutoSubmit(_prev: AutoSubmitState | null, formData: FormData): Promise<AutoSubmitState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in again." };

  // Guard: matching needs something to match against. Without skills or a resume
  // every job scores 0 — so guide the user to set up their profile first instead of
  // returning a wall of zero-match results.
  const [skillCount, resumeCount] = await Promise.all([
    db.skillItem.count({ where: { profile: { userId: user.id } } }),
    db.resumeFile.count({ where: { userId: user.id } }),
  ]);
  if (skillCount === 0 && resumeCount === 0) {
    return { needsProfile: true };
  }

  const authorized = formData.get("authorize") === "on";
  const remoteRaw = String(formData.get("remote") ?? "");
  const minScoreRaw = Number(formData.get("minScore"));
  const maxRaw = Number(formData.get("maxApplications"));

  try {
    const summary = await runAutoApply(user.id, {
      q: String(formData.get("q") ?? "").trim() || undefined,
      location: String(formData.get("location") ?? "").trim() || undefined,
      remote: remoteRaw === "true" ? true : remoteRaw === "false" ? false : undefined,
      minScore: Number.isFinite(minScoreRaw) ? Math.min(100, Math.max(0, minScoreRaw)) : 40,
      maxApplications: Number.isFinite(maxRaw) ? Math.min(10, Math.max(1, maxRaw)) : 3,
      autoSubmit: true,
      authorized,
    });
    return { summary };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "The auto-apply run could not complete. Try again." };
  }
}
