-- Coupon "once per customer" survives account deletion (audit, 24 Oct 2026).

-- AlterTable
ALTER TABLE "coupon_redemptions" ADD COLUMN "inboxHash" TEXT;
ALTER TABLE "coupon_redemptions" ALTER COLUMN "userId" DROP NOT NULL;

-- Backfill: same hash as utils/inbox-hash.util.ts (normalizedEmail, else the lower-cased address).
UPDATE "coupon_redemptions" cr
SET "inboxHash" = encode(sha256(convert_to(COALESCE(u."normalizedEmail", lower(trim(u."email"))), 'UTF8')), 'hex')
FROM "users" u
WHERE u."id" = cr."userId";

-- Keep the row when the account is deleted.
ALTER TABLE "coupon_redemptions" DROP CONSTRAINT "coupon_redemptions_userId_fkey";
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "coupon_redemptions_couponId_inboxHash_idx" ON "coupon_redemptions"("couponId", "inboxHash");
