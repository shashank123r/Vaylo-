import type { JobProvider, JobQuery, JobSearchResult } from "./types";
import { DEFAULT_PAGE_SIZE } from "./types";

// The honest default when no job-source API is configured. It returns zero
// results and configured=false, so the UI shows a setup/empty state instead of
// ever inventing jobs.
export class NoneProvider implements JobProvider {
  readonly name = "none";
  readonly configured = false;

  async search(query: JobQuery): Promise<JobSearchResult> {
    return {
      results: [],
      total: 0,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? DEFAULT_PAGE_SIZE,
      source: this.name,
      fetchedAt: new Date().toISOString(),
      configured: false,
    };
  }

  async getById(): Promise<null> {
    return null;
  }
}
