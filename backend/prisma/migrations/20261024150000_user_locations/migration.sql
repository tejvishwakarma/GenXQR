-- Where each account signed up and last signed in from (admin panel, 24 Oct 2026).
-- Columns only: existing accounts are filled by fillMissingUserLocations in the
-- expiry worker, which needs the GeoLite database and skips Cloudflare addresses —
-- every IP recorded before the trust-proxy fix was a Cloudflare edge, not the user.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "lastLoginCity" TEXT,
ADD COLUMN     "lastLoginCountry" TEXT,
ADD COLUMN     "lastLoginCountryCode" TEXT,
ADD COLUMN     "lastLoginIp" TEXT,
ADD COLUMN     "lastLoginRegion" TEXT,
ADD COLUMN     "signupCity" TEXT,
ADD COLUMN     "signupCountry" TEXT,
ADD COLUMN     "signupCountryCode" TEXT,
ADD COLUMN     "signupIp" TEXT,
ADD COLUMN     "signupRegion" TEXT;
-- CreateIndex
CREATE INDEX "users_signupCountryCode_idx" ON "users"("signupCountryCode");
-- CreateIndex
CREATE INDEX "users_lastLoginCountryCode_idx" ON "users"("lastLoginCountryCode");
