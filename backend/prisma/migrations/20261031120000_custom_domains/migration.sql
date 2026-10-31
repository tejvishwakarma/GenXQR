-- Custom domains (decided 31 Oct 2026). New table + nullable FK on qr_codes;
-- additive only. See services/custom-domain.service.ts.

-- AlterTable
ALTER TABLE "qr_codes" ADD COLUMN     "customDomainId" TEXT;
-- CreateTable
CREATE TABLE "custom_domains" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "cfHostnameId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sslStatus" TEXT,
    "verificationErrors" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    CONSTRAINT "custom_domains_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "custom_domains_hostname_key" ON "custom_domains"("hostname");
-- CreateIndex
CREATE UNIQUE INDEX "custom_domains_cfHostnameId_key" ON "custom_domains"("cfHostnameId");
-- CreateIndex
CREATE INDEX "custom_domains_userId_idx" ON "custom_domains"("userId");
-- CreateIndex
CREATE INDEX "custom_domains_status_lastCheckedAt_idx" ON "custom_domains"("status", "lastCheckedAt");
-- AddForeignKey
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_customDomainId_fkey" FOREIGN KEY ("customDomainId") REFERENCES "custom_domains"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "custom_domains" ADD CONSTRAINT "custom_domains_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
