/*
  Warnings:

  - Added the required column `expiresAt` to the `ExtensionConnection` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "SubmissionOutcome" AS ENUM ('CONFIRMED', 'FAILED', 'UNCERTAIN');

-- AlterTable
ALTER TABLE "ExtensionConnection" ADD COLUMN     "expiresAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "revokedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SubmissionResult" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "applicationId" TEXT,
    "clientRef" TEXT NOT NULL,
    "outcome" "SubmissionOutcome" NOT NULL,
    "counted" BOOLEAN NOT NULL DEFAULT false,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubmissionResult_userId_counted_idx" ON "SubmissionResult"("userId", "counted");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionResult_userId_clientRef_key" ON "SubmissionResult"("userId", "clientRef");

-- AddForeignKey
ALTER TABLE "SubmissionResult" ADD CONSTRAINT "SubmissionResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
