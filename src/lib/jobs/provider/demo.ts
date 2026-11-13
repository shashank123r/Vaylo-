import type { JobListing, JobProvider, JobQuery, JobSearchResult } from "./types";
import { DEFAULT_PAGE_SIZE } from "./types";
import { DEMO_JOBS, type DemoJob } from "@/lib/jobs/demo";

// Serves the clearly-labeled sample listings through the provider contract. Every
// listing is marked demo=true so the UI can label it. This is NEVER presented as a
// real job source; it powers the /jobs/demo route and the opt-in JOBS_PROVIDER=demo.
function toListing(j: DemoJob): JobListing {
  return {
    id: j.id,
    title: j.title,
    company: j.company,
    location: j.location,
    remote: j.remote,
    employmentType: "Full-time",
    source: j.source,
    sourceUrl: null, // demo listings have no real employer page
    postedAt: j.postedLabel,
    summary: j.summary,
    description: j.description,
    salary: null,
    demo: true,
  };
}

function matches(j: DemoJob, q: JobQuery): boolean {
  if (q.remote !== undefined && j.remote !== q.remote) return false;
  if (q.source && j.source !== q.source) return false;
  if (q.q) {
    const hay = `${j.title} ${j.company} ${j.location} ${j.tags.join(" ")} ${j.summary}`.toLowerCase();
    if (!hay.includes(q.q.trim().toLowerCase())) return false;
  }
  if (q.location) {
    if (!j.location.toLowerCase().includes(q.location.trim().toLowerCase())) return false;
  }
  return true;
}

export class DemoProvider implements JobProvider {
  readonly name = "demo";
  readonly configured = true;

  async search(query: JobQuery): Promise<JobSearchResult> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const all = DEMO_JOBS.filter((j) => matches(j, query)).map(toListing);
    const start = (page - 1) * pageSize;
    return {
      results: all.slice(start, start + pageSize),
      total: all.length,
      page,
      pageSize,
      source: this.name,
      fetchedAt: new Date().toISOString(),
      configured: true,
    };
  }

  async getById(id: string): Promise<JobListing | null> {
    const j = DEMO_JOBS.find((d) => d.id === id);
    return j ? toListing(j) : null;
  }
}
