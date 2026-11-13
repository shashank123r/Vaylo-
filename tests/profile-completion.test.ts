import { describe, it, expect } from "vitest";
import { computeCompletion, computeReadiness, FIELD_CATALOG, type ProfileData } from "@/lib/profile/completion";

const EMPTY: ProfileData = {};

// A profile with every counted (essential+helpful, non-sensitive) field filled.
const FULL: ProfileData = {
  legalName: "Jane Doe",
  email: "jane@example.com",
  phone: "+1 555 0100",
  city: "Berlin",
  country: "Germany",
  linkedin: "https://linkedin.com/in/jane",
  targetTitles: ["ML Engineer"],
  workplaceType: "remote",
  targetLocations: ["Remote EU"],
  needsSponsorship: false,
  yearsExperience: 5,
  workAuthByCountry: { DE: "citizen" },
  educationCount: 1,
  experienceCount: 2,
  skillCount: 8,
  hasResume: true,
};

describe("profile completion scoring", () => {
  it("empty profile scores 0%", () => {
    const r = computeCompletion(EMPTY);
    expect(r.percent).toBe(0);
    expect(r.countedComplete).toBe(0);
    expect(r.missingEssential.length).toBeGreaterThan(0);
  });

  it("a fully-filled (counted) profile scores 100%", () => {
    const r = computeCompletion(FULL);
    expect(r.percent).toBe(100);
    expect(r.countedComplete).toBe(r.countedTotal);
    expect(r.missingEssential).toHaveLength(0);
    expect(r.missingHelpful).toHaveLength(0);
  });

  it("sensitive declarations are EXCLUDED from the denominator", () => {
    // Filling only sensitive fields must not change the score or the denominator.
    const withSensitive: ProfileData = { ...EMPTY, gender: "female", ethnicity: "x", disabilityStatus: "no", veteranStatus: "no" };
    const base = computeCompletion(EMPTY);
    const sens = computeCompletion(withSensitive);
    expect(sens.percent).toBe(base.percent); // unchanged
    expect(sens.countedTotal).toBe(base.countedTotal); // denominator unchanged
    // No sensitive field appears in the counted catalog.
    const sensitiveKeys = FIELD_CATALOG.filter((f) => f.sensitive).map((f) => f.key);
    expect(sensitiveKeys.length).toBeGreaterThan(0);
    for (const k of sensitiveKeys) {
      expect(sens.missingEssential.find((m) => m.key === k)).toBeUndefined();
      expect(sens.missingHelpful.find((m) => m.key === k)).toBeUndefined();
    }
  });

  it("optional fields do not count toward the denominator", () => {
    const optionalOnly: ProfileData = { ...EMPTY, minSalary: 100000, noticePeriod: "30 days", projectCount: 3 };
    const base = computeCompletion(EMPTY);
    const r = computeCompletion(optionalOnly);
    expect(r.countedTotal).toBe(base.countedTotal); // denominator unchanged by optional fields
    expect(r.percent).toBe(base.percent);
  });

  it("partial completion is proportional and lists what's missing", () => {
    const partial: ProfileData = { email: "a@b.com", phone: "123", targetTitles: ["Dev"], skillCount: 3, hasResume: true };
    const r = computeCompletion(partial);
    expect(r.percent).toBeGreaterThan(0);
    expect(r.percent).toBeLessThan(100);
    // legalName + experience are essential and missing here.
    expect(r.missingEssential.map((m) => m.key)).toContain("legalName");
    expect(r.missingEssential.map((m) => m.key)).toContain("experience");
  });

  it("is computed deterministically and server-safe (same input => same output)", () => {
    const a = computeCompletion(FULL);
    const b = computeCompletion(FULL);
    expect(a).toEqual(b);
  });

  it("reports a per-section breakdown", () => {
    const r = computeCompletion(FULL);
    const docs = r.sections.find((s) => s.section === "documents");
    expect(docs?.percent).toBe(100);
    expect(r.sections.every((s) => s.percent >= 0 && s.percent <= 100)).toBe(true);
  });

  it("tier breakdown separates essential vs helpful and excludes sensitive", () => {
    const r = computeCompletion(FULL);
    expect(r.tiers.essential.total).toBeGreaterThan(0);
    expect(r.tiers.essential.complete).toBe(r.tiers.essential.total);
    // sensitive fields never appear under any tier total
    const nonSensitiveCount = FIELD_CATALOG.filter((f) => !f.sensitive).length;
    const tierTotal = r.tiers.essential.total + r.tiers.helpful.total + r.tiers.optional.total;
    expect(tierTotal).toBe(nonSensitiveCount);
  });
});

describe("application readiness", () => {
  it("an empty profile is NOT ready and lists essential blockers + pause-risks", () => {
    const c = computeCompletion(EMPTY);
    const r = computeReadiness(EMPTY, c);
    expect(r.ready).toBe(false);
    expect(r.blockers.length).toBeGreaterThan(0);
    // unknown factual answers pause specific applications (not guessed)
    expect(r.mayPause.some((m) => /work authorization/i.test(m))).toBe(true);
    expect(r.mayPause.some((m) => /sponsorship/i.test(m))).toBe(true);
    expect(r.mayPause.some((m) => /resume/i.test(m))).toBe(true);
  });

  it("a complete profile with factual answers is ready with no blockers or pauses", () => {
    const c = computeCompletion(FULL);
    const r = computeReadiness(FULL, c);
    expect(r.ready).toBe(true);
    expect(r.blockers).toHaveLength(0);
    expect(r.mayPause).toHaveLength(0);
  });

  it("missing work authorization is a pause-risk, not a hard blocker", () => {
    const data: ProfileData = { ...FULL, workAuthByCountry: null };
    const c = computeCompletion(data);
    const r = computeReadiness(data, c);
    expect(r.ready).toBe(true); // workauth is 'helpful', not essential -> still ready
    expect(r.mayPause.some((m) => /work authorization/i.test(m))).toBe(true);
  });
});
