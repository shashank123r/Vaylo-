-- CreateEnum
CREATE TYPE "AutoApplyChannel" AS ENUM ('SERVER', 'EXTENSION');

-- CreateEnum
CREATE TYPE "AutoApplyTaskStatus" AS ENUM ('QUEUED', 'CLAIMED', 'OPENED', 'AUTOFILLED', 'NEEDS_USER', 'SUBMITTED', 'UNCERTAIN', 'FAILED');

-- CreateTable
CREATE TABLE "AutoApplyTask" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "jobId" TEXT,
    "company" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "jobUrl" TEXT NOT NULL,
    "normalizedUrl" TEXT NOT NULL,
    "channel" "AutoApplyChannel" NOT NULL,
    "status" "AutoApplyTaskStatus" NOT NULL DEFAULT 'QUEUED',
    "idempotencyKey" TEXT NOT NULL,
    "clientRef" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "autoSubmit" BOOLEAN NOT NULL DEFAULT false,
    "authorized" BOOLEAN NOT NULL DEFAULT false,
    "claimedBy" TEXT,
    "claimedAt" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evidence" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoApplyTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoApplyTask_channel_status_scheduledAt_idx" ON "AutoApplyTask"("channel", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "AutoApplyTask_userId_runId_idx" ON "AutoApplyTask"("userId", "runId");

-- CreateIndex
CREATE INDEX "AutoApplyTask_userId_channel_status_idx" ON "AutoApplyTask"("userId", "channel", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AutoApplyTask_userId_idempotencyKey_key" ON "AutoApplyTask"("userId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "AutoApplyTask" ADD CONSTRAINT "AutoApplyTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
