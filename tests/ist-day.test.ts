import { describe, it, expect } from "vitest";
import { istDay, nextIstMidnight } from "@/lib/billing/day";

describe("IST calendar-day boundary (Asia/Kolkata, UTC+5:30, no DST)", () => {
  it("maps a UTC instant to the correct IST day", () => {
    // 2024-01-01 19:00 UTC == 2024-01-02 00:30 IST -> IST day is the 2nd.
    expect(istDay(new Date("2024-01-01T19:00:00Z"))).toBe("2024-01-02");
    // 2024-01-01 18:29 UTC == 2024-01-01 23:59 IST -> still the 1st.
    expect(istDay(new Date("2024-01-01T18:29:00Z"))).toBe("2024-01-01");
  });

  it("rolls the day exactly at 18:30 UTC (IST midnight)", () => {
    expect(istDay(new Date("2024-03-10T18:29:59Z"))).toBe("2024-03-10");
    expect(istDay(new Date("2024-03-10T18:30:00Z"))).toBe("2024-03-11");
  });

  it("nextIstMidnight returns the next 18:30 UTC boundary", () => {
    const reset = nextIstMidnight(new Date("2024-01-01T19:00:00Z")); // IST is already the 2nd
    expect(reset.toISOString()).toBe("2024-01-02T18:30:00.000Z"); // next IST midnight = 3rd 00:00 IST
    expect(reset.getTime()).toBeGreaterThan(new Date("2024-01-01T19:00:00Z").getTime());
  });
});
