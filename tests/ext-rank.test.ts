import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { signup } from "@/lib/auth/service";
import { createPairing } from "@/lib/extension/pairing";
import { db } from "@/lib/db";
import { POST as rankPOST } from "@/app/api/ext/rank/route";

const URL = "http://localhost/api/ext/rank";

interface RankedItem {
  title: string;
  company: string;
  url: string;
  score: number;
  eligible: boolean;
  reasons: string[];
  matchedSkills: string[];
}

function mkReq(token?: string, body?: unknown): NextRequest {
  const headers: Record<string, string> = {};
  if (token) headers["authorization"] = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(URL, {
    method: "POST",
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function makeUserWithProfile(email: string) {
  const r = await signup({ email, password: "password123" });
  if (!r.ok) throw new Error("signup failed");
  // signup() already creates an empty profile for the user; enrich it here.
  await db.profile.update({
    where: { userId: r.user.id },
    data: {
      headline: "Data Engineer",
      targetTitles: ["Data Engineer", "Machine Learning Engineer"],
      skills: { create: [{ name: "Python" }, { name: "SQL" }] },
    },
  });
  return r.user;
}

describe("ext API: job ranking", () => {
  it("rejects without a valid token (401)", async () => {
    expect((await rankPOST(mkReq(undefined, { jobs: [] }))).status).toBe(401);
    expect((await rankPOST(mkReq("jfx_bogus", { jobs: [] }))).status).toBe(401);
  });

  it("rejects malformed input (400)", async () => {
    const user = await makeUserWithProfile("rank-bad@example.com");
    const { token } = await createPairing(user.id);
    expect((await rankPOST(mkReq(token, { jobs: [{ title: "x" }] }))).status).toBe(400); // url missing
    expect((await rankPOST(mkReq(token, { nope: 1 }))).status).toBe(400);
  });

  it("ranks best-first and marks eligibility against the verified profile", async () => {
    const user = await makeUserWithProfile("rank-ok@example.com");
    const { token } = await createPairing(user.id);
    const res = await rankPOST(
      mkReq(token, {
        minScore: 20,
        jobs: [
          { title: "Warehouse Associate", url: "https://x.com/1" },
          { title: "Senior Data Engineer", url: "https://x.com/2" },
          { title: "Machine Learning Engineer", url: "https://x.com/3" },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const { ranked } = (await res.json()) as { ranked: RankedItem[] };
    expect(ranked).toHaveLength(3);
    // Sorted by score descending.
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1]!.score).toBeGreaterThanOrEqual(ranked[i]!.score);
    // The title-aligned roles beat the unrelated one.
    const warehouse = ranked.find((r) => r.title === "Warehouse Associate")!;
    const mle = ranked.find((r) => r.title === "Machine Learning Engineer")!;
    expect(mle.score).toBeGreaterThan(warehouse.score);
    expect(mle.eligible).toBe(true);
    expect(warehouse.eligible).toBe(false);
  });

  it("is grounded: never credits a skill the profile does not list", async () => {
    const user = await makeUserWithProfile("rank-grounded@example.com");
    const { token } = await createPairing(user.id);
    const res = await rankPOST(
      mkReq(token, { jobs: [{ title: "Rust Blockchain Engineer", url: "https://x.com/9" }] }),
    );
    const { ranked } = (await res.json()) as { ranked: RankedItem[] };
    expect(ranked[0]!.matchedSkills).not.toContain("Rust");
  });
});
