import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { signup } from "@/lib/auth/service";
import { saveAnswer, getAnswerMap, deleteAnswer, questionHash } from "@/lib/answers/bank";
import { normalizeQuestion } from "../extension/src/qnorm";
import { buildFields, planFields } from "../extension/src/adapters/shared";
import type { AutofillProfile, DetectedForm } from "../extension/src/adapters/types";

async function makeUser(email: string) {
  const r = await signup({ email, password: "password123" });
  if (!r.ok) throw new Error("signup failed");
  return r.user;
}
const baseProfile: AutofillProfile = {
  name: "Priya Sharma", email: "p@example.com", phone: null, location: "Bengaluru, India",
  website: null, linkedin: null, github: null,
};
function formOf(html: string): DetectedForm {
  const doc = new JSDOM(`<body><form>${html}</form></body>`).window.document;
  return { ats: "generic", fields: buildFields(doc.querySelector("form")!, doc), unsupported: [], multiStep: false, nav: { hasSubmit: false, hasNext: false } };
}

describe("normalizeQuestion (deterministic, collapses variants)", () => {
  it("lowercases, trims, collapses whitespace, strips (optional)/*/leading please + trailing punctuation", () => {
    const canonical = normalizeQuestion("Why do you want to work here?");
    expect(normalizeQuestion("  Why do   you want to work here?  ")).toBe(canonical);
    expect(normalizeQuestion("Please why do you want to work here")).toBe(canonical);
    expect(normalizeQuestion("Why do you want to work here? (optional)")).toBe(canonical);
    expect(normalizeQuestion("WHY DO YOU WANT TO WORK HERE?*")).toBe(canonical);
    expect(questionHash("Why do you want to work here?")).toBe(questionHash("  why do you want to WORK here  "));
  });
});

describe("answer bank: save / lookup / per-user isolation", () => {
  it("saves and returns the user's own answers, keyed by normalized question", async () => {
    const u = await makeUser("ab1@example.com");
    await saveAnswer(u.id, "Why do you want to work here?", "Because I love the mission.");
    const map = await getAnswerMap(u.id);
    expect(map[normalizeQuestion("why do you WANT to work here")]).toBe("Because I love the mission.");
  });
  it("does not leak answers across users and scopes delete per-user", async () => {
    const a = await makeUser("ab2@example.com");
    const b = await makeUser("ab2b@example.com");
    const saved = await saveAnswer(a.id, "Notice period?", "30 days");
    expect(await getAnswerMap(b.id)).toEqual({});
    // b cannot delete a's answer.
    await deleteAnswer(b.id, saved.id);
    expect((await getAnswerMap(a.id))[normalizeQuestion("notice period")]).toBe("30 days");
    // a can.
    await deleteAnswer(a.id, saved.id);
    expect(await getAnswerMap(a.id)).toEqual({});
  });
});

describe("planFields uses the bank (no LLM) and keeps sensitive pausing", () => {
  it("fills a custom question from the bank; pauses sensitive without a saved answer", () => {
    const form = formOf(
      `<label for="q1">Why do you want to work here?</label><input id="q1" name="q1"/>
       <label for="s1">Are you authorized to work in India?</label><input id="s1" name="s1"/>`,
    );
    const profile: AutofillProfile = { ...baseProfile, answers: { [normalizeQuestion("Why do you want to work here?")]: "Mission-driven." } };
    const plan = planFields(form, profile);
    // Custom question filled from the bank (no LLM involved — planFields is pure).
    expect(plan.fills.find((f) => f.key === "answerBank")?.value).toBe("Mission-driven.");
    // Sensitive work-auth question still paused (no saved answer for it).
    expect(plan.skipped.some((s) => /sensitive/i.test(s.reason))).toBe(true);
  });

  it("fills a sensitive question ONLY when the user saved their own answer to it", () => {
    const form = formOf(`<label for="s1">Are you authorized to work in India?</label><input id="s1" name="s1"/>`);
    const withSaved: AutofillProfile = { ...baseProfile, answers: { [normalizeQuestion("Are you authorized to work in India?")]: "Yes" } };
    const plan = planFields(form, withSaved);
    expect(plan.fills.find((f) => f.key === "answerBank")?.value).toBe("Yes");
    expect(plan.skipped.some((s) => /sensitive/i.test(s.reason))).toBe(false);

    // Without a saved answer → still pauses (never fabricated).
    const plan2 = planFields(form, baseProfile);
    expect(plan2.fills.length).toBe(0);
    expect(plan2.skipped.some((s) => /sensitive/i.test(s.reason))).toBe(true);
  });
});
