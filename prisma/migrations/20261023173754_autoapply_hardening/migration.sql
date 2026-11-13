-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AutoApplyTaskStatus" ADD VALUE 'DISCOVERED';
ALTER TYPE "AutoApplyTaskStatus" ADD VALUE 'MATCHED';
ALTER TYPE "AutoApplyTaskStatus" ADD VALUE 'APPLICATION_FORM_FOUND';
ALTER TYPE "AutoApplyTaskStatus" ADD VALUE 'FILLED_AND_VALIDATED';
ALTER TYPE "AutoApplyTaskStatus" ADD VALUE 'SUBMITTING';
ALTER TYPE "AutoApplyTaskStatus" ADD VALUE 'SUBMITTED_CONFIRMED';
ALTER TYPE "AutoApplyTaskStatus" ADD VALUE 'NEEDS_USER_ACTION';
ALTER TYPE "AutoApplyTaskStatus" ADD VALUE 'BLOCKED';
ALTER TYPE "AutoApplyTaskStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "AutoApplyTask" ADD COLUMN     "fieldsFilled" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "recoveryUrl" TEXT,
ADD COLUMN     "resumeVersionId" TEXT,
ADD COLUMN     "stage" TEXT,
ADD COLUMN     "uploadVerified" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ResumeVersion" ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "fileHash" TEXT,
ADD COLUMN     "inputsHash" TEXT,
ADD COLUMN     "storageKey" TEXT;

-- CreateTable
CREATE TABLE "AutoApplyTaskEvent" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AutoApplyTaskStatus" NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoApplyTaskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoApplyTaskEvent_taskId_idx" ON "AutoApplyTaskEvent"("taskId");

-- CreateIndex
CREATE INDEX "AutoApplyTaskEvent_userId_createdAt_idx" ON "AutoApplyTaskEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ResumeVersion_userId_jobId_inputsHash_idx" ON "ResumeVersion"("userId", "jobId", "inputsHash");

-- AddForeignKey
ALTER TABLE "AutoApplyTaskEvent" ADD CONSTRAINT "AutoApplyTaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AutoApplyTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
