import { describe, it, expect } from "vitest";
import { safeNext, loginUrlFor, importDestination, isIntent } from "@/lib/http/intent";
import { filterDemoJobs, getDemoJob, DEMO_JOBS } from "@/lib/jobs/demo";

describe("intent preservation + open-redirect safety", () => {
  it("keeps clean internal paths", () => {
    expect(safeNext("/app/jobs/import?demo=demo-cv-eng&intent=apply")).toBe(
      "/app/jobs/import?demo=demo-cv-eng&intent=apply",
    );
    expect(safeNext("/app")).toBe("/app");
  });

  it("rejects external and protocol-relative URLs", () => {
    expect(safeNext("https://evil.com")).toBeNull();
    expect(safeNext("//evil.com")).toBeNull();
    expect(safeNext("/\\evil.com")).toBeNull();
    expect(safeNext("javascript:alert(1)")).toBeNull();
    expect(safeNext("")).toBeNull();
    expect(safeNext(null)).toBeNull();
  });

  it("does not bounce back to auth pages", () => {
    expect(safeNext("/login?next=/app")).toBeNull();
    expect(safeNext("/signup")).toBeNull();
  });

  it("builds a login url that carries the encoded next", () => {
    const url = loginUrlFor("/app/jobs/import?demo=x&intent=save");
    expect(url).toContain("/login?next=");
    expect(decodeURIComponent(url.split("next=")[1]!)).toBe("/app/jobs/import?demo=x&intent=save");
  });

  it("builds a valid import destination for a known intent", () => {
    const dest = importDestination("demo-ml-infra", "apply");
    expect(dest).toBe("/app/jobs/import?demo=demo-ml-infra&intent=apply");
    expect(safeNext(dest)).toBe(dest); // the destination itself is a safe internal path
    expect(isIntent("apply")).toBe(true);
    expect(isIntent("hack")).toBe(false);
  });
});

describe("public demo browsing (no auth)", () => {
  it("exposes sample jobs and never references real users", () => {
    expect(DEMO_JOBS.length).toBeGreaterThan(0);
    for (const j of DEMO_JOBS) expect(j.demo).toBe(true);
  });

  it("filters by query, source, and remote", () => {
    expect(filterDemoJobs({ q: "vision" }).some((j) => /vision/i.test(j.title))).toBe(true);
    expect(filterDemoJobs({ source: "lever" }).every((j) => j.source === "lever")).toBe(true);
    expect(filterDemoJobs({ remote: true }).every((j) => j.remote)).toBe(true);
    expect(getDemoJob("does-not-exist")).toBeUndefined();
  });
});
