/**
 * Coupon pricing and validation.
 *
 * The one rule that matters: the DISCOUNT IS COMPUTED HERE, SERVER-SIDE, from the
 * coupon record and the plan price table. The client sends a code and nothing
 * else — never an amount, never a discount, never a final total. A tampered
 * request can change which code is claimed, but the code either exists and
 * applies or it does not, and what it is worth is decided here.
 *
 * The second rule: a coupon is only truly consumed inside the same database
 * transaction that activates the subscription, keyed on the Cashfree order id.
 * Validating a code does not reserve it — see the note on races below.
 */

import type { PlanName, Coupon } from "@prisma/client"
import { prisma } from "../db/prisma.js"
import { AppError } from "../middleware/error.middleware.js"
import { logger } from "../logger/index.js"
import { PLAN_PRICES_INR } from "./billing.service.js"

/** Codes are matched case-insensitively by storing and comparing uppercase. */
export function normaliseCouponCode(code: string): string {
  return code.trim().toUpperCase()
}

export interface CouponQuote {
  code: string
  couponId: string
  /** List price of the plan, in paise. */
  originalPaise: number
  /** How much comes off, in paise. Never exceeds originalPaise. */
  discountPaise: number
  /** What the customer actually pays, in paise. */
  finalPaise: number
}

// Coupon.description is deliberately NOT part of this quote. It is an internal
// note for the admin listing — real ones read "Diwali campaign" or "Testing" —
// and it was briefly rendered to customers as "SAVE99 applied — Testing". The
// code and the discount are all a customer needs.

/** Why a code was refused. The message is safe to show a customer. */
export class CouponError extends AppError {
  constructor(message: string) {
    // 422 matches how every other validation failure is reported.
    super(422, message)
  }
}

/**
 * Cashfree will not accept an order for nothing, and a 100%-off subscription
 * should be granted by an admin plan change rather than a zero-value payment.
 * Anything that would fall below this is clamped and reported.
 */
export const MINIMUM_CHARGEABLE_PAISE = 100 // ₹1

/**
 * Prices a plan with a coupon applied, or throws a CouponError explaining why the
 * code cannot be used.
 *
 * Pure pricing plus eligibility — it records nothing. Callers use it both to
 * preview a discount in the UI and to price the real order, so the number the
 * customer is shown and the number they are charged come from one place.
 */
export async function quoteCoupon(params: {
  code: string
  userId: string
  planName: PlanName
  billingCycle: "monthly" | "yearly"
}): Promise<CouponQuote> {
  const code = normaliseCouponCode(params.code)
  if (!code) throw new CouponError("Enter a coupon code.")

  const coupon = await prisma.coupon.findUnique({ where: { code } })

  // Deliberately the same message for "no such code" and "not active": telling a
  // stranger which codes exist invites enumeration.
  if (!coupon || !coupon.isActive) throw new CouponError("That coupon code is not valid.")

  const now = new Date()
  if (coupon.validFrom && coupon.validFrom > now) throw new CouponError("This coupon is not active yet.")
  if (coupon.validUntil && coupon.validUntil < now) throw new CouponError("This coupon has expired.")

  if (coupon.applicablePlans.length > 0 && !coupon.applicablePlans.includes(params.planName)) {
    throw new CouponError("This coupon does not apply to the selected plan.")
  }
  if (coupon.applicableCycles.length > 0 && !coupon.applicableCycles.includes(params.billingCycle)) {
    throw new CouponError(`This coupon only applies to ${coupon.applicableCycles.join(" or ")} billing.`)
  }

  if (coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions) {
    throw new CouponError("This coupon has reached its redemption limit.")
  }

  const usedByThisUser = await prisma.couponRedemption.count({
    where: { couponId: coupon.id, userId: params.userId },
  })
  if (usedByThisUser >= coupon.maxRedemptionsPerUser) {
    throw new CouponError("You have already used this coupon.")
  }

  const originalPaise = PLAN_PRICES_INR[params.planName][params.billingCycle] * 100
  if (coupon.minOrderPaise !== null && originalPaise < coupon.minOrderPaise) {
    throw new CouponError(
      `This coupon needs an order of at least INR ${(coupon.minOrderPaise / 100).toLocaleString("en-IN")}.`,
    )
  }

  const discountPaise = computeDiscountPaise(coupon, originalPaise)
  const finalPaise = originalPaise - discountPaise

  if (finalPaise < MINIMUM_CHARGEABLE_PAISE) {
    // Rather than silently charging ₹1 more than the coupon promises.
    throw new CouponError("This coupon cannot be applied to this plan. Please contact support.")
  }

  return {
    code,
    couponId: coupon.id,
    originalPaise,
    discountPaise,
    finalPaise,
  }
}

/**
 * The discount in paise, floored to a whole paisa and never more than the order.
 *
 * Percentages are computed with integer arithmetic — a float percentage of a
 * float rupee amount is how you end up charging 798.9999999 and having the
 * gateway reject the order for an amount mismatch.
 */
export function computeDiscountPaise(
  coupon: Pick<Coupon, "discountType" | "discountValue" | "maxDiscountPaise">,
  originalPaise: number,
): number {
  let discount: number

  if (coupon.discountType === "PERCENTAGE") {
    const pct = Math.max(0, Math.min(100, coupon.discountValue))
    discount = Math.floor((originalPaise * pct) / 100)
    if (coupon.maxDiscountPaise !== null && discount > coupon.maxDiscountPaise) {
      discount = coupon.maxDiscountPaise
    }
  } else {
    discount = Math.max(0, coupon.discountValue)
  }

  // A discount larger than the order would produce a negative charge.
  return Math.min(discount, originalPaise)
}

/**
 * Records a redemption inside an existing transaction, and bumps the coupon's
 * counter.
 *
 * Must be called with the SAME transaction client that writes the invoice, so a
 * redemption cannot exist without the payment that earned it, and vice versa.
 *
 * On the race: two people can both pass validation for the last remaining use of
 * a coupon, and both can then pay. Rather than reject a payment that has already
 * been taken — leaving the customer charged and unsubscribed — the redemption is
 * recorded and the overage logged for an admin to see. Slightly overshooting a
 * marketing limit is a far better failure than a charged customer with no plan.
 */
export async function recordRedemption(
  tx: Pick<typeof prisma, "coupon" | "couponRedemption">,
  params: {
    couponId: string
    userId: string
    cashfreeOrderId: string
    originalPaise: number
    discountPaise: number
    finalPaise: number
    planName: PlanName
    billingCycle: string
  },
): Promise<void> {
  await tx.couponRedemption.create({
    data: {
      couponId: params.couponId,
      userId: params.userId,
      cashfreeOrderId: params.cashfreeOrderId,
      originalPaise: params.originalPaise,
      discountPaise: params.discountPaise,
      finalPaise: params.finalPaise,
      planName: params.planName,
      billingCycle: params.billingCycle,
    },
  })

  // Atomic increment — a read-modify-write here would lose counts under
  // concurrency, which is exactly when the limit matters.
  const updated = await tx.coupon.update({
    where: { id: params.couponId },
    data: { redemptionCount: { increment: 1 } },
    select: { code: true, redemptionCount: true, maxRedemptions: true },
  })

  if (updated.maxRedemptions !== null && updated.redemptionCount > updated.maxRedemptions) {
    logger.warn("Coupon redeemed beyond its limit (concurrent checkouts) — payment honoured", {
      code: updated.code,
      redemptionCount: updated.redemptionCount,
      maxRedemptions: updated.maxRedemptions,
    })
  }
}
