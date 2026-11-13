import { describe, it, expect } from "vitest";
import { signup } from "@/lib/auth/service";
import { createManualJob, listJobs, getJob } from "@/lib/jobs/service";
import { isHttpUrl, isSafePublicFetchTarget } from "@/lib/http/url";

async function makeUser(email: string) {
  const r = await signup({ email, password: "password123" });
  if (!r.ok) throw new Error("signup failed");
  return r.user;
}

describe("manual job entry", () => {
  it("creates a manual job scoped to the owner", async () => {
    const alice = await makeUser("j-alice@example.com");
    const bob = await makeUser("j-bob@example.com");
    const job = await createManualJob(alice.id, {
      title: "Senior ML Engineer",
      company: "Acme",
      url: "https://boards.greenhouse.io/acme/jobs/123",
      description: "Build things.",
    });
    expect(job.source).toBe("manual");
    expect(await getJob(alice.id, job.id)).not.toBeNull();
    expect(await getJob(bob.id, job.id)).toBeNull();
    expect(await listJobs(bob.id)).toHaveLength(0);
  });
});

describe("URL safety (SSRF guard)", () => {
  it("accepts public http(s) URLs", () => {
    expect(isHttpUrl("https://jobs.lever.co/acme/abc")).toBe(true);
    expect(isSafePublicFetchTarget("https://jobs.lever.co/acme/abc")).toBe(true);
  });

  it("rejects non-http and private/internal targets for server-side fetch", () => {
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafePublicFetchTarget("http://localhost:3000/admin")).toBe(false);
    expect(isSafePublicFetchTarget("http://127.0.0.1/")).toBe(false);
    expect(isSafePublicFetchTarget("http://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isSafePublicFetchTarget("http://10.0.0.5/")).toBe(false);
    expect(isSafePublicFetchTarget("http://172.16.0.1/")).toBe(false);
    expect(isSafePublicFetchTarget("http://internal/")).toBe(false); // bare hostname
    expect(isSafePublicFetchTarget("file:///etc/passwd")).toBe(false);
  });
});
