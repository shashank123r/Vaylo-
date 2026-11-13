import "server-only";
import { db } from "@/lib/db";
import { newKey, put, get, remove } from "@/lib/storage";
import { validateUpload, extractText, ACCEPTED } from "./parse";
import type { ResumeFile } from "@prisma/client";

export interface UploadInput {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "resume";
  return base.replace(/[^\w.\- ]+/g, "_").slice(0, 160) || "resume";
}

/** Validates, stores privately, extracts text, and records the row for this user. */
export async function uploadResume(userId: string, input: UploadInput): Promise<ResumeFile> {
  const type = validateUpload(input.mimeType, input.buffer.length, input.buffer);
  let parsedText = "";
  try {
    parsedText = await extractText(input.buffer, type);
  } catch {
    parsedText = ""; // parsing can fail on odd files; keep the original, text optional
  }
  const storageKey = newKey();
  await put(storageKey, input.buffer);
  return db.resumeFile.create({
    data: {
      userId,
      filename: safeFilename(input.filename),
      mimeType: input.mimeType,
      sizeBytes: input.buffer.length,
      storageKey,
      parsedText: parsedText || null,
    },
  });
}

export async function listResumes(userId: string): Promise<ResumeFile[]> {
  return db.resumeFile.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
}

/** Owner-only: returns the file bytes + metadata, or null if not this user's. */
export async function getResumeForDownload(
  userId: string,
  resumeId: string,
): Promise<{ file: ResumeFile; data: Buffer } | null> {
  const file = await db.resumeFile.findFirst({ where: { id: resumeId, userId } });
  if (!file) return null;
  const data = await get(file.storageKey);
  return { file, data };
}

export async function deleteResume(userId: string, resumeId: string): Promise<boolean> {
  const file = await db.resumeFile.findFirst({ where: { id: resumeId, userId } });
  if (!file) return false;
  await remove(file.storageKey);
  await db.resumeFile.delete({ where: { id: file.id } });
  return true;
}

export const ACCEPT_ATTR = Object.keys(ACCEPTED).join(",");
