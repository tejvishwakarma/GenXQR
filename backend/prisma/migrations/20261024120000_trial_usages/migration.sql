-- Free trials remembered per inbox, beyond account deletion (security audit, 23 Oct 2026).

-- CreateTable
CREATE TABLE "trial_usages" (
    "emailHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trial_usages_pkey" PRIMARY KEY ("emailHash")
);

-- Backfill: every inbox whose account has (or had) a subscription has used its
-- trial, matching isEligibleForTrial's existing rule. Same hash as
-- utils/inbox-hash.util.ts (normalizedEmail, else the lower-cased address).
INSERT INTO "trial_usages" ("emailHash")
SELECT DISTINCT encode(sha256(convert_to(COALESCE(u."normalizedEmail", lower(trim(u."email"))), 'UTF8')), 'hex')
FROM "users" u
JOIN "subscriptions" s ON s."userId" = u."id"
ON CONFLICT DO NOTHING;
