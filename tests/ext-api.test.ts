import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { signup } from "@/lib/auth/service";
import { createManualJob } from "@/lib/jobs/service";
import { createPairing } from "@/lib/extension/pairing";
import { db } from "@/lib/db";
import { GET as profileGET } from "@/app/api/ext/profile/route";
import { POST as resultPOST } from "@/app/api/ext/applications/result/route";

function mkReq(url: string, token?: string, body?: unknown): NextRequest {
  const headers: Record<string, string> = {};
  if (token) headers["authorization"] = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(url, {
    method: body !== undefined ? "POST" : "GET",
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function makeUser(email: string) {
  const r = await signup({ email, password: "password123" });
  if (!r.ok) throw new Error("signup failed");
  return r.user;
}

const PROFILE_URL = "http://localhost/api/ext/profile";
const RESULT_URL = "http://localhost/api/ext/applications/result";

describe("ext API: authentication", () => {
  it("rejects requests with no / invalid / expired token (401)", async () => {
    expect((await profileGET(mkReq(PROFILE_URL))).status).toBe(401);
    expect((await profileGET(mkReq(PROFILE_URL, "jfx_bogus"))).status).toBe(401);

    const user = await makeUser("api1@example.com");
    const { token } = await createPairing(user.id);
    expect((await profileGET(mkReq(PROFILE_URL, token))).status).toBe(200);

    // Session expiry closes access immediately.
    await db.extensionConnection.update({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await profileGET(mkReq(PROFILE_URL, token))).status).toBe(401);
  });

  it("returns profile + quota without secrets", async () => {
    const user = await makeUser("api2@example.com");
    const { token } = await createPairing(user.id);
    const res = await profileGET(mkReq(PROFILE_URL, token));
    const data = await res.json();
    expect(data.profile.email).toBe("api2@example.com");
    expect(data.quota.limit).toBe(3);
    expect(JSON.stringify(data)).not.toMatch(/passwordHash|tokenHash/);
  });
});

describe("ext API: outcome reporting", () => {
  it("validates input and records idempotently", async () => {
    const user = await makeUser("api3@example.com");
    const { token } = await createPairing(user.id);
    const job = await createManualJob(user.id, { title: "ML", company: "Acme", url: "https://acme.com/j1" });

    expect((await resultPOST(mkReq(RESULT_URL, undefined, { jobId: job.id, clientRef: "ref-abc-123456", outcome: "CONFIRMED" }))).status).toBe(401);
    expect((await resultPOST(mkReq(RESULT_URL, token, { jobId: job.id }))).status).toBe(400); // missing fields

    const first = await resultPOST(mkReq(RESULT_URL, token, { jobId: job.id, clientRef: "ref-abc-123456", outcome: "CONFIRMED" }));
    const firstData = await first.json();
    expect(first.status).toBe(200);
    expect(firstData.counted).toBe(true);

    const second = await resultPOST(mkReq(RESULT_URL, token, { jobId: job.id, clientRef: "ref-abc-123456", outcome: "CONFIRMED" }));
    const secondData = await second.json();
    expect(secondData.idempotent).toBe(true);

    // A job that is not this user's is rejected (tenant isolation at the route).
    const other = await makeUser("api4@example.com");
    const otherTok = (await createPairing(other.id)).token;
    const bad = await resultPOST(mkReq(RESULT_URL, otherTok, { jobId: job.id, clientRef: "ref-x-7890123", outcome: "CONFIRMED" }));
    expect(bad.status).toBe(404);
  });
});
