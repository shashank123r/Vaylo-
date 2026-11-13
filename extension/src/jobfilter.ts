// Pure helpers for the in-browser Google-search auto-apply flow. Kept free of any
// chrome/DOM dependency so they can be unit-tested. The background worker uses
// these to build the search, unwrap Google's redirect links, and keep only results
// that look like a real job / careers / application page.

// Domains whose application forms the extension can actually fill today.
export const ATS_RE = /(greenhouse\.io|lever\.co|ashbyhq\.com)/i;

// A result that looks like a job/careers/application page (vs. news, wiki, etc.).
export const JOBISH_RE =
  /(job|career|apply|hiring|greenhouse\.io|lever\.co|ashbyhq\.com|workday|smartrecruiters|icims|myworkdayjobs|amazon\.jobs|linkedin\.com\/jobs|indeed\.com|glassdoor)/i;

// Job-board aggregators that nearly always gate "Apply" behind a sign-in (so our
// filler can never reach a form) or only serve search listings. We discover direct
// company / ATS postings instead, so these are excluded from the Google query AND
// dropped from results — opening one just burns a slot on a login wall.
export const AGGREGATOR_RE =
  /(indeed\.com|linkedin\.com|glassdoor\.|naukri\.com|foundit\.in|monster\.com|shine\.com|timesjobs\.com|ziprecruiter\.com|simplyhired\.|dice\.com|instahyre\.com|cutshort\.io|internshala\.com|wellfound\.com|angel\.co)/i;

export function isAggregator(url: string): boolean {
  try {
    return AGGREGATOR_RE.test(new URL(url).hostname);
  } catch {
    return AGGREGATOR_RE.test(url);
  }
}

// Excluded from the search so Google returns direct company/ATS postings (which we
// can fill) instead of login-walled aggregator listings.
const SEARCH_EXCLUDE_HOSTS = [
  "indeed.com", "linkedin.com", "glassdoor.com", "naukri.com", "foundit.in",
  "monster.com", "shine.com", "timesjobs.com", "ziprecruiter.com", "simplyhired.com", "dice.com",
];

