import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getJobProvider, type JobListing } from "@/lib/jobs/provider";
import { buildAutofillProfile } from "@/lib/extension/profile";
import { isSubscribed } from "@/lib/billing/entitlement";
import { reserveSubmission, finalizeConfirmed, markUncertain, releaseReservation } from "@/lib/applications/reservation";
import { upsertExtensionJob } from "@/lib/jobs/service";
import { matchJob, type MatchProfile } from "./match";
import { runApplication, type ApplyInput, type ApplyResult } from "./engine";
import { resolveActiveResumeFile } from "./resume";

export interface RunConfig {
  q?: string;
  location?: string;
  remote?: boolean;
  minScore: number; // 0-100
  maxApplications: number;
  autoSubmit: boolean; // caller wants live submission
  authorized: boolean; // explicit per-run user consent to submit
  // Case-insensitive substrings; a job whose company or title matches any of them
  // is skipped (e.g. ["staffing", "Acme Corp"]). Narrows scope only — never widens.
  exclusions?: string[];
}

// Pure, testable exclusion check: does the job's title or company match any
// user-provided exclusion substring (case-insensitive)?
export function isExcluded(title: string, company: string, exclusions?: string[]): boolean {
  if (!exclusions || exclusions.length === 0) return false;
  const hay = `${title} ${company}`.toLowerCase();
  return exclusions.some((ex) => {
    const needle = ex.trim().toLowerCase();
    return needle.length > 0 && hay.includes(needle);
  });
}

export type ItemStatus =
  | "skipped_low_match"
  | "skipped_duplicate"
  | "skipped_excluded"
  | "skipped_no_url"
  | "confirmed"
  | "uncertain"
  | "failed"
  | "awaiting_user"
  | "prepared"
  | "quota_reached";

export interface RunItem {
  jobId?: string;
  title: string;
  company: string;
  url: string | null;
  score: number;
  status: ItemStatus;
  reason?: string;
}

export interface RunSummary {
  liveSubmit: boolean; // was live submission actually active this run?
  liveSubmitBlockedReason?: string; // why auto-submit was downgraded to prepare, if so
  discovered: number;
  attempted: number;
  confirmed: number;
  uncertain: number;
  failed: number;
  awaitingUser: number;
  prepared: number;
  skipped: number;
  quotaReached: boolean;
  items: RunItem[];
}

export interface RunDeps {
  apply?: (input: ApplyInput) => Promise<ApplyResult>;
  searchJobs?: (config: RunConfig) => Promise<JobListing[]>;
  resumePath?: string | null;
}

// Pure, fully-testable gate: live submission requires ALL of (a) the caller
// requested it, (b) the instance master switch is on, (c) the user authorized this
// run, and (d) the user has a paid entitlement. Any missing condition downgrades to
// "prepare" (fill, never submit), with an honest reason. Fail-closed.
export function authorizeLiveSubmit(opts: {
  requested: boolean;
  envEnabled: boolean;
  authorized: boolean;
  subscribed: boolean;
}): { live: boolean; reason?: string } {
  if (!opts.requested) return { live: false };
  if (!opts.envEnabled) return { live: false, reason: "Live submission is disabled on this instance." };
  if (!opts.authorized) return { live: false, reason: "You have not authorized live submission for this run." };
  if (!opts.subscribed) return { live: false, reason: "Auto-submit requires an active paid plan." };
  return { live: true };
}

// Matching uses the user's confirmed profile. Its skills are populated both by the
// user and from the resume (via resume autofill), so matching reflects the resume
// as well as manually confirmed facts.
export async function loadMatchProfile(userId: string): Promise<MatchProfile> {
  const p = await db.profile.findUnique({ where: { userId }, include: { skills: true } });
  return {
    skills: p?.skills.map((s) => s.name) ?? [],
    targetTitles: p?.targetTitles ?? [],
    headline: p?.headline ?? null,
    summary: p?.summary ?? null,
  };
}

async function discover(config: RunConfig, deps: RunDeps): Promise<{ jobs: JobListing[]; configured: boolean }> {
  if (deps.searchJobs) return { jobs: await deps.searchJobs(config), configured: true };
  const provider = getJobProvider();
  const res = await provider.search({ q: config.q, location: config.location, remote: config.remote, pageSize: 50 });
  return { jobs: res.results, configured: provider.configured };
}

/**
 * Runs a bounded, controlled auto-apply queue for a user: discovers real jobs,
 * matches them to the verified profile, fills supported forms, uploads the resume,
 * and — ONLY when live submission is enabled AND the user authorized this run AND
 * they have a paid entitlement — submits and verifies the outcome by evidence.
 * Otherwise it fills and stops ("prepared"). Pauses (awaiting_user) on login /
 * CAPTCHA / sensitive questions; never bypasses them. Outcomes are recorded
 * idempotently; a job already applied to is never submitted twice.
 */
