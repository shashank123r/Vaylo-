import "server-only";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "@/lib/db";
import { get } from "@/lib/storage";

// Writes the user's most recent resume to a temp file so the engine can upload it
// into an employer's real file control. Returns null if the user has no resume.
// Runs within the user's own context, so it only ever exposes the user's own file.
export async function resolveActiveResumeFile(userId: string): Promise<{ path: string; filename: string } | null> {
  const file = await db.resumeFile.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
  if (!file) return null;
  const data = await get(file.storageKey);
  const dir = await mkdtemp(join(tmpdir(), "jf-apply-"));
  const path = join(dir, file.filename.replace(/[^\w.\- ]+/g, "_") || "resume");
  await writeFile(path, data, { mode: 0o600 });
  return { path, filename: file.filename };
}
