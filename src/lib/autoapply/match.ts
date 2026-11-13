// Deterministic, explainable resume-vs-job matching. It only ever credits skills
// and titles that are ACTUALLY present in the user's verified profile — it never
// invents a qualification. Returns a 0-100 score plus human-readable reasons.

export interface MatchProfile {
  skills: string[];
  targetTitles: string[];
  headline: string | null;
  summary: string | null;
}

export interface MatchJob {
  title: string;
  description: string | null;
}

export interface MatchResult {
  score: number; // 0-100
  matchedSkills: string[];
  titleAligned: boolean;
  reasons: string[];
}

function norm(s: string): string {
  return s.toLowerCase();
}

function wordSet(s: string): Set<string> {
  return new Set(norm(s).split(/[^a-z0-9+#.]+/).filter((w) => w.length > 1));
}

export function matchJob(profile: MatchProfile, job: MatchJob): MatchResult {
  const hay = norm(`${job.title} ${job.description ?? ""}`);
  const matchedSkills = profile.skills.filter((sk) => sk.trim() && hay.includes(norm(sk.trim())));

  const titleWords = new Set<string>();
  for (const t of [...profile.targetTitles, profile.headline ?? ""]) for (const w of wordSet(t)) titleWords.add(w);
  const jobTitleWords = wordSet(job.title);
  const titleOverlap = [...jobTitleWords].filter((w) => titleWords.has(w) && w.length > 2);
  const titleAligned = titleOverlap.length > 0;

  // Score: skill coverage (up to 70) + title alignment (up to 30). Honest and
  // simple; no fabricated percentages.
  const skillRatio = profile.skills.length ? matchedSkills.length / profile.skills.length : 0;
  const skillScore = Math.min(70, Math.round(skillRatio * 100));
  const titleScore = titleAligned ? Math.min(30, 10 + titleOverlap.length * 10) : 0;
  const score = Math.min(100, skillScore + titleScore);

  const reasons: string[] = [];
  if (matchedSkills.length) reasons.push(`Your skills appear in the role: ${matchedSkills.slice(0, 6).join(", ")}.`);
  else reasons.push("None of your listed skills were found in this posting.");
  if (titleAligned) reasons.push(`Title aligns with your target (${titleOverlap.slice(0, 3).join(", ")}).`);

  return { score, matchedSkills, titleAligned, reasons };
}
