import "server-only";
import { env } from "@/lib/env";
import { getJobProvider, type JobListing } from "@/lib/jobs/provider";
import { isSubscribed } from "@/lib/billing/entitlement";
import { upsertExtensionJob } from "@/lib/jobs/service";
import { normalizeUrl } from "../../../extension/src/jobfilter";
import { matchJob } from "./match";
import { authorizeLiveSubmit, loadMatchProfile, isExcluded } from "./run";
import { decideChannel } from "./channel";
import { enqueueTask } from "./queue";

// Starts an autonomous auto-apply RUN by enqueueing durable tasks. The server does
// all of discovery, matching, dedup, gating and queueing here; the actual browser
// work happens later and out-of-process (the server worker for SERVER tasks, the
// user's extension for EXTENSION tasks). This function never opens a browser.

export interface EnqueueRunConfig {
  q?: string;
  location?: string;
  remote?: boolean;
  minScore: number; // 0-100
  maxApplications: number;
  autoSubmit: boolean; // caller wants live (server-side) submission
  authorized: boolean; // explicit per-run user consent to submit
  exclusions?: string[];
}

export interface EnqueueRunDeps {
  searchJobs?: (config: EnqueueRunConfig) => Promise<JobListing[]>;
}

export interface EnqueueRunResult {
  runId: string;
  liveSubmit: boolean;
  liveSubmitBlockedReason?: string;
  discovered: number;
  queued: number;
  deduped: number;
  skipped: number;
  channels: { server: number; extension: number };
  items: { title: string; company: string; url: string | null; channel?: string; status: string; reason?: string }[];
}

function newRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function enqueueAutoApplyRun(
  userId: string,
  config: EnqueueRunConfig,
  deps: EnqueueRunDeps = {},
): Promise<EnqueueRunResult> {
  // Same fail-closed gate as the synchronous engine. Live submission requires the
  // master switch, this run's authorization, and a paid entitlement.
  const gate = authorizeLiveSubmit({
    requested: config.autoSubmit,
    envEnabled: env.AUTO_APPLY_LIVE_SUBMIT,
    authorized: config.authorized,
    subscribed: config.autoSubmit ? await isSubscribed(userId) : false,
  });
  const liveSubmit = gate.live;

  const matchProfile = await loadMatchProfile(userId);
  const jobs = deps.searchJobs
    ? await deps.searchJobs(config)
    : (await getJobProvider().search({ q: config.q, location: config.location, remote: config.remote, pageSize: 50 })).results;

  const runId = newRunId();
  const result: EnqueueRunResult = {
    runId,
    liveSubmit,
    liveSubmitBlockedReason: gate.reason,
    discovered: jobs.length,
    queued: 0,
    deduped: 0,
    skipped: 0,
    channels: { server: 0, extension: 0 },
    items: [],
  };

  const seen = new Set<string>();
  for (const job of jobs) {
    if (result.queued >= config.maxApplications) break;

    if (!job.sourceUrl) {
      result.skipped++;
      result.items.push({ title: job.title, company: job.company, url: null, status: "skipped", reason: "No application URL." });
      continue;
    }
    const norm = normalizeUrl(job.sourceUrl);
    if (seen.has(norm)) {
      result.deduped++;
      continue;
    }
    seen.add(norm);

    if (isExcluded(job.title, job.company, config.exclusions)) {
      result.skipped++;
      result.items.push({ title: job.title, company: job.company, url: job.sourceUrl, status: "skipped", reason: "Matched an exclusion." });
      continue;
    }
    const m = matchJob(matchProfile, { title: job.title, description: job.description ?? null });
    if (m.score < config.minScore) {
      result.skipped++;
      result.items.push({ title: job.title, company: job.company, url: job.sourceUrl, status: "skipped", reason: m.reasons[0] ?? "Below match threshold." });
      continue;
    }

    const jobRow = await upsertExtensionJob(userId, {
      company: job.company,
      title: job.title,
      url: job.sourceUrl,
      description: job.description ?? undefined,
      source: job.source,
    });
    const channel = decideChannel(job.sourceUrl, { liveSubmit });
    // Only SERVER tasks ever submit autonomously; EXTENSION tasks fill and leave the
    // submit to the user (safe default — the in-browser flow never auto-submits).
    const autoSubmit = channel === "SERVER" && liveSubmit;

    const { deduped } = await enqueueTask(userId, {
      runId,
      jobId: jobRow.id,
      company: job.company,
      title: job.title,
      jobUrl: job.sourceUrl,
      normalizedUrl: norm,
      channel,
      idempotencyKey: norm, // one task per (user, normalized application URL)
      clientRef: `aa:${jobRow.id}`,
      autoSubmit,
      authorized: config.authorized,
    });

    if (deduped) {
      result.deduped++;
    } else {
      result.queued++;
      if (channel === "SERVER") result.channels.server++;
      else result.channels.extension++;
      result.items.push({ title: job.title, company: job.company, url: job.sourceUrl, channel, status: "queued" });
    }
  }

  return result;
}
