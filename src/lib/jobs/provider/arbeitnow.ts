import type { JobListing, JobProvider, JobQuery, JobSearchResult } from "./types";

// Arbeitnow free job board API (keyless). Docs: https://www.arbeitnow.com/api
// Terms: free, commercial use permitted with a link back; we show attribution.
// The endpoint is a paginated LATEST-first feed (not server-side search), so we
// fetch a page and filter client-side. The host is fixed (no SSRF surface).
const BASE = "https://www.arbeitnow.com/api/job-board-api";
const ATTRIBUTION = { label: "Jobs via Arbeitnow", url: "https://www.arbeitnow.com" };

interface RawJob {
  slug: string;
  title: string;
  company_name: string;
  location: string;
  remote: boolean;
  url: string;
  description: string;
  job_types: string[];
  created_at: number; // unix seconds
  tags: string[];
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

// Produces plain text with NO markup, even when the source is HTML-encoded or
// double-encoded: strip tags, decode entities, then strip any tags the decode
// revealed, and collapse whitespace.
function stripHtml(html: string): string {
  let s = html.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  s = decodeEntities(s); // second pass handles double-encoding (&amp;lt; -> &lt; -> <)
  s = s.replace(/<[^>]+>/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

function toListing(j: RawJob): JobListing {
  const text = stripHtml(j.description ?? "");
  return {
    id: j.slug,
    title: j.title,
    company: j.company_name,
    location: j.location || null,
    remote: typeof j.remote === "boolean" ? j.remote : null,
    employmentType: j.job_types?.length ? j.job_types.join(", ") : null,
    source: "arbeitnow",
    sourceUrl: j.url || null,
    postedAt: j.created_at ? new Date(j.created_at * 1000).toISOString().slice(0, 10) : null,
    summary: text ? text.slice(0, 180) + (text.length > 180 ? "…" : "") : null,
    description: text || null,
    salary: null,
    demo: false,
  };
}

function matches(j: JobListing, q: JobQuery): boolean {
  if (q.remote !== undefined && j.remote !== q.remote) return false;
  if (q.q) {
    const hay = `${j.title} ${j.company} ${j.location ?? ""} ${j.summary ?? ""}`.toLowerCase();
    if (!hay.includes(q.q.trim().toLowerCase())) return false;
  }
  if (q.location && !(j.location ?? "").toLowerCase().includes(q.location.trim().toLowerCase())) return false;
  return true;
}

async function fetchPage(page: number): Promise<RawJob[]> {
  const res = await fetch(`${BASE}?page=${page}`, {
    headers: { Accept: "application/json", "User-Agent": "JobFlow/0.1 (+https://www.arbeitnow.com)" },
    signal: AbortSignal.timeout(10_000),
    // Revalidate at most hourly to respect the source and avoid abuse.
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Arbeitnow returned HTTP ${res.status}`);
  const json = (await res.json()) as { data?: RawJob[] };
  return Array.isArray(json.data) ? json.data : [];
}

export class ArbeitnowProvider implements JobProvider {
  readonly name = "arbeitnow";
  readonly configured = true;

  async search(query: JobQuery): Promise<JobSearchResult> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = query.pageSize ?? 24;
    const base = {
      page,
      pageSize,
      source: this.name,
      fetchedAt: new Date().toISOString(),
      configured: true,
      attribution: ATTRIBUTION,
    };
    try {
      // Pull a bounded window of the latest feed (up to 3 upstream pages), dedup,
      // and filter. This gives a known total so numbered pagination is accurate.
      const seen = new Set<string>();
      const all: JobListing[] = [];
      for (let p = 1; p <= 3; p++) {
        const raw = await fetchPage(p);
        for (const r of raw) {
          if (seen.has(r.slug)) continue;
          seen.add(r.slug);
          const listing = toListing(r);
          if (matches(listing, query)) all.push(listing);
        }
        if (raw.length < 100) break; // last upstream page
      }
      const start = (page - 1) * pageSize;
      return {
        ...base,
        results: all.slice(start, start + pageSize),
        total: all.length,
        hasMore: start + pageSize < all.length,
      };
    } catch (err) {
      return {
        ...base,
        results: [],
        total: 0,
        hasMore: false,
        error: err instanceof Error ? err.message : "Failed to reach the job source.",
      };
    }
  }

  async getById(id: string): Promise<JobListing | null> {
    // The feed has no fetch-by-id; scan the first couple of latest pages.
    for (let p = 1; p <= 2; p++) {
      try {
        const raw = await fetchPage(p);
        const found = raw.find((j) => j.slug === id);
        if (found) return toListing(found);
      } catch {
        return null;
      }
    }
    return null;
  }
}
