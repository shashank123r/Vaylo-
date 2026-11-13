import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { greenhouse } from "../extension/src/adapters/index";
import { applyFills } from "../extension/src/fill";
import type { AutofillProfile } from "../extension/src/adapters/types";

const html = readFileSync(
  fileURLToPath(new URL("./fixtures/ats/greenhouse.html", import.meta.url)),
  "utf8",
);

const profile: AutofillProfile = {
  name: "Shashank R",
  email: "shashank@example.com",
  phone: "+91 90000 00000",
  location: "Hyderabad",
  website: "https://shashank.dev",
  linkedin: "https://linkedin.com/in/shashankr2005",
  github: null,
};

describe("content-script autofill (applyFills)", () => {
  it("writes mapped values into the real inputs and fires events, without touching sensitive fields", () => {
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    // jsdom needs Event available on the view used by applyFills.
    const form = greenhouse.detect(doc)!;
    const plan = greenhouse.plan(form, profile);

    let inputEvents = 0;
    doc.getElementById("email")!.addEventListener("input", () => inputEvents++);

    const outcome = applyFills(doc, plan);

    expect((doc.getElementById("email") as HTMLInputElement).value).toBe(profile.email);
    expect((doc.getElementById("first_name") as HTMLInputElement).value).toBe("Shashank");
    expect((doc.getElementById("last_name") as HTMLInputElement).value).toBe("R");
    expect((doc.getElementById("phone") as HTMLInputElement).value).toBe(profile.phone);
    expect(inputEvents).toBeGreaterThan(0);

    // The sensitive work-authorization select and the unknown custom question
    // were never targeted by autofill.
    expect(outcome.filled.find((f) => f.selector === "#work_auth")).toBeUndefined();
    expect(outcome.filled.find((f) => f.selector === "#custom1")).toBeUndefined();
    expect((doc.getElementById("custom1") as HTMLInputElement).value).toBe("");

    expect(outcome.filled.length).toBeGreaterThanOrEqual(4);
    expect(outcome.failed).toHaveLength(0);
  });

  it("maps select, radio and checkbox controls and fires change events", () => {
    const dom = new JSDOM(`<!doctype html><body><form>
      <select id="country"><option value="">-</option><option value="IN">India</option></select>
      <input type="radio" id="r_yes" name="relo" value="Yes">
      <input type="checkbox" id="agree">
    </form></body>`);
    const doc = dom.window.document;
    let changes = 0;
    doc.getElementById("country")!.addEventListener("change", () => changes++);

    const plan = {
      fills: [
        { selector: "#country", value: "IN", key: "location", label: "Country" },
        { selector: "#r_yes", value: "Yes", key: "relocate", label: "Relocate" },
        { selector: "#agree", value: "Yes", key: "agree", label: "Agree" },
      ],
      skipped: [],
      fileField: null,
    };
    const outcome = applyFills(doc, plan);

    expect((doc.getElementById("country") as HTMLSelectElement).value).toBe("IN");
    expect((doc.getElementById("r_yes") as HTMLInputElement).checked).toBe(true);
    expect((doc.getElementById("agree") as HTMLInputElement).checked).toBe(true);
    expect(changes).toBeGreaterThan(0);
    expect(outcome.filled).toHaveLength(3);
    expect(outcome.failed).toHaveLength(0);
  });

  it("reports a missing field as failed rather than silently succeeding", () => {
    const dom = new JSDOM(`<!doctype html><body><form></form></body>`);
    const plan = { fills: [{ selector: "#nope", value: "x", key: "email", label: "Email" }], skipped: [], fileField: null };
    const outcome = applyFills(dom.window.document, plan);
    expect(outcome.filled).toHaveLength(0);
    expect(outcome.failed[0]?.reason).toMatch(/not found/i);
  });
});
