-- Coupon system: super-admin-issued discount codes redeemed at checkout.
--
-- Discounts apply to the FIRST payment of a subscription; renewals are separate
-- Cashfree orders created without a coupon.
--
-- coupon_redemptions.cashfreeOrderId is UNIQUE and load-bearing: it is what stops
-- a replayed webhook, or the browser-return verification racing it, from recording
-- the same redemption twice or double-counting it against the coupon's limit.

-- CreateEnum
CREATE TYPE "CouponDiscountType" AS ENUM ('PERCENTAGE', 'FIXED');
-- CreateTable
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "discountType" "CouponDiscountType" NOT NULL,
    "discountValue" INTEGER NOT NULL,
    "maxDiscountPaise" INTEGER,
    "minOrderPaise" INTEGER,
    "applicablePlans" "PlanName"[],
    "applicableCycles" TEXT[],
    "maxRedemptions" INTEGER,
    "maxRedemptionsPerUser" INTEGER NOT NULL DEFAULT 1,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "coupon_redemptions" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cashfreeOrderId" TEXT NOT NULL,
    "originalPaise" INTEGER NOT NULL,
    "discountPaise" INTEGER NOT NULL,
    "finalPaise" INTEGER NOT NULL,
    "planName" "PlanName" NOT NULL,
    "billingCycle" TEXT NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");
-- CreateIndex
CREATE INDEX "coupons_code_idx" ON "coupons"("code");
-- CreateIndex
CREATE INDEX "coupons_isActive_validUntil_idx" ON "coupons"("isActive", "validUntil");
-- CreateIndex
CREATE UNIQUE INDEX "coupon_redemptions_cashfreeOrderId_key" ON "coupon_redemptions"("cashfreeOrderId");
-- CreateIndex
CREATE INDEX "coupon_redemptions_couponId_idx" ON "coupon_redemptions"("couponId");
-- CreateIndex
CREATE INDEX "coupon_redemptions_userId_idx" ON "coupon_redemptions"("userId");
-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
