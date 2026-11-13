import { describe, it, expect } from "vitest";
import { authorizeLiveSubmit, isExcluded } from "../src/lib/autoapply/run";

// These are the safety-critical, pure gates for the Pro autonomous workflow. They
// have no DB dependency, so they run fast and deterministically.

describe("authorizeLiveSubmit (fail-closed live-submit gate)", () => {
  const base = { requested: true, envEnabled: true, authorized: true, subscribed: true };
  it("allows live submit ONLY when all four conditions hold", () => {
    expect(authorizeLiveSubmit(base).live).toBe(true);
  });
  it("downgrades to prepare when the caller did not request submission", () => {
    expect(authorizeLiveSubmit({ ...base, requested: false }).live).toBe(false);
  });
  it("downgrades when the instance master switch is off", () => {
    const r = authorizeLiveSubmit({ ...base, envEnabled: false });
    expect(r.live).toBe(false);
    expect(r.reason).toMatch(/disabled on this instance/i);
  });
  it("downgrades when the user has not authorized this run", () => {
    const r = authorizeLiveSubmit({ ...base, authorized: false });
    expect(r.live).toBe(false);
    expect(r.reason).toMatch(/not authorized/i);
  });
  it("downgrades when the user has no paid entitlement", () => {
    const r = authorizeLiveSubmit({ ...base, subscribed: false });
    expect(r.live).toBe(false);
    expect(r.reason).toMatch(/paid plan/i);
  });
});

describe("isExcluded (Pro job exclusions)", () => {
  it("excludes by company or title substring, case-insensitively", () => {
    expect(isExcluded("Senior Engineer", "Acme Staffing", ["staffing"])).toBe(true);
    expect(isExcluded("Sales Manager", "Acme Corp", ["sales"])).toBe(true);
    expect(isExcluded("Backend Engineer", "Good Corp", ["staffing", "sales"])).toBe(false);
  });
  it("is a no-op when no exclusions are set", () => {
    expect(isExcluded("Anything", "Anywhere", undefined)).toBe(false);
    expect(isExcluded("Anything", "Anywhere", [])).toBe(false);
    expect(isExcluded("Anything", "Anywhere", ["  "])).toBe(false);
  });
});
