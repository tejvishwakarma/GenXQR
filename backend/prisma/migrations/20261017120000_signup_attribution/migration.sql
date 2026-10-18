-- AlterTable
ALTER TABLE "users" ADD COLUMN     "firstTouchAt" TIMESTAMP(3),
ADD COLUMN     "signupCampaign" TEXT,
ADD COLUMN     "signupContent" TEXT,
ADD COLUMN     "signupLandingPath" TEXT,
ADD COLUMN     "signupMedium" TEXT,
ADD COLUMN     "signupReferrer" TEXT,
ADD COLUMN     "signupSource" TEXT,
ADD COLUMN     "signupTerm" TEXT;

-- CreateIndex
CREATE INDEX "users_createdAt_signupSource_idx" ON "users"("createdAt", "signupSource");

