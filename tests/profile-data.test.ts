import { describe, it, expect } from "vitest";
import { signup } from "@/lib/auth/service";
import { db } from "@/lib/db";
import { getProfileCompletion, loadProfileData } from "@/lib/profile/data";

async function makeUser(email: string) {
  const r = await signup({ email, password: "password123" });
  if (!r.ok) throw new Error("signup failed");
  return r.user;
}
async function profileId(userId: string) {
  const p = await db.profile.findUniqueOrThrow({ where: { userId } });
  return p.id;
}

describe("server-side profile completion (persisted)", () => {
  it("a brand-new user has a low, non-negative score and lists missing essentials", async () => {
    const u = await makeUser("pdata-new@example.com");
    const c = await getProfileCompletion(u.id);
    expect(c.percent).toBeGreaterThanOrEqual(0);
    expect(c.percent).toBeLessThan(50); // email is set at signup, little else
    expect(c.missingEssential.length).toBeGreaterThan(0);
  });

  it("rises as real data is persisted and is identical on reload (deterministic)", async () => {
    const u = await makeUser("pdata-fill@example.com");
    const before = await getProfileCompletion(u.id);

    await db.profile.update({
      where: { userId: u.id },
      data: {
        legalName: "Jane Doe",
        phone: "+1 555 0100",
        city: "Berlin",
        country: "Germany",
        linkedin: "https://linkedin.com/in/jane",
        targetTitles: ["ML Engineer"],
        workplaceType: "remote",
        yearsExperience: 5,
      },
    });
    const pid = await profileId(u.id);
    await db.workExperience.create({ data: { profileId: pid, company: "Acme", title: "MLE" } });
    await db.skillItem.create({ data: { profileId: pid, name: "Python" } });
    await db.education.create({ data: { profileId: pid, school: "MIT" } });

    const after = await getProfileCompletion(u.id);
    expect(after.percent).toBeGreaterThan(before.percent);

    // Reload -> same number (survives refresh, computed from persisted data).
    const reload = await getProfileCompletion(u.id);
    expect(reload.percent).toBe(after.percent);
    expect(reload).toEqual(after);
  });

  it("sensitive declarations never raise the persisted score", async () => {
    const u = await makeUser("pdata-sensitive@example.com");
    const before = await getProfileCompletion(u.id);
    await db.profile.update({
      where: { userId: u.id },
      data: { gender: "female", ethnicity: "x", disabilityStatus: "no", veteranStatus: "no" },
    });
    const after = await getProfileCompletion(u.id);
    expect(after.percent).toBe(before.percent);
    expect(after.countedTotal).toBe(before.countedTotal);
  });

  it("counts a resume toward completion", async () => {
    const u = await makeUser("pdata-resume@example.com");
    const before = await getProfileCompletion(u.id);
    await db.resumeFile.create({
      data: { userId: u.id, filename: "cv.pdf", mimeType: "application/pdf", sizeBytes: 100, storageKey: "k_" + u.id, parsedText: "x" },
    });
    const after = await getProfileCompletion(u.id);
    expect(after.countedComplete).toBe(before.countedComplete + 1);
    expect(after.percent).toBeGreaterThan(before.percent);
  });

  it("is isolated per user (one user's data never affects another's score)", async () => {
    const a = await makeUser("pdata-iso-a@example.com");
    const b = await makeUser("pdata-iso-b@example.com");
    const pidA = await profileId(a.id);
    await db.profile.update({ where: { userId: a.id }, data: { legalName: "A", phone: "1", city: "X", country: "Y", targetTitles: ["Dev"] } });
    await db.workExperience.create({ data: { profileId: pidA, company: "C", title: "T" } });
    await db.skillItem.create({ data: { profileId: pidA, name: "S" } });

    const ca = await getProfileCompletion(a.id);
    const cb = await getProfileCompletion(b.id);
    expect(ca.percent).toBeGreaterThan(cb.percent);
    // b's loaded data reflects only b (empty), not a's rows.
    const db2 = await loadProfileData(b.id);
    expect(db2.experienceCount).toBe(0);
    expect(db2.skillCount).toBe(0);
    expect(db2.legalName).toBeNull();
  });
});
