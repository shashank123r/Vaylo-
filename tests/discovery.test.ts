import { describe, it, expect } from "vitest";
import {
  normalizeUrl,
  isHomepageOrListing,
  isNonApplicationPage,
  applicationScore,
  prioritizeJobs,
  pickCareersJobLinks,
} from "../extension/src/jobfilter";

describe("isNonApplicationPage (the live misclassification bug)", () => {
  it("rejects categories / preferences / alerts / saved / search / location utility pages", () => {
    const reject: [string, string][] = [
      ["https://careers.acme.com/jobs/categories", "Job categories"],
      ["https://careers.acme.com/job-categories", "Browse by category"],
      ["https://careers.acme.com/preferences", "Preferences"],
      ["https://careers.acme.com/account/preferences", "Your preferences"],
      ["https://careers.acme.com/job-alerts", "Job alerts"],
      ["https://careers.acme.com/alerts", "Alerts"],
      ["https://careers.acme.com/saved-jobs", "Saved jobs"],
      ["https://careers.acme.com/search?q=eng", "Search results"],
      ["https://careers.acme.com/sign-in", "Sign in"],
      ["https://boards.greenhouse.io/acme/preferences", "Preferences"],
      ["https://www.amazon.jobs/en/locations/hyderabad", "Hyderabad, India"],
      ["https://acme.com/about-us", "About Us"],
    ];
    for (const [url, title] of reject) {
      expect(isNonApplicationPage(url, title), `${title} should be rejected`).toBe(true);
    }
  });
  it("does NOT reject real postings, careers roots, or role titles that contain reject-ish words", () => {
    const keep: [string, string][] = [
      ["https://boards.greenhouse.io/acme/jobs/12345", "Senior Backend Engineer"],
      ["https://jobs.lever.co/acme/8f3a2b1c", "Benefits Analyst"], // "Benefits" is a role word here
      ["https://acme.com/careers", "Careers at Acme"], // a drillable careers root
      ["https://acme.com/jobs/news-editor/77", "News Editor"],
      ["https://acme.com/press-officer-job/5", "Press Officer"],
    ];
    for (const [url, title] of keep) {
      expect(isNonApplicationPage(url, title), `${title} should be kept`).toBe(false);
    }
  });
});

describe("normalizeUrl (dedupe key)", () => {
  it("strips hash, trailing slash and tracking params", () => {
    expect(normalizeUrl("https://Jobs.Lever.co/acme/123/?utm_source=x&gh_src=y#apply")).toBe(
      "https://jobs.lever.co/acme/123",
    );
  });
  it("collapses two links to the same posting", () => {
    expect(normalizeUrl("https://boards.greenhouse.io/acme/jobs/5?src=a")).toBe(
      normalizeUrl("https://boards.greenhouse.io/acme/jobs/5#app"),
    );
  });
});

describe("isHomepageOrListing (the real cause of '3 opened 0 filled')", () => {
  it("flags careers homepages and location pages, not specific postings", () => {
    // These are exactly what the user's run wrongly opened.
    expect(isHomepageOrListing("https://www.amazon.jobs/", "Amazon Careers: Impact the Future, Today")).toBe(true);
    expect(isHomepageOrListing("https://www.amazon.jobs/en/locations/hyderabad", "Hyderabad, India")).toBe(true);
    expect(isHomepageOrListing("https://careers.google.com/", "Careers at Google")).toBe(true);
    // A specific posting is NOT a homepage/listing.
    expect(isHomepageOrListing("https://boards.greenhouse.io/acme/jobs/12345", "Senior Backend Engineer")).toBe(false);
    expect(isHomepageOrListing("https://jobs.lever.co/acme/8f3a2b1c-aaaa", "Data Scientist")).toBe(false);
  });
});

describe("applicationScore ranks real applications above homepages", () => {
  it("scores a direct posting above a careers homepage", () => {
    const posting = applicationScore("https://boards.greenhouse.io/acme/jobs/12345", "Platform Engineer");
    const homepage = applicationScore("https://www.amazon.jobs/", "Amazon Careers");
    expect(posting).toBeGreaterThan(homepage);
  });
});

describe("prioritizeJobs (keeps drillable listings, drops non-jobs/dupes)", () => {
  it("keeps careers/listing pages (to drill into) and real postings, drops non-jobs + dupes, best-first", () => {
    const raw = [
      { url: "https://www.anthropic.com/careers", title: "Careers at Anthropic" }, // listing — KEEP (drill)
      { url: "https://www.amazon.jobs/en/locations/hyderabad", title: "Hyderabad, India" }, // location jobs — KEEP
      { url: "https://boards.greenhouse.io/acme/jobs/12345", title: "Senior Platform Engineer" }, // posting
      { url: "https://boards.greenhouse.io/acme/jobs/12345?src=dup", title: "Senior Platform Engineer" }, // dup
      { url: "https://en.wikipedia.org/wiki/Amazon", title: "Amazon (company)" }, // not jobish — DROP
    ];
    const { kept, irrelevant } = prioritizeJobs(raw);
    const urls = kept.map((k) => k.url);
    // The specific posting ranks first (highest applicationScore).
    expect(urls[0]).toBe("https://boards.greenhouse.io/acme/jobs/12345");
    // A careers root is KEPT so the engine can drill into it for real postings.
    expect(urls).toContain("https://www.anthropic.com/careers");
    // A LOCATION page is now rejected as a utility/non-application destination.
    expect(urls.some((u) => u.includes("hyderabad"))).toBe(false);
    // Non-job (wiki) and the duplicate are dropped too.
    expect(urls.some((u) => u.includes("wikipedia"))).toBe(false);
    expect(kept.length).toBe(2); // careers root + the specific posting
    expect(irrelevant).toBe(3); // location page + duplicate + wiki
  });
});

describe("pickCareersJobLinks (crawl a careers page for postings)", () => {
  it("extracts cross-origin Greenhouse board/posting links and same-origin job links, drops nav/noise", () => {
    const pageUrl = "https://www.anthropic.com/careers";
    const anchors = [
      { url: "https://www.anthropic.com/", title: "Home" }, // nav — drop
      { url: "https://www.anthropic.com/careers", title: "Careers" }, // the page itself — drop
      { url: "https://www.anthropic.com/about", title: "About" }, // not job-pathed — drop
      { url: "https://boards.greenhouse.io/anthropic", title: "See all roles" }, // ATS board — KEEP
      { url: "https://job-boards.greenhouse.io/anthropic/jobs/4020295008", title: "Research Engineer" }, // ATS posting — KEEP
      { url: "https://www.anthropic.com/jobs/senior-swe", title: "Senior Software Engineer" }, // same-origin job — KEEP
      { url: "https://twitter.com/anthropicai", title: "Twitter" }, // social — drop
    ];
    const links = pickCareersJobLinks(anchors, pageUrl);
    const urls = links.map((l) => l.url);
    expect(urls).toContain("https://boards.greenhouse.io/anthropic");
    expect(urls).toContain("https://job-boards.greenhouse.io/anthropic/jobs/4020295008");
    expect(urls).toContain("https://www.anthropic.com/jobs/senior-swe");
    expect(urls).not.toContain("https://www.anthropic.com/");
    expect(urls).not.toContain("https://www.anthropic.com/about");
    expect(urls).not.toContain("https://twitter.com/anthropicai");
    expect(urls).not.toContain("https://www.anthropic.com/careers"); // the page itself
    expect(links.length).toBe(3);
  });
});
