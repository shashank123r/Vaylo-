import { describe, it, expect } from "vitest";
import { signup } from "@/lib/auth/service";
import { db } from "@/lib/db";
import { applyResumeExtraction, type ResumeExtraction } from "@/lib/profile/autofill";

async function makeUser(email: string) {
  const r = await signup({ email, password: "password123" });
  if (!r.ok) throw new Error("signup failed");
  const profile = await db.profile.findUniqueOrThrow({ where: { userId: r.user.id } });
  return { userId: r.user.id, profileId: profile.id };
}

const FULL: ResumeExtraction = {
  legalName: "Jane Doe",
  phone: "+1 555 0100",
  city: "Berlin",
  country: "Germany",
  linkedin: "https://linkedin.com/in/jane",
  yearsExperience: 6,
  skills: ["Python", "PyTorch", "SQL"],
  education: [
    { school: "MIT", degree: "BSc", field: "CS", grade: "3.9", gradeScale: "GPA 4.0" },
    { school: "TU Berlin", degree: "MSc", grade: "First Class" },
  ],
  experience: [
    { company: "Acme", title: "ML Engineer", startDate: "2021", endDate: "2024", highlights: ["Built X"] },
  ],
  certifications: [{ name: "AWS SA", issuer: "Amazon" }],
};

describe("resume autofill (apply extraction)", () => {
  it("fills empty scalar fields and marks them resume-derived (unconfirmed)", async () => {
    const { userId, profileId } = await makeUser("af-fill@example.com");
    const report = await applyResumeExtraction(userId, FULL);
    expect(report.filled).toEqual(expect.arrayContaining(["legalName", "phone", "city", "country", "yearsExperience"]));
    const p = await db.profile.findUniqueOrThrow({ where: { userId } });
    expect(p.legalName).toBe("Jane Doe");
    expect(p.city).toBe("Berlin");
    expect(p.yearsExperience).toBe(6);
    const meta = await db.profileFieldMeta.findUnique({ where: { profileId_field: { profileId, field: "city" } } });
    expect(meta?.source).toBe("RESUME");
    expect(meta?.confirmed).toBe(false);
  });

  it("adds multiple education + experience + skills + certs, all resume-sourced", async () => {
    const { userId, profileId } = await makeUser("af-multi@example.com");
    const report = await applyResumeExtraction(userId, FULL);
    expect(report.addedEducation).toBe(2);
    expect(report.addedExperience).toBe(1);
    expect(report.addedSkills).toBe(3);
    expect(report.addedCertifications).toBe(1);
    const edu = await db.education.findMany({ where: { profileId } });
    expect(edu).toHaveLength(2);
    expect(edu.every((e) => e.source === "RESUME" && !e.confirmed)).toBe(true);
  });

  it("preserves CGPA/grade and scale EXACTLY (never converts)", async () => {
    const { userId, profileId } = await makeUser("af-grade@example.com");
    await applyResumeExtraction(userId, FULL);
    const edu = await db.education.findMany({ where: { profileId }, orderBy: { order: "asc" } });
    expect(edu[0]!.grade).toBe("3.9");
    expect(edu[0]!.gradeScale).toBe("GPA 4.0");
    expect(edu[1]!.grade).toBe("First Class"); // not converted to a number
  });

  it("partial extraction fills only present fields; the rest stay missing (no invention)", async () => {
    const { userId } = await makeUser("af-partial@example.com");
    await applyResumeExtraction(userId, { city: "Oslo", skills: ["Rust"] });
    const p = await db.profile.findUniqueOrThrow({ where: { userId } });
    expect(p.city).toBe("Oslo");
    expect(p.legalName).toBeNull(); // not invented
    expect(p.phone).toBeNull();
    expect(p.yearsExperience).toBeNull();
    expect(p.country).toBeNull();
  });

  it("does NOT overwrite a user-confirmed field; flags the conflict for review", async () => {
    const { userId, profileId } = await makeUser("af-conflict@example.com");
    await db.profile.update({ where: { userId }, data: { city: "Munich" } });
    await db.profileFieldMeta.create({ data: { profileId, field: "city", source: "MANUAL", confirmed: true } });

    const report = await applyResumeExtraction(userId, { city: "Berlin" });
    expect(report.conflicts).toContain("city");
    expect(report.filled).not.toContain("city");
    const p = await db.profile.findUniqueOrThrow({ where: { userId } });
    expect(p.city).toBe("Munich"); // preserved, NOT overwritten
    const meta = await db.profileFieldMeta.findUnique({ where: { profileId_field: { profileId, field: "city" } } });
    expect(meta?.conflictValue).toBe("Berlin"); // held for review
  });

  it("never erases existing info that is absent from the resume", async () => {
    const { userId } = await makeUser("af-noerase@example.com");
    await db.profile.update({ where: { userId }, data: { phone: "+49 123", city: "Hamburg" } });
    await applyResumeExtraction(userId, { legalName: "John" }); // resume lacks phone/city
    const p = await db.profile.findUniqueOrThrow({ where: { userId } });
    expect(p.phone).toBe("+49 123");
    expect(p.city).toBe("Hamburg");
    expect(p.legalName).toBe("John");
  });

  it("does not add duplicate skills or re-add entries into a non-empty section", async () => {
    const { userId, profileId } = await makeUser("af-dupe@example.com");
    await db.skillItem.create({ data: { profileId, name: "Python" } });
    await db.education.create({ data: { profileId, school: "Existing U" } });
    const report = await applyResumeExtraction(userId, FULL);
    expect(report.addedSkills).toBe(2); // Python already present -> only PyTorch, SQL added
    expect(report.addedEducation).toBe(0); // education section not empty -> skipped (no dup)
    const edu = await db.education.findMany({ where: { profileId } });
    expect(edu).toHaveLength(1);
  });

  it("handles an empty extraction without changing anything", async () => {
    const { userId } = await makeUser("af-empty@example.com");
    const report = await applyResumeExtraction(userId, {});
    expect(report.filled).toHaveLength(0);
    expect(report.addedEducation).toBe(0);
  });
});
