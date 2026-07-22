-- CreateEnum
CREATE TYPE "PlanName" AS ENUM ('FREE', 'STARTER', 'PRO', 'BUSINESS', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'PAST_DUE', 'TRIALING', 'PAUSED');

-- CreateEnum
CREATE TYPE "QRType" AS ENUM ('URL', 'PDF', 'VIDEO', 'LINKS', 'SOCIAL_MEDIA', 'VCARD', 'IMAGE_GALLERY', 'BUSINESS', 'APP', 'MP3', 'MENU', 'WIFI', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'COUPON');

-- CreateEnum
CREATE TYPE "QRCategory" AS ENUM ('STATIC', 'DYNAMIC');

-- CreateEnum
CREATE TYPE "FileType" AS ENUM ('PDF', 'MP3', 'VIDEO', 'IMAGE');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('MOBILE', 'TABLET', 'DESKTOP', 'UNKNOWN');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "passwordHash" TEXT,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "googleId" TEXT,
    "driveConnected" BOOLEAN NOT NULL DEFAULT false,
    "driveFolderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "name" "PlanName" NOT NULL,
    "displayName" TEXT NOT NULL,
    "priceMonthlyINR" INTEGER NOT NULL,
    "priceYearlyINR" INTEGER NOT NULL,
    "priceMonthlyUSD" INTEGER NOT NULL,
    "priceYearlyUSD" INTEGER NOT NULL,
    "dynamicQRLimit" INTEGER NOT NULL,
    "scanLimit" INTEGER NOT NULL,
    "fileStorageGB" INTEGER NOT NULL,
    "teamSeatsLimit" INTEGER NOT NULL,
    "apiCallsLimit" INTEGER NOT NULL,
    "features" JSONB NOT NULL,
    "razorpayPlanId" TEXT,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "razorpaySubId" TEXT,
    "razorpayCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" "QRType" NOT NULL,
    "category" "QRCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "tags" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "scanCount" INTEGER NOT NULL DEFAULT 0,
    "isPasswordProtected" BOOLEAN NOT NULL DEFAULT false,
    "passwordHash" TEXT,
    "activeFrom" TIMESTAMP(3),
    "activeUntil" TIMESTAMP(3),
    "scanLimit" INTEGER,
    "fallbackUrl" TEXT,
    "abTestEnabled" BOOLEAN NOT NULL DEFAULT false,
    "abTestSplitPct" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastScannedAt" TIMESTAMP(3),

    CONSTRAINT "qr_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_content" (
    "id" TEXT NOT NULL,
    "qrId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qr_content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_design" (
    "id" TEXT NOT NULL,
    "qrId" TEXT NOT NULL,
    "primaryColor" TEXT NOT NULL DEFAULT '#000000',
    "secondaryColor" TEXT NOT NULL DEFAULT '#ffffff',
    "backgroundColor" TEXT NOT NULL DEFAULT '#ffffff',
    "foregroundColor" TEXT NOT NULL DEFAULT '#000000',
    "dotStyle" TEXT NOT NULL DEFAULT 'square',
    "cornerSquareStyle" TEXT NOT NULL DEFAULT 'square',
    "cornerDotStyle" TEXT NOT NULL DEFAULT 'square',
    "gradientEnabled" BOOLEAN NOT NULL DEFAULT false,
    "gradientType" TEXT,
    "gradientColor1" TEXT,
    "gradientColor2" TEXT,
    "logoUrl" TEXT,
    "logoSize" INTEGER NOT NULL DEFAULT 40,
    "logoMargin" INTEGER NOT NULL DEFAULT 5,
    "hideBackgroundDots" BOOLEAN NOT NULL DEFAULT true,
    "frameStyle" TEXT,
    "frameText" TEXT,
    "frameColor" TEXT,
    "paletteId" TEXT,
    "fontTitle" TEXT NOT NULL DEFAULT 'Inter',
    "fontBody" TEXT NOT NULL DEFAULT 'Inter',
    "welcomeScreenUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qr_design_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_files" (
    "id" TEXT NOT NULL,
    "qrId" TEXT NOT NULL,
    "fileType" "FileType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "thumbnailUrl" TEXT,
    "driveFileId" TEXT,
    "driveBackedUp" BOOLEAN NOT NULL DEFAULT false,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qr_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_scans" (
    "id" TEXT NOT NULL,
    "qrId" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT NOT NULL,
    "country" TEXT,
    "countryCode" TEXT,
    "city" TEXT,
    "region" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "deviceType" "DeviceType" NOT NULL DEFAULT 'UNKNOWN',
    "os" TEXT,
    "browser" TEXT,
    "userAgent" TEXT,
    "referrer" TEXT,
    "abVariantId" TEXT,

    CONSTRAINT "qr_scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_scan_daily" (
    "id" TEXT NOT NULL,
    "qrId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "qr_scan_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smart_routing_rules" (
    "id" TEXT NOT NULL,
    "qrId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "conditionType" TEXT NOT NULL,
    "conditionValue" JSONB NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smart_routing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ab_test_variants" (
    "id" TEXT NOT NULL,
    "qrId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "splitPct" INTEGER NOT NULL,
    "scanCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ab_test_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "callCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityId" TEXT,
    "entityType" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "plans_name_key" ON "plans"("name");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_userId_key" ON "subscriptions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_razorpaySubId_key" ON "subscriptions"("razorpaySubId");

-- CreateIndex
CREATE UNIQUE INDEX "qr_codes_slug_key" ON "qr_codes"("slug");

-- CreateIndex
CREATE INDEX "qr_codes_userId_idx" ON "qr_codes"("userId");

-- CreateIndex
CREATE INDEX "qr_codes_slug_idx" ON "qr_codes"("slug");

-- CreateIndex
CREATE INDEX "qr_codes_type_idx" ON "qr_codes"("type");

-- CreateIndex
CREATE INDEX "qr_codes_createdAt_idx" ON "qr_codes"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "qr_content_qrId_key" ON "qr_content"("qrId");

-- CreateIndex
CREATE UNIQUE INDEX "qr_design_qrId_key" ON "qr_design"("qrId");

-- CreateIndex
CREATE INDEX "qr_scans_qrId_scannedAt_idx" ON "qr_scans"("qrId", "scannedAt");

-- CreateIndex
CREATE INDEX "qr_scans_qrId_country_idx" ON "qr_scans"("qrId", "country");

-- CreateIndex
CREATE INDEX "qr_scans_scannedAt_idx" ON "qr_scans"("scannedAt");

-- CreateIndex
CREATE INDEX "qr_scan_daily_qrId_date_idx" ON "qr_scan_daily"("qrId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "qr_scan_daily_qrId_date_key" ON "qr_scan_daily"("qrId", "date");

-- CreateIndex
CREATE INDEX "smart_routing_rules_qrId_priority_idx" ON "smart_routing_rules"("qrId", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_userId_idx" ON "api_keys"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_tokenHash_key" ON "email_verification_tokens"("tokenHash");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_content" ADD CONSTRAINT "qr_content_qrId_fkey" FOREIGN KEY ("qrId") REFERENCES "qr_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_design" ADD CONSTRAINT "qr_design_qrId_fkey" FOREIGN KEY ("qrId") REFERENCES "qr_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_files" ADD CONSTRAINT "qr_files_qrId_fkey" FOREIGN KEY ("qrId") REFERENCES "qr_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_scans" ADD CONSTRAINT "qr_scans_qrId_fkey" FOREIGN KEY ("qrId") REFERENCES "qr_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_scan_daily" ADD CONSTRAINT "qr_scan_daily_qrId_fkey" FOREIGN KEY ("qrId") REFERENCES "qr_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_routing_rules" ADD CONSTRAINT "smart_routing_rules_qrId_fkey" FOREIGN KEY ("qrId") REFERENCES "qr_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_test_variants" ADD CONSTRAINT "ab_test_variants_qrId_fkey" FOREIGN KEY ("qrId") REFERENCES "qr_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
