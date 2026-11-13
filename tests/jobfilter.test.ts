import { describe, it, expect } from "vitest";
import {
  googleSearchUrl,
  extractDestUrl,
  isJobish,
  isSupportedAts,
  isSkippableHost,
} from "../extension/src/jobfilter";

describe("google search url", () => {
  it("includes the role, 'jobs', and the location when given", () => {
    const u = googleSearchUrl("amazon", "berlin");
    expect(u.startsWith("https://www.google.com/search?q=")).toBe(true);
    expect(decodeURIComponent(u)).toContain("amazon jobs berlin");
  });
  it("omits blank location and still adds 'jobs'", () => {
    expect(decodeURIComponent(googleSearchUrl("data engineer"))).toContain("data engineer jobs");
  });
});

describe("extractDestUrl (unwrap Google redirects)", () => {
  it("unwraps /url?q=<real>", () => {
    expect(extractDestUrl("https://www.google.com/url?q=https://jobs.lever.co/acme/123&sa=U")).toBe(
      "https://jobs.lever.co/acme/123",
    );
  });
  it("returns direct result links unchanged", () => {
    expect(extractDestUrl("https://boards.greenhouse.io/acme/jobs/5")).toBe("https://boards.greenhouse.io/acme/jobs/5");
  });
  it("drops internal google links with no real target", () => {
    expect(extractDestUrl("https://www.google.com/search?q=amazon")).toBeNull();
    expect(extractDestUrl("not a url")).toBeNull();
  });
});

describe("result classification", () => {
  it("skips google/gstatic/youtube hosts", () => {
    expect(isSkippableHost("https://www.google.com/x")).toBe(true);
    expect(isSkippableHost("https://www.youtube.com/watch")).toBe(true);
    expect(isSkippableHost("https://boards.greenhouse.io/acme")).toBe(false);
  });
  it("keeps job/careers/application pages, drops unrelated ones", () => {
    expect(isJobish("https://amazon.jobs/en/jobs/123", "Software Dev Engineer")).toBe(true);
    expect(isJobish("https://acme.com/careers", "Careers")).toBe(true);
    expect(isJobish("https://boards.greenhouse.io/x/jobs/1", "")).toBe(true);
    expect(isJobish("https://en.wikipedia.org/wiki/Amazon", "Amazon - Wikipedia")).toBe(false);
  });
  it("identifies only the ATS we can actually fill", () => {
    expect(isSupportedAts("https://jobs.lever.co/acme/1")).toBe(true);
    expect(isSupportedAts("https://boards.greenhouse.io/acme/jobs/1")).toBe(true);
    expect(isSupportedAts("https://jobs.ashbyhq.com/acme/1")).toBe(true);
    expect(isSupportedAts("https://amazon.jobs/en/jobs/1")).toBe(false);
    expect(isSupportedAts("https://acme.myworkdayjobs.com/x")).toBe(false);
  });
});
