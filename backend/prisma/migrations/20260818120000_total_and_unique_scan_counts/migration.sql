-- Split scan counting into total and unique.
--
-- Until now the scan pipeline dropped any repeat scan from the same device+IP
-- inside a 4-hour window, so only unique scans were ever recorded. Every scan is
-- stored from now on, with isUnique marking the first from a device in the window.
--
-- Backfill is exact rather than approximate: every existing row was, by
-- definition, a unique scan, so the historical unique totals equal the existing
-- totals and isUnique defaults to true for rows already stored.

ALTER TABLE "qr_scans"      ADD COLUMN "isUnique"        BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "qr_codes"      ADD COLUMN "uniqueScanCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "qr_scan_daily" ADD COLUMN "uniqueCount"     INTEGER NOT NULL DEFAULT 0;

UPDATE "qr_codes"      SET "uniqueScanCount" = "scanCount";
UPDATE "qr_scan_daily" SET "uniqueCount"     = "count";
