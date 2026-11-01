-- The Agency plan's row (decided 1 Nov 2026). Separate from the migration that
-- adds the enum value: Postgres cannot use a new enum value in the transaction
-- that added it. Prices in rupees / dollars like the other rows (seed.mjs).
INSERT INTO "plans" ("id", "name", "displayName", "priceMonthlyINR", "priceYearlyINR", "priceMonthlyUSD", "priceYearlyUSD",
                     "dynamicQRLimit", "scanLimit", "fileStorageGB", "teamSeatsLimit", "apiCallsLimit", "features")
VALUES ('plan_agency', 'AGENCY', 'Agency', 5999, 59988, 72, 720,
        5000, 1000000, 100, 10, 250000,
        '{"customDomains": true, "analytics": "2y", "bulkGeneration": true, "apiAccess": true, "whiteLabel": true, "prioritySupport": true, "agencyClients": 15}'::jsonb)
ON CONFLICT ("name") DO NOTHING;
