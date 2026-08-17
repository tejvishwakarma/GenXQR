/**
 * Admin management of discount coupons.
 *
 * The admin decides the code and what it is worth; everything a customer can do
 * with it is priced by coupon.service from these records. Nothing here trusts a
 * customer, but it does validate the ADMIN's input carefully — a mistyped
 * percentage or a missing cap is how a promotion becomes an accidental giveaway.
 */

import type { CouponDiscountType, PlanName, Prisma } from "@prisma/client"
import { prisma } from "../db/prisma.js"
import { AppError } from "../middleware/error.middleware.js"
import { normaliseCouponCode, computeDiscountPaise } from "./coupon.service.js"
import { PLAN_PRICES_INR } from "./billing.service.js"

export interface CouponInput {
  code: string
  description?: string | null
  discountType: CouponDiscountType
  discountValue: number
  maxDiscountPaise?: number | null
  minOrderPaise?: number | null
  applicablePlans?: PlanName[]
  applicableCycles?: string[]
  maxRedemptions?: number | null
  maxRedemptionsPerUser?: number
  validFrom?: Date | null
  validUntil?: Date | null
  isActive?: boolean
}

const CYCLES = ["monthly", "yearly"] as const

/**
 * Rejects input that is internally inconsistent, rather than storing a coupon
 * that behaves surprisingly at checkout.
 */
function assertValid(input: CouponInput): void {
  if (input.discountType === "PERCENTAGE") {
    if (!Number.isInteger(input.discountValue) || input.discountValue < 1 || input.discountValue > 100) {
      throw new AppError(422, "A percentage discount must be a whole number between 1 and 100.")
    }
  } else {
    if (!Number.isInteger(input.discountValue) || input.discountValue < 1) {
      throw new AppError(422, "A fixed discount must be a positive amount in paise.")
    }
  }

  if (input.maxDiscountPaise != null && input.maxDiscountPaise < 1) {
    throw new AppError(422, "The maximum discount must be a positive amount in paise.")
  }
  if (input.minOrderPaise != null && input.minOrderPaise < 0) {
    throw new AppError(422, "The minimum order value cannot be negative.")
  }
  if (input.maxRedemptions != null && input.maxRedemptions < 1) {
    throw new AppError(422, "The redemption limit must be at least 1.")
  }
  if (input.maxRedemptionsPerUser != null && input.maxRedemptionsPerUser < 1) {
    throw new AppError(422, "The per-user limit must be at least 1.")
  }
  if (input.validFrom && input.validUntil && input.validFrom >= input.validUntil) {
    throw new AppError(422, "The start date must be before the end date.")
  }
  for (const cycle of input.applicableCycles ?? []) {
    if (!(CYCLES as readonly string[]).includes(cycle)) {
      throw new AppError(422, `Unknown billing cycle "${cycle}".`)
    }
  }

  // A fixed discount at or above every plan it can apply to would always be
  // clamped to a free order, which the checkout then refuses — better to say so
  // now than to let the admin discover it from a customer complaint.
  if (input.discountType === "FIXED") {
    const plans = (input.applicablePlans?.length ? input.applicablePlans : (["STARTER", "PRO", "BUSINESS"] as PlanName[]))
    const cycles = (input.applicableCycles?.length ? input.applicableCycles : [...CYCLES])
    const cheapestPaise = Math.min(
      ...plans.flatMap((p) =>
        cycles.map((c) => PLAN_PRICES_INR[p][c as "monthly" | "yearly"] * 100),
      ),
    )
    if (input.discountValue >= cheapestPaise) {
      throw new AppError(
        422,
        `A fixed discount of INR ${(input.discountValue / 100).toLocaleString("en-IN")} is not less than the ` +
          `cheapest applicable plan (INR ${(cheapestPaise / 100).toLocaleString("en-IN")}). Lower it, or restrict the plans.`,
      )
    }
  }
}

/** Shape returned to the admin UI, with a worked example of what the code does. */
function decorate<T extends { discountType: CouponDiscountType; discountValue: number; maxDiscountPaise: number | null }>(
  coupon: T,
) {
  // Concrete beats abstract: show what this coupon takes off the PRO monthly
  // plan, so "20%" and "₹200 off" can be compared at a glance.
  const referencePaise = PLAN_PRICES_INR["PRO"].monthly * 100
  return {
    ...coupon,
    examplePaiseOffProMonthly: computeDiscountPaise(coupon, referencePaise),
  }
}

