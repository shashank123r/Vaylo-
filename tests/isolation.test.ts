import { describe, it, expect } from "vitest";
import { signup } from "@/lib/auth/service";
import { importDemoJob, saveJob, getJob, listJobs, confirmSubmission, getApplication } from "@/lib/jobs/service";
import { tailorResume, generateCoverLetter } from "@/lib/llm/service";
import { db } from "@/lib/db";

async function makeUser(email: string) {
  const res = await signup({ email, password: "password123" });
  if (!res.ok) throw new Error("signup failed");
  return res.user;
}

describe("cross-user data isolation", () => {
  it("a user cannot read or mutate another user's job", async () => {
    const alice = await makeUser("alice@example.com");
    const bob = await makeUser("bob@example.com");

    const job = await importDemoJob(alice.id, "demo-genai-eng");
    await saveJob(alice.id, job.id);

    // Alice sees it; Bob does not.
    expect(await getJob(alice.id, job.id)).not.toBeNull();
    expect(await getJob(bob.id, job.id)).toBeNull();
    expect(await listJobs(bob.id)).toHaveLength(0);
    expect(await getApplication(bob.id, job.id)).toBeNull();

    // Bob cannot generate against Alice's job.
    await expect(tailorResume(bob.id, job.id)).rejects.toThrow();
    await expect(generateCoverLetter(bob.id, job.id)).rejects.toThrow();
    await expect(confirmSubmission(bob.id, job.id)).rejects.toThrow();
  });

  it("import is idempotent and tailoring is attributed to the owner", async () => {
    const alice = await makeUser("alice2@example.com");
    const j1 = await importDemoJob(alice.id, "demo-cv-eng");
    const j2 = await importDemoJob(alice.id, "demo-cv-eng");
    expect(j1.id).toBe(j2.id); // no duplicate

    const version = await tailorResume(alice.id, j1.id);
    expect(version.userId).toBe(alice.id);
    expect(version.model).toBe("mock"); // labeled mock output in tests
    expect(version.contentMd).toContain("MOCK OUTPUT");

    const usage = await db.usageEvent.findMany({ where: { userId: alice.id } });
    expect(usage.length).toBeGreaterThan(0);
  });

  it("marks submitted only via explicit confirmation", async () => {
    const alice = await makeUser("alice3@example.com");
    const job = await importDemoJob(alice.id, "demo-platform-eng");
    await saveJob(alice.id, job.id);

    const before = await getApplication(alice.id, job.id);
    expect(before?.status).toBe("SAVED");
    expect(before?.confirmedByUser).toBe(false);

    const after = await confirmSubmission(alice.id, job.id);
    expect(after.status).toBe("SUBMITTED");
    expect(after.confirmedByUser).toBe(true);
    expect(after.submittedAt).not.toBeNull();
  });
});
