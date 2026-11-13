import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { normalizeQuestion } from "../../../extension/src/qnorm";
import type { AnswerBankEntry, AnswerSource } from "@prisma/client";

// The reusable answer bank. A user answers a custom question once; it's reused on
// future forms with NO LLM call. Keyed by a hash of the normalized question. Every
// operation is per-user scoped (isolation). It only ever stores/returns the user's
// OWN saved answers — it never invents one.

export function questionHash(question: string): string {
  return createHash("sha256").update(normalizeQuestion(question)).digest("hex");
}

export async function listAnswers(userId: string): Promise<AnswerBankEntry[]> {
  return db.answerBankEntry.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } });
}

export async function saveAnswer(
  userId: string,
  question: string,
  answer: string,
  source: AnswerSource = "USER",
): Promise<AnswerBankEntry> {
  const hash = questionHash(question);
  return db.answerBankEntry.upsert({
    where: { userId_questionHash: { userId, questionHash: hash } },
    update: { answer, questionLabel: question.trim(), source },
    create: { userId, questionHash: hash, questionLabel: question.trim(), answer, source },
  });
}

export async function deleteAnswer(userId: string, id: string): Promise<void> {
  await db.answerBankEntry.deleteMany({ where: { id, userId } }); // per-user scoped
}

// A map keyed by the NORMALIZED question text so the extension/engine can look up a
// field's answer with the same normalizeQuestion() — no client-side hashing needed.
export async function getAnswerMap(userId: string): Promise<Record<string, string>> {
  const rows = await db.answerBankEntry.findMany({ where: { userId }, select: { questionLabel: true, answer: true } });
  const map: Record<string, string> = {};
  for (const r of rows) map[normalizeQuestion(r.questionLabel)] = r.answer;
  return map;
}
