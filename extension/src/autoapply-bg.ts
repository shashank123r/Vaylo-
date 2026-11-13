// Auto-apply orchestration that runs IN THE USER'S OWN BROWSER via the extension.
// FREE TIER behaviour: it finds real postings (Google search, or the portal the
// user is already on), and for each target it DRILLS to a real application form —
// if the page is a careers/listing page it crawls it for postings, ranks them by
// fit, opens the best, follows the official Apply link if needed, then autofills
// the fields it recognizes from the user's approved profile. It NEVER clicks
// submit, NEVER bypasses login/CAPTCHA/anti-bot (it pauses and tells you), and
// reports an honest status at each hop. Autonomous submission is a Pro, server-side
// concern handled elsewhere — this file never submits.
import {
  googleSearchUrl,
  prioritizeJobs,
  pickCareersJobLinks,
  normalizeUrl,
  type DiscoveredLink,
} from "./jobfilter";

declare const chrome: any;

export interface AutoApplyConfig {
  q?: string;
  location?: string;
  maxApplications?: number;
  // "google" (default): discover via a Google search. "portal": discover from the
  // careers portal / listing page the user is already viewing (the active tab).
  mode?: "google" | "portal";
}

export type Emit = (event: Record<string, unknown>) => void;

// Honest per-job status vocabulary (free tier never reaches "submitted").
export type JobStatus = "filled" | "needs_input" | "blocked" | "manual" | "failed";

// How many times we drill from a listing/JD toward a real form (careers page ->
// ATS board -> individual posting). Bounded so the run stays fast and loop-free.
const MAX_HOPS = 3;

function waitForTabComplete(tabId: number, timeoutMs = 30000): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const listener = (id: number, info: any) => {
      if (id === tabId && info.status === "complete") finish();
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((t: any) => {
      if (t?.status === "complete") finish();
    });
    setTimeout(finish, timeoutMs);
  });
}

// Injected into a Google results page: read organic result links (title + real
// destination URL), skipping Google's own chrome, ads and redirects.
function readGoogleResultsInPage(max: number) {
  const out: { url: string; title: string }[] = [];
  const seen = new Set<string>();
  const anchors = Array.from(document.querySelectorAll("a[href]")) as HTMLAnchorElement[];
  for (const a of anchors) {
    let href = a.href;
    try {
      const u = new URL(href);
      if (u.hostname.endsWith("google.com")) {
        const q = u.searchParams.get("q") || u.searchParams.get("url");
        if (q && /^https?:/.test(q)) href = q;
        else continue;
      }
    } catch {
      continue;
    }
    let host: string;
    try {
      host = new URL(href).hostname;
    } catch {
      continue;
    }
    if (host.endsWith("google.com") || host.endsWith("gstatic.com") || host.endsWith("youtube.com")) continue;
    if (seen.has(href)) continue;
    const heading = a.querySelector("h3");
    const title = (heading?.textContent || a.textContent || "").replace(/\s+/g, " ").trim();
    if (!title || title.length < 3) continue;
    seen.add(href);
    out.push({ url: href, title });
    if (out.length >= max) break;
  }
  return out;
}

// Injected into any page: gather ALL anchors (absolute URL + visible text). The
// worker filters these with pickCareersJobLinks, so the job-link logic lives in one
// tested place. Capped to keep the payload small.
function readAnchorsInPage(max: number) {
  const out: { url: string; title: string }[] = [];
  for (const a of Array.from(document.querySelectorAll("a[href]")) as HTMLAnchorElement[]) {
    let url: string;
    try {
      url = new URL(a.getAttribute("href") || "", location.href).toString();
    } catch {
      continue;
    }
    const title = (a.querySelector("h1,h2,h3,h4")?.textContent || a.textContent || "").replace(/\s+/g, " ").trim();
    out.push({ url, title });
    if (out.length >= max) break;
  }
  return out;
}