export function googleSearchUrl(q: string, loc?: string): string {
  const terms = [q || "", "jobs", loc || ""].filter(Boolean).join(" ");
  const exclude = SEARCH_EXCLUDE_HOSTS.map((h) => `-site:${h}`).join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(`${terms} ${exclude}`)}`;
}

// Unwrap a Google result href. Google sometimes links as /url?q=<real>&... and
// sometimes directly. Returns the real destination, or null for Google's own
// internal links (which we skip).
export function extractDestUrl(href: string): string | null {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  if (u.hostname.endsWith("google.com")) {
    const q = u.searchParams.get("q") || u.searchParams.get("url");
    if (q && /^https?:/.test(q)) return q;
    return null; // internal google link, not a result
  }
  return href;
}

const SKIP_HOSTS = ["google.com", "gstatic.com", "youtube.com"];

export function isSkippableHost(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return SKIP_HOSTS.some((s) => h === s || h.endsWith("." + s) || h.endsWith(s));
  } catch {
    return true;
  }
}

export function isJobish(url: string, title: string): boolean {
  return JOBISH_RE.test(url) || JOBISH_RE.test(title);
}

export function isSupportedAts(url: string): boolean {
  return ATS_RE.test(url);
}

// --- Discovery quality: prioritize real application links, drop the noise -----
// The live run previously opened careers HOMEPAGES and LOCATION pages (e.g.
// "Hyderabad, India") because they merely contained a job-ish word. These helpers
// keep only links that look like a specific posting/application and rank them.

// Strip hash, trailing slash, and tracking params so the same posting linked two
// ways collapses to one entry for de-duplication.
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    const drop: string[] = [];
    u.searchParams.forEach((_v, k) => {
      if (/^(utm_|gh_src$|src$|ref$|source$|trk$|trackingId$)/i.test(k)) drop.push(k);
    });
    drop.forEach((k) => u.searchParams.delete(k));
    let s = u.toString();
    s = s.replace(/\/$/, "");
    return s.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

// A careers HOMEPAGE, a location/search landing, or an aggregator search results
// page — i.e. NOT a specific job posting or application. These are "irrelevant"
// as direct apply targets.
const HOMEPAGE_PATH_RE = /^\/?$|^\/(careers?|jobs|en|us|global|home|life|about|teams?|students?|university)\/?$/i;
const LISTING_PATH_RE = /\/(locations?|search|browse|category|departments?|teams?|all-jobs|job-search)(\/|$|\?)/i;
const PLACE_TITLE_RE =
  /^[a-z .'-]+,\s*[a-z .'-]+$/i; // "Hyderabad, India" style — a place, not a role
const ROLE_WORD_RE =
  /(engineer|developer|manager|analyst|designer|scientist|architect|lead|director|intern|specialist|consultant|administrator|officer|associate|coordinator|recruiter|accountant|marketer|writer|product|data|software|sales|support|operations|research)/i;

export function isHomepageOrListing(url: string, title: string): boolean {
  let path = "/";
  try {
    path = new URL(url).pathname;
  } catch {
    /* treat unparseable as homepage-ish */
    return true;
  }
  if (HOMEPAGE_PATH_RE.test(path)) return true;
  if (LISTING_PATH_RE.test(path)) return true;
  // A title that is just a place name (no role word) is a location page.
  const t = title.trim();
  if (t && PLACE_TITLE_RE.test(t) && !ROLE_WORD_RE.test(t)) return true;
  // Title like "Careers at X" / "Jobs at X" / "Work at X" with no specific role.
  if (/^(careers?|jobs|work|life)\b/i.test(t) && !ROLE_WORD_RE.test(t)) return true;
  return false;
}

// Utility / navigation / account pages that are NOT an application destination and
// never lead to one by drilling (categories, preferences, job alerts, saved jobs,
// login/register, settings, help, legal, newsletter, search/filter, and pure
// location pages). These are REJECTED outright so the engine never wastes a slot
// opening "Job categories", "Preferences", "Job alerts", or "Hyderabad, India".
const NON_APP_PATH_RE =
  /(\/|[-_])(job[-_]?)?(categor(y|ies)|preferences?|job[-_]?alerts?|alerts?|saved([-_]?jobs?)?|watchlist|favou?rites?|locations?|dashboard|settings?|sign[-_]?in|log[-_]?in|login|logout|register|sign[-_]?up|signup|password|notifications?|messages?|inbox|help|faqs?|about(-us)?|our-?culture|life(-at-[a-z]+)?|values|mission|diversity|webinars?|press|investors?|privacy|terms|cookies?|legal|sitemap|newsletter|subscribe|unsubscribe|filters?|referrals?|job[-_]?search|search)(\/|$|\?|#)/i;
const NON_APP_TITLE_RE =
  /^\s*(job\s+)?(categor(y|ies)|preferences?|(job\s+)?alerts?|saved(\s+jobs?)?|watchlist|favou?rites?|dashboard|settings?|notifications?|messages?|sign\s*in|log\s*in|sign\s*up|register|search(\s+results)?|filters?|help|faqs?|about\s+us|privacy(\s+policy)?|terms|cookies?|newsletter|subscribe)\s*($|\||·|—|:)/i;
// Unambiguous utility words that never appear in a real role title — matched anywhere.
const NON_APP_TITLE_LOOSE_RE = /\b(categor(y|ies)|preferences?|job\s*alerts?|saved\s*jobs?|watchlist|favou?rites?)\b/i;

export function isNonApplicationPage(url: string, title: string): boolean {
  let path = "/";
  try {
    path = new URL(url).pathname;
  } catch {
    /* fall through to title checks */
  }
  if (NON_APP_PATH_RE.test(path)) return true;
  const t = (title || "").trim();
  if (NON_APP_TITLE_RE.test(t) || NON_APP_TITLE_LOOSE_RE.test(t)) return true;
  // A pure location page: the title is just a place name with no role word.
  if (t && PLACE_TITLE_RE.test(t) && !ROLE_WORD_RE.test(t)) return true;
  return false;
}

// Heuristic: does this look like a SPECIFIC job posting / application link?
const DIRECT_APPLY_RE =
  /(greenhouse\.io\/[^/]+\/jobs\/\d+|lever\.co\/[^/]+\/[0-9a-f-]{8,}|ashbyhq\.com\/[^/]+\/[0-9a-f-]{8,}|myworkdayjobs\.com\/.+\/job\/|\/apply(\/|$)|\/jobs?\/\d+|\/jobs?\/[0-9a-f-]{8,}|job[_-]?id=|requisitionid=|gh_jid=)/i;

export function applicationScore(url: string, title: string): number {
  let score = 0;
  if (isSupportedAts(url)) score += 25; // we can actually autofill it
  if (DIRECT_APPLY_RE.test(url)) score += 40; // a specific posting/application
  let depth = 0;
  try {
    depth = new URL(url).pathname.split("/").filter(Boolean).length;
  } catch {
    /* ignore */
  }
  if (depth >= 3) score += 15;
  else if (depth <= 1) score -= 20; // bare domain / shallow = homepage-ish
  if (ROLE_WORD_RE.test(title)) score += 15;
  if (/linkedin\.com\/jobs\/search|indeed\.com|glassdoor\./i.test(url)) score -= 15; // aggregator listing
  if (isHomepageOrListing(url, title)) score -= 50;
  if (isNonApplicationPage(url, title)) score -= 100; // utility/nav page — never a destination
  return score;
}

export interface DiscoveredLink {
  url: string;
  title: string;
}

export interface PrioritizedDiscovery {
  kept: DiscoveredLink[]; // real application/posting links, best-first
  irrelevant: number; // dropped homepages/location/duplicate/non-job links
}

// Filter to genuine job SOURCES, de-duplicate, and rank best-first. A careers /
// listing page is KEPT (it is a valid target to drill into — the engine crawls it
// for real postings), just ranked below a specific posting. Only non-job links
// (wiki, news, product pages) and duplicates are dropped as irrelevant.
export function prioritizeJobs(results: DiscoveredLink[]): PrioritizedDiscovery {
  const seen = new Set<string>();
  const kept: DiscoveredLink[] = [];
  let irrelevant = 0;
  for (const r of results) {
    const norm = normalizeUrl(r.url);
    if (seen.has(norm)) {
      irrelevant++;
      continue;
    }
    seen.add(norm);
    // Drop login-walled aggregators (Indeed/LinkedIn/Naukri/foundit/...): we can't
    // reach their application forms, so opening one only burns a slot on a sign-in
    // wall. Also reject utility/nav pages and anything not job-related.
    if (isAggregator(r.url) || isNonApplicationPage(r.url, r.title) || !isJobish(r.url, r.title)) {
      irrelevant++;
      continue;
    }
    kept.push(r);
  }
  // Specific postings first, careers/listing pages after (lower applicationScore).
  kept.sort((a, b) => applicationScore(b.url, b.title) - applicationScore(a.url, a.title));
  return { kept, irrelevant };
}

// Hosts whose links are job boards or individual postings even when linked from a
// different origin (a company careers page linking out to its Greenhouse board).
export const ATS_HOST_RE =
  /(greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|smartrecruiters\.com|icims\.com|workable\.com|bamboohr\.com|jobvite\.com)/i;

const JOB_PATH_RE =
  /\/(jobs?|apply|opening|openings|position|positions|vacancy|vacancies|requisition|role|roles|listing|posting)s?(\/|$|\?|#)/i;
const JOB_ID_PARAM_RE = /(job[_-]?id=|requisitionid=|gh_jid=|\/jobs?\/\d+|\/jobs?\/[0-9a-f-]{8,})/i;

// Search / browse / account CTAs that look job-ish but are NOT a posting and drill
// into another listing or a login — e.g. "Search Agentic AI jobs", "View all jobs",
// "Sign in". Rejected by title so a drill-through never wastes a hop on them.
const NAV_CTA_TITLE_RE =
  /^(browse|view\s+all|see\s+all|show\s+all|explore|find\s+(jobs?|roles?)|all\s+(jobs?|openings?|positions?|roles?)|sign\s*in|log\s*in|create\s+(an\s+)?account|register|join\s+our|back\s+to)\b/i;
const SEARCH_CTA_TITLE_RE = /^search\b.*\b(jobs?|roles?|openings?|positions?|vacanc)/i;

export function isNavOrSearchCta(title: string): boolean {
  const t = (title || "").trim();
  return NAV_CTA_TITLE_RE.test(t) || SEARCH_CTA_TITLE_RE.test(t);
}

// From a page's raw anchors, pick the ones that lead to a real job posting or an
// ATS board we can drill into: cross-origin ATS links (board or posting), or
// same-origin job-pathed links. De-duplicated; the page's own URL is excluded.
// Pure (no DOM) so it is unit-tested; the content script only gathers the anchors.
export function pickCareersJobLinks(anchors: DiscoveredLink[], pageUrl: string): DiscoveredLink[] {
  let pageOrigin = "";
  const pageNorm = normalizeUrl(pageUrl);
  try {
    pageOrigin = new URL(pageUrl).origin;
  } catch {
    /* unparseable page url: only cross-origin ATS links will qualify */
  }
  const seen = new Set<string>();
  const out: DiscoveredLink[] = [];
  for (const a of anchors) {
    let u: URL;
    try {
      u = new URL(a.url);
    } catch {
      continue;
    }
    // Reject utility/nav links even when they are ATS-hosted or job-pathed, e.g.
    // greenhouse.io/<co>/preferences, /jobs/categories, /job-alerts, a location page.
    if (isNonApplicationPage(a.url, a.title)) continue;
    // Reject search/browse/account CTAs ("Search X jobs", "View all", "Sign in").
    if (isNavOrSearchCta(a.title)) continue;
    // Never drill into a login-walled aggregator.
    if (isAggregator(a.url)) continue;
    const isAts = ATS_HOST_RE.test(u.hostname);
    const sameOrigin = pageOrigin !== "" && u.origin === pageOrigin;
    const jobPathed = JOB_PATH_RE.test(u.pathname) || JOB_ID_PARAM_RE.test(a.url);
    if (!(isAts || (sameOrigin && jobPathed))) continue;
    const norm = normalizeUrl(a.url);
    if (norm === pageNorm) continue; // the page's own link
    if (seen.has(norm)) continue;
    seen.add(norm);
    const title = (a.title || "").replace(/\s+/g, " ").trim();
    if (title.length < 2) continue;
    out.push({ url: a.url, title });
  }
  return out;
}
