import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireExtensionUser } from "@/lib/extension/auth";
import { db } from "@/lib/db";
import { matchJob, type MatchProfile } from "@/lib/autoapply/match";

// The extension sends the listings it read from the job board in the user's own
// browser; we rank them against the user's VERIFIED profile with the same grounded
// scorer the rest of the app uses, and return them best-first with eligibility.
// No listings are invented here — we only score what the browser actually saw.
const schema = z.object({
  jobs: z
    .array(
      z.object({
        title: z.string().max(300),
        company: z.string().max(200).optional(),
        url: z.string().url().max(2000),
        source: z.string().max(60).optional(),
      }),
    )
    .max(100),
  minScore: z.coerce.number().min(0).max(100).default(30),
});

export async function POST(req: NextRequest) {
  const user = await requireExtensionUser(req);
  if (!user) return NextResponse.json({ error: "Invalid or expired pairing" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const p = await db.profile.findUnique({ where: { userId: user.id }, include: { skills: true } });
  const profile: MatchProfile = {
    skills: p?.skills.map((s) => s.name) ?? [],
    targetTitles: p?.targetTitles ?? [],
    headline: p?.headline ?? null,
    summary: p?.summary ?? null,
  };

  const minScore = parsed.data.minScore;
  const ranked = parsed.data.jobs
    .map((j) => {
      const m = matchJob(profile, { title: j.title, description: null });
      return {
        title: j.title,
        company: j.company ?? "",
        url: j.url,
        score: m.score,
        eligible: m.score >= minScore,
        reasons: m.reasons,
        matchedSkills: m.matchedSkills,
      };
    })
    .sort((a, b) => b.score - a.score);

  return NextResponse.json({ ranked }, { headers: { "Cache-Control": "no-store" } });
}