// Injected into a job-DESCRIPTION page: find the official "Apply" link so we can
// follow it to the actual form (never treat a JD/homepage as an application).
function readApplyLinkInPage(): string | null {
  const els = Array.from(document.querySelectorAll("a[href], button")) as HTMLElement[];
  for (const el of els) {
    const text = (el.textContent || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
    if (!/^(apply|apply now|apply for this|submit application|start application|apply to)\b/i.test(text)) continue;
    const a = (el.closest("a") as HTMLAnchorElement | null) ?? (el.tagName === "A" ? (el as HTMLAnchorElement) : null);
    if (a?.href && /^https?:/.test(a.href)) return a.href;
  }
  return null;
}

async function addToGroup(tabId: number, groupId: number | null): Promise<number> {
  // Try to join the existing group. It can vanish between tabs (e.g. its only tab
  // was closed or a prior tab failed), which throws "No group with id" — in that
  // case we transparently start a fresh group instead of failing the whole run.
  if (groupId != null) {
    try {
      await chrome.tabs.group({ groupId, tabIds: [tabId] });
      return groupId;
    } catch {
      /* group gone — fall through and create a new one */
    }
  }
  const gid = await chrome.tabs.group({ tabIds: [tabId] });
  try {
    await chrome.tabGroups.update(gid, { title: "Vaylo auto-apply", color: "blue" });
  } catch {
    /* cosmetic */
  }
  return gid;
}

async function setGroupTitle(groupId: number | null, title: string) {
  if (groupId == null) return;
  try {
    await chrome.tabGroups.update(groupId, { title });
  } catch {
    /* cosmetic */
  }
}

interface RunApi {
  (path: string, init?: any): Promise<Response>;
}

// Rank candidate jobs by relevance to the user's profile using the server matcher
// (grounded in real profile facts). Ordering only; falls back to input order.
async function rankByRelevance(api: RunApi, jobs: DiscoveredLink[]): Promise<DiscoveredLink[]> {
  try {
    const rr = await api("/api/ext/rank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobs: jobs.map((j) => ({ title: j.title, url: j.url })), minScore: 0 }),
    });
    if (rr.ok) {
      const ranked: DiscoveredLink[] = (await rr.json()).ranked || [];
      if (ranked.length) return ranked;
    }
  } catch {
    /* ordering is best-effort */
  }
  return jobs;
}

interface FillResult {
  status: JobStatus;
  reason: string;
  filledCount?: number;
  needsUpload?: boolean;
  company?: string;
  title?: string;
  ats?: string;
  finalUrl?: string;
}

async function injectFill(tabId: number, profile: unknown): Promise<any> {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  return chrome.tabs.sendMessage(tabId, { type: "jf-fill", profile });
}

async function recordJob(api: RunApi, out: any, fallbackTitle: string, url: string): Promise<void> {
  try {
    await api("/api/ext/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company: out.company || "", title: out.title || fallbackTitle, url, source: out.ats }),
    });
  } catch {
    /* non-fatal */
  }
}

function fillResultFrom(out: any, fallbackTitle: string, finalUrl: string): FillResult {
  const filledCount = (out.filled || []).length;
  const needsUpload = !!out.needsUpload;
  const needsInput = (out.requiresAttention || 0) > 0 || needsUpload;
  return {
    status: needsInput ? "needs_input" : "filled",
    reason: needsUpload
      ? `Filled ${filledCount} field(s). Attach your resume and answer the flagged questions, then submit.`
      : needsInput
        ? `Filled ${filledCount} field(s). A few questions need your input, then submit.`
        : `Filled ${filledCount} field(s). Review and submit on the site.`,
    filledCount,
    needsUpload,
    company: out.company,
    title: out.title || fallbackTitle,
    ats: out.ats,
    finalUrl,
  };
}

