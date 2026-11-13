-- CreateEnum
CREATE TYPE "FieldSource" AS ENUM ('MANUAL', 'RESUME');

-- AlterTable
ALTER TABLE "Education" ADD COLUMN     "confirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gradeScale" TEXT,
ADD COLUMN     "graduationStatus" TEXT,
ADD COLUMN     "source" "FieldSource" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "address" TEXT,
ADD COLUMN     "availabilityDate" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "criminalHistory" TEXT,
ADD COLUMN     "disabilityStatus" TEXT,
ADD COLUMN     "employmentType" TEXT,
ADD COLUMN     "ethnicity" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "maxSalary" INTEGER,
ADD COLUMN     "needsSponsorship" BOOLEAN,
ADD COLUMN     "noticePeriod" TEXT,
ADD COLUMN     "openToRelocation" BOOLEAN,
ADD COLUMN     "portfolio" TEXT,
ADD COLUMN     "preferredName" TEXT,
ADD COLUMN     "salaryCurrency" TEXT,
ADD COLUMN     "salaryPeriod" TEXT,
ADD COLUMN     "targetLocations" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "veteranStatus" TEXT,
ADD COLUMN     "willingToTravel" TEXT,
ADD COLUMN     "workAuthByCountry" JSONB,
ADD COLUMN     "workplaceType" TEXT,
ADD COLUMN     "yearsExperience" INTEGER;

-- AlterTable
ALTER TABLE "SkillItem" ADD COLUMN     "confirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" "FieldSource" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "WorkExperience" ADD COLUMN     "confirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" "FieldSource" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "ProfileFieldMeta" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "source" "FieldSource" NOT NULL DEFAULT 'MANUAL',
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "conflictValue" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileFieldMeta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "technologies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "url" TEXT,
    "outcome" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "source" "FieldSource" NOT NULL DEFAULT 'MANUAL',
    "confirmed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certification" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT,
    "issueDate" TEXT,
    "expiryDate" TEXT,
    "credentialId" TEXT,
    "url" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "source" "FieldSource" NOT NULL DEFAULT 'MANUAL',
    "confirmed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Certification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfileFieldMeta_profileId_idx" ON "ProfileFieldMeta"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileFieldMeta_profileId_field_key" ON "ProfileFieldMeta"("profileId", "field");

-- CreateIndex
CREATE INDEX "Project_profileId_idx" ON "Project"("profileId");

-- CreateIndex
CREATE INDEX "Certification_profileId_idx" ON "Certification"("profileId");

-- AddForeignKey
ALTER TABLE "ProfileFieldMeta" ADD CONSTRAINT "ProfileFieldMeta_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
