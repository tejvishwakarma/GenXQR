-- Unlimited monthly scans on Pro and above; fewer codes on Pro (250 → 150) and
-- Business (2,000 → 1,000). Decided 9 Nov 2026.

ALTER TABLE "subscriptions" ADD COLUMN "legacyQRLimit" INTEGER,
                            ADD COLUMN "legacyQRLimitPlan" "PlanName";

-- Everyone on Pro or Business today (paid, trial or admin-granted) keeps the old
-- code limit while they stay on that plan.
UPDATE "subscriptions" s
SET "legacyQRLimit" = CASE p."name" WHEN 'PRO' THEN 250 WHEN 'BUSINESS' THEN 2000 END,
    "legacyQRLimitPlan" = p."name"
FROM "plans" p
WHERE s."planId" = p."id" AND p."name" IN ('PRO', 'BUSINESS');

-- The plans table is what the billing page's plan cards show.
UPDATE "plans" SET "dynamicQRLimit" = 150,  "scanLimit" = 999999999 WHERE "name" = 'PRO';
UPDATE "plans" SET "dynamicQRLimit" = 1000, "scanLimit" = 999999999 WHERE "name" = 'BUSINESS';
UPDATE "plans" SET "scanLimit" = 999999999 WHERE "name" IN ('AGENCY', 'ENTERPRISE');