// Process ONE target tab: try to fill; if it's a JD, follow its Apply link; if it's
// a careers/listing page, crawl it for postings, rank by fit, open the best, and
// recurse — until we reach a fillable form, a block, or the hop budget. NEVER submits.
async function processTarget(
  api: RunApi,
  job: DiscoveredLink,
  profile: unknown,
  tabId: number,
  emit: Emit,
  state: { depth: number; visited: Set<string> },
): Promise<FillResult> {
  await waitForTabComplete(tabId);
  const current = await chrome.tabs.get(tabId);
  const here = current.url || job.url;

  // 1) Try to fill the current page directly.
  let out = await injectFill(tabId, profile);
  if (out?.blocked) return { status: "blocked", reason: out.reason || "Sign-in / verification required — do it yourself, then retry.", finalUrl: here };
  if (out?.supported) {
    await recordJob(api, out, job.title, here);
    return fillResultFrom(out, job.title, here);
  }

  // 2) Job-description page: follow the official Apply link to the real form.
  let applyUrl: string | null = null;
  try {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: readApplyLinkInPage });
    applyUrl = result ?? null;
  } catch {
    /* ignore */
  }
  if (applyUrl && !state.visited.has(normalizeUrl(applyUrl)) && normalizeUrl(applyUrl) !== normalizeUrl(here)) {
    state.visited.add(normalizeUrl(applyUrl));
    emit({ phase: "following", title: job.title, url: applyUrl });
    await chrome.tabs.update(tabId, { url: applyUrl });
    await waitForTabComplete(tabId);
    const after = await chrome.tabs.get(tabId);
    out = await injectFill(tabId, profile);
    if (out?.blocked) return { status: "blocked", reason: out.reason || "Sign-in / verification required.", finalUrl: after.url || applyUrl };
    if (out?.supported) {
      await recordJob(api, out, job.title, after.url || applyUrl);
      return fillResultFrom(out, job.title, after.url || applyUrl);
    }
  }

  // 3) Careers / listing page: crawl for postings, rank by fit, drill into the best.
  if (state.depth < MAX_HOPS) {
    let anchors: DiscoveredLink[] = [];
    try {
      const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: readAnchorsInPage, args: [400] });
      anchors = result || [];
    } catch {
      /* ignore */
    }
    const links = pickCareersJobLinks(anchors, here).filter((l) => !state.visited.has(normalizeUrl(l.url)));
    if (links.length > 0) {
      emit({ phase: "crawled", title: job.title, count: links.length });
      const ranked = await rankByRelevance(api, links);
      const best = ranked[0];
      if (best) {
        state.visited.add(normalizeUrl(best.url));
        emit({ phase: "drilling", title: best.title, url: best.url });
        await chrome.tabs.update(tabId, { url: best.url });
        return processTarget(api, best, profile, tabId, emit, { depth: state.depth + 1, visited: state.visited });
      }
    }
  }

  return {
    status: "manual",
    reason: "Opened a careers/listing page but couldn't reach a fillable form automatically — review it yourself.",
    finalUrl: here,
  };
}

interface Summary {
  discovered: number;
  irrelevant: number;
  attempted: number;
  filled: number;
  needsInput: number;
  blocked: number;
  manual: number;
  failed: number;
}