export async function runAutoApply(userId: string, config: RunConfig, deps: RunDeps = {}): Promise<RunSummary> {
  const apply = deps.apply ?? runApplication;

  // --- authorize live submission (opt-in paid) ---
  const gate = authorizeLiveSubmit({
    requested: config.autoSubmit,
    envEnabled: env.AUTO_APPLY_LIVE_SUBMIT,
    authorized: config.authorized,
    subscribed: config.autoSubmit ? await isSubscribed(userId) : false,
  });
  const liveSubmit = gate.live;
  const liveSubmitBlockedReason = gate.reason;

  const [autofill, matchProfile] = await Promise.all([buildAutofillProfile(userId), loadMatchProfile(userId)]);
  const resume = deps.resumePath !== undefined ? deps.resumePath : (await resolveActiveResumeFile(userId))?.path ?? null;
  const { jobs } = await discover(config, deps);

  const summary: RunSummary = {
    liveSubmit,
    liveSubmitBlockedReason,
    discovered: jobs.length,
    attempted: 0,
    confirmed: 0,
    uncertain: 0,
    failed: 0,
    awaitingUser: 0,
    prepared: 0,
    skipped: 0,
    quotaReached: false,
    items: [],
  };

  const seen = new Set<string>();
  for (const job of jobs) {
    if (summary.attempted >= config.maxApplications) break;
    const key = job.sourceUrl ?? job.id;
    if (seen.has(key)) continue;
    seen.add(key);

    // User exclusions (company / title substrings) — narrows scope, checked before
    // any matching, DB write, or submission.
    if (isExcluded(job.title, job.company, config.exclusions)) {
      summary.items.push({ title: job.title, company: job.company, url: job.sourceUrl, score: 0, status: "skipped_excluded", reason: "Matched one of your exclusions." });
      summary.skipped++;
      continue;
    }

    const m = matchJob(matchProfile, { title: job.title, description: job.description ?? null });
    const item: RunItem = { title: job.title, company: job.company, url: job.sourceUrl, score: m.score, status: "skipped_low_match" };

    if (m.score < config.minScore) {
      item.reason = m.reasons[0];
      summary.items.push(item);
      summary.skipped++;
      continue;
    }
    if (!job.sourceUrl) {
      item.status = "skipped_no_url";
      item.reason = "No application URL for this listing.";
      summary.items.push(item);
      summary.skipped++;
      continue;
    }

    const jobRow = await upsertExtensionJob(userId, {
      company: job.company,
      title: job.title,
      url: job.sourceUrl,
      description: job.description ?? undefined,
      source: job.source,
    });
    item.jobId = jobRow.id;
    const clientRef = `aa:${jobRow.id}`;

    if (liveSubmit) {
      // RESERVE capacity before attempting, so concurrent workers can't overshoot
      // the daily limit. Fail-closed and idempotent.
      const r = await reserveSubmission(userId, clientRef, jobRow.id);
      if (!r.ok && r.reason === "quota_reached") {
        // Daily limit reached: stop initiating new submissions, preserve the queue.
        item.status = "quota_reached";
        item.reason = `Daily submission limit reached.${r.resetAt ? ` Resets ${r.resetAt}.` : ""}`;
        summary.items.push(item);
        summary.quotaReached = true;
        break;
      }
      if (!r.ok && r.reason === "needs_reconcile") {
        item.status = "awaiting_user";
        item.reason = "A previous attempt was ambiguous — reconcile it before retrying (prevents duplicates).";
        summary.items.push(item);
        summary.awaitingUser++;
        continue;
      }
      if (r.idempotent && r.status === "CONFIRMED") {
        item.status = "skipped_duplicate";
        item.reason = "Already submitted in a previous run.";
        summary.items.push(item);
        summary.skipped++;
        continue;
      }
    } else {
      // Prepare mode: don't re-fill a job already confirmed submitted.
      const done = await db.submissionResult.findFirst({ where: { userId, clientRef, outcome: "CONFIRMED" } });
      if (done) {
        item.status = "skipped_duplicate";
        item.reason = "Already submitted.";
        summary.items.push(item);
        summary.skipped++;
        continue;
      }
    }

    summary.attempted++;
    let result: ApplyResult;
    try {
      result = await apply({ url: job.sourceUrl, profile: autofill, resumePath: resume, autoSubmit: liveSubmit, authorized: liveSubmit });
    } catch (err) {
      result = { status: "failed", filled: [], skipped: [], fileUploaded: false, reason: err instanceof Error ? err.message : "error" };
    }

    switch (result.status) {
      case "submitted_confirmed":
        // Finalize the reservation only on reliable success evidence.
        await finalizeConfirmed(userId, { jobId: jobRow.id, clientRef, evidence: result.evidence });
        item.status = "confirmed";
        summary.confirmed++;
        break;
      case "submitted_uncertain":
        // Ambiguous: HOLD the slot until reconciled (never a blind retry).
        await markUncertain(userId, clientRef, { jobId: jobRow.id, reason: result.reason });
        item.status = "uncertain";
        item.reason = result.reason;
        summary.uncertain++;
        break;
      case "failed":
      case "unsupported":
        if (liveSubmit) await releaseReservation(userId, clientRef, { jobId: jobRow.id, reason: result.reason });
        item.status = "failed";
        item.reason = result.reason;
        summary.failed++;
        break;
      case "paused":
        // Not submitted and not a failure -> free the reserved slot without recording
        // an outcome, so the job can be retried after the human resolves the blocker.
        if (liveSubmit) await releaseReservation(userId, clientRef, { reason: result.reason });
        item.status = "awaiting_user";
        item.reason = result.reason;
        summary.awaitingUser++;
        break;
      case "filled":
        item.status = "prepared";
        item.reason = result.reason;
        summary.prepared++;
        break;
    }
    summary.items.push(item);
  }

  return summary;
}
