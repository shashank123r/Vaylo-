import { describe, it, expect, vi, afterEach } from "vitest";
import { ArbeitnowProvider } from "@/lib/jobs/provider/arbeitnow";

function raw(slug: string, over: Partial<Record<string, unknown>> = {}) {
  return {
    slug,
    title: "Senior Engineer",
    company_name: "Caspar Health",
    location: "Berlin",
    remote: true,
    url: `https://www.arbeitnow.com/jobs/${slug}`,
    description: "<p>Build <b>things</b>&nbsp;here.</p>",
    job_types: ["Permanent employment"],
    created_at: 1_760_000_000,
    tags: ["react"],
    ...over,
  };
}

function mockFetch(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("Arbeitnow provider (mocked transport)", () => {
  it("maps real listings with source + employer link + attribution, dedupes by slug", async () => {
    mockFetch({ data: [raw("a"), raw("a"), raw("b", { remote: false, company_name: "Acme" })] });
    const res = await new ArbeitnowProvider().search({});
    expect(res.configured).toBe(true);
    expect(res.source).toBe("arbeitnow");
    expect(res.attribution?.label).toMatch(/Arbeitnow/);
    expect(res.results).toHaveLength(2); // "a" deduped
    const a = res.results[0]!;
    expect(a.demo).toBe(false);
    expect(a.sourceUrl).toContain("arbeitnow.com/jobs/a");
    expect(a.description).toBe("Build things here."); // HTML stripped, no injection
    expect(a.postedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.total).toBe(2); // 3 raw, one duplicate slug removed
    expect(res.pageSize).toBe(24);
  });

  it("renders NO markup even when the description is HTML-encoded (About Anthropic bug)", async () => {
    const encoded =
      '&lt;div class=&quot;content-intro&quot;&gt;&lt;h2&gt;&lt;strong&gt;About Anthropic&lt;/strong&gt;&lt;/h2&gt; &lt;p&gt;Our mission is to create reliable AI.&lt;/p&gt;&lt;/div&gt;';
    mockFetch({ data: [raw("x", { description: encoded })] });
    const res = await new ArbeitnowProvider().search({});
    const d = res.results[0]!.description!;
    expect(d).not.toMatch(/[<>]/); // no angle brackets at all
    expect(d).not.toMatch(/content-intro|<div|<h2|<strong/);
    expect(d).toContain("About Anthropic");
    expect(d).toContain("Our mission is to create reliable AI.");
  });

  it("filters by remote and query client-side", async () => {
    mockFetch({ data: [raw("a", { remote: true }), raw("b", { remote: false }), raw("c", { title: "Designer" })] });
    const p = new ArbeitnowProvider();
    expect((await p.search({ remote: false })).results.every((j) => j.remote === false)).toBe(true);
    expect((await p.search({ q: "designer" })).results.map((j) => j.id)).toEqual(["c"]);
  });

  it("returns an honest error state when the source fails (no fake jobs)", async () => {
    mockFetch({ error: "boom" }, 503);
    const res = await new ArbeitnowProvider().search({});
    expect(res.configured).toBe(true);
    expect(res.results).toHaveLength(0);
    expect(res.error).toMatch(/503/);
  });

  it("getById finds by slug or returns null", async () => {
    mockFetch({ data: [raw("found")] });
    const p = new ArbeitnowProvider();
    expect((await p.getById("found"))?.id).toBe("found");
    mockFetch({ data: [raw("other")] });
    expect(await p.getById("missing")).toBeNull();
  });
});
