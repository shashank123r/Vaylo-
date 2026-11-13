-- CreateEnum
CREATE TYPE "AnswerSource" AS ENUM ('USER', 'CAPTURED');

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "tailorPerJob" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ResumeVersion" ADD COLUMN     "roleKey" TEXT;

-- CreateTable
CREATE TABLE "AnswerBankEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionHash" TEXT NOT NULL,
    "questionLabel" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "source" "AnswerSource" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnswerBankEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnswerBankEntry_userId_idx" ON "AnswerBankEntry"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerBankEntry_userId_questionHash_key" ON "AnswerBankEntry"("userId", "questionHash");

-- AddForeignKey
ALTER TABLE "AnswerBankEntry" ADD CONSTRAINT "AnswerBankEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
