-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "lapsedAt" TIMESTAMP(3);

-- Accounts already on FREE when retention shipped: their 3 months start now
-- (deploy time), not from whenever their plan actually ended — nobody was told
-- history would be deleted, so nobody loses it without the full 3 months.
UPDATE "subscriptions" AS s
SET "lapsedAt" = NOW()
FROM "plans" AS p
WHERE p."id" = s."planId" AND p."name" = 'FREE';
