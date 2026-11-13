import "server-only";
import { db } from "@/lib/db";
import { getAnswerMap } from "@/lib/answers/bank";

// The ONLY profile data the extension ever receives. Explicitly excludes secrets
// (password hash, session/extension tokens, LLM keys). Every field here is data
// the user themselves entered and approved for applications.
export interface AutofillProfile {
  name: string | null;
  email: string;
  phone: string | null;
  location: string | null;
  website: string | null;
  linkedin: string | null;
  github: string | null;
  workAuth: string | null;
  summary: string | null;
  targetTitles: string[];
  experience: { company: string; title: string; dates: string | null; highlights: string[] }[];
  education: { school: string; degree: string | null; field: string | null; dates: string | null }[];
  skills: string[];
  // Answer bank (normalized question -> saved answer) so custom questions fill
  // without an LLM call. Owner-only; never invented.
  answers: Record<string, string>;
}

export async function buildAutofillProfile(userId: string): Promise<AutofillProfile> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      profile: {
        include: {
          experience: { orderBy: { order: "asc" } },
          education: { orderBy: { order: "asc" } },
          skills: true,
        },
      },
    },
  });
  const p = user.profile;
  return {
    name: user.name,
    email: user.email,
    phone: p?.phone ?? null,
    location: p?.location ?? null,
    website: p?.website ?? null,
    linkedin: p?.linkedin ?? null,
    github: p?.github ?? null,
    workAuth: p?.workAuth ?? null,
    summary: p?.summary ?? null,
    targetTitles: p?.targetTitles ?? [],
    experience:
      p?.experience.map((e) => ({
        company: e.company,
        title: e.title,
        dates: [e.startDate, e.current ? "Present" : e.endDate].filter(Boolean).join(" to ") || null,
        highlights: e.highlights,
      })) ?? [],
    education:
      p?.education.map((e) => ({
        school: e.school,
        degree: e.degree ?? null,
        field: e.field ?? null,
        dates: [e.startDate, e.endDate].filter(Boolean).join(" to ") || null,
      })) ?? [],
    skills: p?.skills.map((s) => s.name) ?? [],
    answers: await getAnswerMap(userId),
  };
}