export async function runAutoApply(api: RunApi, config: AutoApplyConfig, emit: Emit): Promise<void> {
  const maxApplications = Math.min(8, Math.max(1, config.maxApplications ?? 3));
  const mode = config.mode === "portal" ? "portal" : "google";

  // Confirm we are connected and fetch the approved profile.
  const pr = await api("/api/ext/profile");
  if (pr.status === 401) return emit({ phase: "error", error: "Not connected. Pair the extension first." });
  if (!pr.ok) return emit({ phase: "error", error: `Backend error (${pr.status}).` });
  const { profile } = await pr.json();

  // ---- Discovery: gather candidate targets (mode-specific) ------------------
  let candidates: DiscoveredLink[] = [];
  let irrelevant = 0;
  if (mode === "portal") {
    emit({ phase: "searching", message: "Reading jobs on this portal…", tier: "free" });
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return emit({ phase: "error", error: "No active tab to read the portal from." });
    try {
      const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readAnchorsInPage, args: [400] });
      const pageUrl = tab.url || "";
      candidates = pickCareersJobLinks(result || [], pageUrl);
    } catch (e: any) {
      return emit({ phase: "error", error: `Could not read this portal: ${String(e?.message ?? e)}` });
    }
  } else {
    emit({ phase: "searching", message: `Searching Google for “${config.q || "jobs"}”…`, tier: "free" });
    const searchTab = await chrome.tabs.create({ url: googleSearchUrl(config.q || "", config.location), active: true });
    await waitForTabComplete(searchTab.id);
    try {
      const current = await chrome.tabs.get(searchTab.id);
      if (/consent\.|\/sorry\//.test(current.url || "")) {
        emit({ phase: "error", error: "Google is asking for consent/verification. Complete it in the open tab, then run again." });
        return; // leave the tab open; never bypass
      }
      const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: searchTab.id }, func: readGoogleResultsInPage, args: [30] });
      const prioritized = prioritizeJobs(result || []);
      candidates = prioritized.kept;
      irrelevant = prioritized.irrelevant;
    } catch (e: any) {
      emit({ phase: "error", error: `Could not read the search results: ${String(e?.message ?? e)}` });
      return;
    }
    await chrome.tabs.remove(searchTab.id).catch(() => {});
  }

  emit({ phase: "discovered", count: candidates.length, irrelevant, scanned: candidates.length + irrelevant });
  if (candidates.length === 0) {
    return emit({
      phase: "done",
      tier: "free",
      summary: { discovered: 0, irrelevant, attempted: 0, filled: 0, needsInput: 0, blocked: 0, manual: 0, failed: 0 },
    });
  }

  // ---- Rank the top-level targets by relevance (grounded; ordering only) ----
  const ordered = await rankByRelevance(api, candidates);
  const toOpen = ordered.slice(0, maxApplications);
  emit({ phase: "ranked", opening: toOpen.length, top: ordered.slice(0, 10) });

  const summary: Summary = { discovered: candidates.length, irrelevant, attempted: 0, filled: 0, needsInput: 0, blocked: 0, manual: 0, failed: 0 };
  let groupId: number | null = null;

  for (const job of toOpen) {
    if (summary.attempted >= maxApplications) break;
    summary.attempted++;
    emit({ phase: "opened", title: job.title, url: job.url });

    const tab = await chrome.tabs.create({ url: job.url, active: true });
    try {
      groupId = await addToGroup(tab.id, groupId);
      await setGroupTitle(groupId, `Vaylo · ${summary.attempted}/${toOpen.length}`);
      const res = await processTarget(api, job, profile, tab.id, emit, {
        depth: 0,
        visited: new Set([normalizeUrl(job.url)]),
      });

      if (res.status === "filled") summary.filled++;
      else if (res.status === "needs_input") summary.needsInput++;
      else if (res.status === "blocked") summary.blocked++;
      else summary.manual++;

      emit({
        phase: "result",
        title: res.title || job.title,
        status: res.status,
        reason: res.reason,
        filledCount: res.filledCount ?? 0,
        needsUpload: res.needsUpload ?? false,
        url: res.finalUrl,
      });
    } catch (e: any) {
      summary.failed++;
      emit({ phase: "result", title: job.title, status: "failed", reason: String(e?.message ?? e) });
      await chrome.tabs.remove(tab.id).catch(() => {}); // close the dead tab
    }
  }

  await setGroupTitle(groupId, `Vaylo · ${summary.filled} filled, ${summary.needsInput} need you, ${summary.blocked} blocked`);
  // Free tier never submits: the user reviews and submits each tab themselves.
  emit({ phase: "done", tier: "free", autoSubmitted: false, summary, grouped: groupId != null });
}
