// Real job-discovery provider abstraction. The UI depends only on this contract,
// so a real job-source API, a demo source, or "none" are interchangeable. The app
// NEVER fabricates listings: when no provider is configured, search returns an
// empty, clearly-unconfigured result and the UI shows setup guidance.

export interface JobListing {
  id: string; // provider-scoped stable id
  title: string;
  company: string;
  location: string | null;
  remote: boolean | null;
  employmentType: string | null; // full-time, contract, …, or null when unknown
  source: string; // provider name (greenhouse, lever, demo, …)
  sourceUrl: string | null; // link to the ORIGINAL employer job page
  postedAt: string | null; // ISO date or human label when available
  summary: string | null;
  description: string | null;
  salary: string | null; // only ever set when actually sourced
  demo: boolean; // true for clearly-labeled sample data
}

export interface JobQuery {
  q?: string;
  location?: string;
  remote?: boolean;
  source?: string;
  employmentType?: string;
  page?: number;
  pageSize?: number;
}

export interface JobSearchResult {
  results: JobListing[];
  total: number; // -1 when the source does not report an exact total
  page: number;
  pageSize: number;
  source: string;
  fetchedAt: string; // ISO timestamp of when results were produced
  configured: boolean; // false => no real provider; show setup guidance
  hasMore?: boolean; // for sources with an unknown total (cursor/feed pagination)
  attribution?: { label: string; url: string }; // required link-back for some sources
  error?: string; // honest error message when a configured source fails
}

export interface JobProvider {
  readonly name: string;
  readonly configured: boolean;
  search(query: JobQuery): Promise<JobSearchResult>;
  getById(id: string): Promise<JobListing | null>;
}

export const DEFAULT_PAGE_SIZE = 24;
