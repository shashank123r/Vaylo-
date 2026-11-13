import "server-only";
import { env } from "@/lib/env";
import type { JobProvider } from "./types";
import { NoneProvider } from "./none";
import { DemoProvider } from "./demo";
import { ArbeitnowProvider } from "./arbeitnow";

// The provider backing the REAL /jobs route. Default "none" => honest empty state.
//   none       -> honest empty/not-connected state (no listings)
//   arbeitnow  -> real, free, keyless live job feed (latest-first)
//   demo       -> clearly-labeled sample data on the real route too (opt-in)
let real: JobProvider | null = null;
export function getJobProvider(): JobProvider {
  if (real) return real;
  switch (env.JOBS_PROVIDER) {
    case "arbeitnow":
      real = new ArbeitnowProvider();
      break;
    case "demo":
      real = new DemoProvider();
      break;
    default:
      real = new NoneProvider();
  }
  return real;
}

// Always-available demo provider for the clearly-labeled /jobs/demo route.
let demo: DemoProvider | null = null;
export function getDemoProvider(): DemoProvider {
  if (!demo) demo = new DemoProvider();
  return demo;
}

export type { JobListing, JobQuery, JobSearchResult, JobProvider } from "./types";
export { DEFAULT_PAGE_SIZE } from "./types";
