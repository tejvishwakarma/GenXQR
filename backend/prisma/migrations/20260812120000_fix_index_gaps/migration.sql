-- Add missing index on ApiKey.keyPrefix, looked up on every /v1/* request
-- by apikey.middleware.ts via apikeys.service.ts — previously unindexed.
CREATE INDEX "api_keys_keyPrefix_idx" ON "api_keys"("keyPrefix");

-- Drop indexes that duplicate an existing unique constraint's backing index
-- (Postgres already indexes unique columns; a second identical index just
-- adds write overhead with no query benefit).
DROP INDEX "users_email_idx";
DROP INDEX "qr_scan_daily_qrId_date_idx";
