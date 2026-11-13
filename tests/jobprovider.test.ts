import { describe, it, expect } from "vitest";
import { getJobProvider, getDemoProvider } from "@/lib/jobs/provider";

describe("job provider abstraction", () => {
  it("defaults to an unconfigured provider that returns NO listings (never fabricated)", async () => {
    const provider = getJobProvider(); // JOBS_PROVIDER unset -> "none" in tests
    expect(provider.configured).toBe(false);
    const res = await provider.search({ q: "engineer" });
    expect(res.configured).toBe(false);
    expect(res.results).toHaveLength(0);
    expect(res.total).toBe(0);
    expect(await provider.getById("demo-ml-infra")).toBeNull();
  });

  it("demo provider returns clearly-labeled sample listings only", async () => {
    const demo = getDemoProvider();
    expect(demo.configured).toBe(true);
    const res = await demo.search({});
    expect(res.total).toBeGreaterThan(0);
    for (const j of res.results) {
      expect(j.demo).toBe(true);
      expect(j.sourceUrl).toBeNull(); // demo has no real employer page
    }
    const one = await demo.getById("demo-cv-eng");
    expect(one?.demo).toBe(true);
    expect(one?.title).toMatch(/Computer Vision/i);
  });

  it("demo provider filters and paginates", async () => {
    const demo = getDemoProvider();
    expect((await demo.search({ remote: true })).results.every((j) => j.remote)).toBe(true);
    expect((await demo.search({ source: "lever" })).results.every((j) => j.source === "lever")).toBe(true);
    expect((await demo.search({ q: "vision" })).results.some((j) => /vision/i.test(j.title))).toBe(true);

    const p1 = await demo.search({ page: 1, pageSize: 2 });
    expect(p1.results).toHaveLength(2);
    expect(p1.page).toBe(1);
    const p2 = await demo.search({ page: 2, pageSize: 2 });
    expect(p2.results[0]?.id).not.toBe(p1.results[0]?.id);
  });
});
