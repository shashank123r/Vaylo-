-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('RESERVED', 'CONFIRMED', 'RELEASED', 'UNCERTAIN');

-- CreateTable
CREATE TABLE "SubmissionReservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientRef" TEXT NOT NULL,
    "jobId" TEXT,
    "day" TEXT NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "evidence" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubmissionReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubmissionReservation_userId_day_status_idx" ON "SubmissionReservation"("userId", "day", "status");

-- CreateIndex
CREATE INDEX "SubmissionReservation_userId_status_idx" ON "SubmissionReservation"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionReservation_userId_clientRef_key" ON "SubmissionReservation"("userId", "clientRef");

-- AddForeignKey
ALTER TABLE "SubmissionReservation" ADD CONSTRAINT "SubmissionReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
