-- A referrer can refer a person once (21 Oct 2026): one row per
-- (referrer, referee inbox), kept when the referee deletes their account.

-- AlterTable
ALTER TABLE "referrals" ADD COLUMN "refereeEmailHash" TEXT;

-- Backfill from the referee's normalised address (lower-cased email when that was never set).
UPDATE "referrals" r
SET "refereeEmailHash" = encode(sha256(convert_to(COALESCE(u."normalizedEmail", lower(trim(u."email"))), 'UTF8')), 'hex')
FROM "users" u
WHERE u."id" = r."refereeId";

ALTER TABLE "referrals" ALTER COLUMN "refereeEmailHash" SET NOT NULL;

-- AlterTable
ALTER TABLE "referrals" ALTER COLUMN "refereeId" DROP NOT NULL;

-- DropForeignKey / AddForeignKey: keep the row when the referee is deleted
ALTER TABLE "referrals" DROP CONSTRAINT "referrals_refereeId_fkey";
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referrerId_refereeEmailHash_key" ON "referrals"("referrerId", "refereeEmailHash");