export async function listCoupons(params: { includeInactive?: boolean } = {}) {
  const where: Prisma.CouponWhereInput = params.includeInactive ? {} : { isActive: true }
  const coupons = await prisma.coupon.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { redemptions: true } } },
  })
  return coupons.map(decorate)
}

export async function getCoupon(id: string) {
  const coupon = await prisma.coupon.findUnique({
    where: { id },
    include: {
      _count: { select: { redemptions: true } },
      redemptions: {
        orderBy: { redeemedAt: "desc" },
        take: 50,
        select: {
          id: true, discountPaise: true, finalPaise: true, planName: true,
          billingCycle: true, redeemedAt: true,
          user: { select: { id: true, email: true, name: true } },
        },
      },
    },
  })
  if (!coupon) throw new AppError(404, "Coupon not found")
  return decorate(coupon)
}

export async function createCoupon(input: CouponInput, createdById: string) {
  assertValid(input)
  const code = normaliseCouponCode(input.code)
  if (!code) throw new AppError(422, "A coupon code is required.")

  const existing = await prisma.coupon.findUnique({ where: { code } })
  if (existing) throw new AppError(409, `The code "${code}" already exists.`)

  return prisma.coupon.create({
    data: {
      code,
      description: input.description ?? null,
      discountType: input.discountType,
      discountValue: input.discountValue,
      maxDiscountPaise: input.maxDiscountPaise ?? null,
      minOrderPaise: input.minOrderPaise ?? null,
      applicablePlans: input.applicablePlans ?? [],
      applicableCycles: input.applicableCycles ?? [],
      maxRedemptions: input.maxRedemptions ?? null,
      maxRedemptionsPerUser: input.maxRedemptionsPerUser ?? 1,
      validFrom: input.validFrom ?? null,
      validUntil: input.validUntil ?? null,
      isActive: input.isActive ?? true,
      createdById,
    },
  })
}

export async function updateCoupon(id: string, input: CouponInput) {
  assertValid(input)
  const existing = await prisma.coupon.findUnique({ where: { id } })
  if (!existing) throw new AppError(404, "Coupon not found")

  const code = normaliseCouponCode(input.code)
  if (code !== existing.code) {
    const clash = await prisma.coupon.findUnique({ where: { code } })
    if (clash) throw new AppError(409, `The code "${code}" already exists.`)
  }

  return prisma.coupon.update({
    where: { id },
    data: {
      code,
      description: input.description ?? null,
      discountType: input.discountType,
      discountValue: input.discountValue,
      maxDiscountPaise: input.maxDiscountPaise ?? null,
      minOrderPaise: input.minOrderPaise ?? null,
      applicablePlans: input.applicablePlans ?? [],
      applicableCycles: input.applicableCycles ?? [],
      maxRedemptions: input.maxRedemptions ?? null,
      maxRedemptionsPerUser: input.maxRedemptionsPerUser ?? 1,
      validFrom: input.validFrom ?? null,
      validUntil: input.validUntil ?? null,
      isActive: input.isActive ?? existing.isActive,
      // redemptionCount is deliberately not settable — it is derived from actual
      // payments, and letting an admin edit it would let a spent coupon be reused.
    },
  })
}

/**
 * Deactivates a coupon, or deletes it outright if it was never used.
 *
 * A redeemed coupon is never hard-deleted: its redemptions are the audit trail
 * for money that was discounted, and the cascade would erase them.
 */
export async function deleteCoupon(id: string): Promise<{ deleted: boolean }> {
  const coupon = await prisma.coupon.findUnique({
    where: { id },
    include: { _count: { select: { redemptions: true } } },
  })
  if (!coupon) throw new AppError(404, "Coupon not found")

  if (coupon._count.redemptions > 0) {
    await prisma.coupon.update({ where: { id }, data: { isActive: false } })
    return { deleted: false }
  }

  await prisma.coupon.delete({ where: { id } })
  return { deleted: true }
}
