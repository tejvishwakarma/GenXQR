-- White-label branding shown to scanners in place of GenXQR's own.
--
-- Both nullable and with no default: an account that has never configured
-- branding is indistinguishable from one that cleared it, and both mean "fall
-- back to GenXQR". Nothing to backfill.
--
-- The columns are writable regardless of plan. Enforcement lives in the read
-- path, so a downgrade from BUSINESS stops the branding being USED rather than
-- destroying what the customer typed — an upgrade later restores it intact.
ALTER TABLE "users" ADD COLUMN "brandName" TEXT;
ALTER TABLE "users" ADD COLUMN "brandLogoUrl" TEXT;
