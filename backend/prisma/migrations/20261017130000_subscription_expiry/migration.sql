-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "codesPauseAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "qr_codes" ADD COLUMN     "pausedForBilling" BOOLEAN NOT NULL DEFAULT false;

-- One-time notice period for accounts that had ALREADY lapsed when expiry
-- enforcement shipped. Until now a lapsed plan changed nothing, so these
-- customers have never been warned that their codes would actually pause. They
-- get 7 days from the moment this migration runs (i.e. deploy time); the expiry
-- job emails them a notice and pauses their codes when the date passes.
--
-- Two groups:
--   1. A paid plan or trial whose period has ended but was never downgraded.
--   2. Accounts already on FREE that still have active dynamic codes — trials
--      that ended earlier and were downgraded without their codes pausing.
--      FREE allows zero dynamic codes, so any active one is left over from a
--      trial or a paid period.
UPDATE "subscriptions" AS s
SET "codesPauseAt" = NOW() + INTERVAL '7 days'
FROM "plans" AS p
WHERE p."id" = s."planId"
  AND (
    (
      p."name" <> 'FREE'
      AND s."status" IN ('ACTIVE', 'TRIALING')
      AND COALESCE(CASE WHEN s."status" = 'TRIALING' THEN s."trialEndsAt" END, s."currentPeriodEnd") < NOW()
    )
    OR (
      p."name" = 'FREE'
      AND EXISTS (
        SELECT 1 FROM "qr_codes" AS q
        WHERE q."userId" = s."userId" AND q."category" = 'DYNAMIC' AND q."isActive" = true
      )
    )
  );
