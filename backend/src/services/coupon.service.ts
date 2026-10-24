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

import type { PlanName, Coupon, Prisma } from "@prisma/client"
import { prisma } from "../db/prisma.js"
import { inboxHash } from "../utils/inbox-hash.util.js"
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
  /** What the customer actually pays, in paise. 0 = the coupon makes it free. */
  finalPaise: number
  /** True when nothing is left to pay: the plan is granted without a payment. */
  isFree: boolean
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
 * The smallest amount sent to Cashfree, which does not take orders for nothing.
 *
 * A coupon that leaves less than this to pay makes the purchase FREE: no payment
 * order is created and the plan is granted directly (billing.service
 * grantFreePeriodWithCoupon). Until 21 Oct 2026 such coupons were refused, and
 * a 100%-off code could only be honoured by an admin changing the plan by hand.
 * Rounding a sub-₹1 remainder down to free gives away under a rupee; charging
 * it would mean a payment page for 50 paise.
 */
export const MINIMUM_CHARGEABLE_PAISE = 100 // ₹1

/**
 * The rows that count as THIS customer's uses of a coupon: by account, or by
 * inbox (inboxHash) so deleting and re-creating the account does not reset a
 * "once per customer" code (audit, 24 Oct 2026).
 */
async function customerUseFilter(db: Pick<typeof prisma, "user">, userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } })
  const hash = user ? inboxHash(user.email) : null
  return { userHash: hash, where: hash ? { OR: [{ userId }, { inboxHash: hash }] } : { userId } }
}

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
  /**
   * This user's unpaid orders whose holds a new checkout will release first
   * (billing.service settleOwnOpenHolds). Their held uses are not counted, so a
   * preview matches what that checkout will charge. Never pass this when
   * pricing a real order — only after the holds are actually released.
   */
  ignoreOrderIds?: string[]
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

  const { where: mine } = await customerUseFilter(prisma, params.userId)
  const ignored = params.ignoreOrderIds?.length
    ? await prisma.couponRedemption.count({
        where: { couponId: coupon.id, ...mine, cashfreeOrderId: { in: params.ignoreOrderIds } },
      })
    : 0

  if (coupon.maxRedemptions !== null && coupon.redemptionCount - ignored >= coupon.maxRedemptions) {
    throw new CouponError("This coupon has reached its redemption limit.")
  }

  const usedByThisUser = (await prisma.couponRedemption.count({
    where: { couponId: coupon.id, ...mine },
  })) - ignored
  if (usedByThisUser >= coupon.maxRedemptionsPerUser) {
    throw new CouponError("You have already used this coupon.")
  }

  const originalPaise = PLAN_PRICES_INR[params.planName][params.billingCycle] * 100
  if (coupon.minOrderPaise !== null && originalPaise < coupon.minOrderPaise) {
    throw new CouponError(
      `This coupon needs an order of at least INR ${(coupon.minOrderPaise / 100).toLocaleString("en-IN")}.`,
    )
  }

  let discountPaise = computeDiscountPaise(coupon, originalPaise)
  let finalPaise = originalPaise - discountPaise
  if (finalPaise < MINIMUM_CHARGEABLE_PAISE) {
    // Nothing chargeable is left: the coupon makes this purchase free.
    discountPaise = originalPaise
    finalPaise = 0
  }

  return {
    code,
    couponId: coupon.id,
    originalPaise,
    discountPaise,
    finalPaise,
    isFree: finalPaise === 0,
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
 *
 * `strict` is for redemptions made BEFORE money is taken — a free grant, or the
 * hold placed when a paid order is created (holdCheckout in billing.service):
 * the limits are re-checked inside the transaction, under a per-user lock, and
 * a redemption that would go over either one throws, rolling it back.
 *
 * A paid activation whose order already holds a redemption (the normal case
 * since holds exist) confirms that row instead of counting a second use.
 */
export async function recordRedemption(
  tx: Prisma.TransactionClient,
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
  options: { strict?: boolean } = {},
): Promise<void> {
  if (options.strict) {
    // Serialises one user's redemptions of one coupon, so two checkouts started
    // together cannot both see "not used yet". Released at commit/rollback.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`coupon:${params.couponId}:${params.userId}`}))`
    const coupon = await tx.coupon.findUniqueOrThrow({
      where: { id: params.couponId },
      select: { maxRedemptions: true, maxRedemptionsPerUser: true },
    })
    const { where: mine, userHash } = await customerUseFilter(tx, params.userId)
    const usedByThisUser = await tx.couponRedemption.count({
      where: { couponId: params.couponId, ...mine },
    })
    if (usedByThisUser >= coupon.maxRedemptionsPerUser) {
      throw new CouponError("You have already used this coupon.")
    }
    if (coupon.maxRedemptions !== null) {
      // Conditional increment: only succeeds while a use is left, so two
      // concurrent free redemptions cannot both take the last one.
      const claimed = await tx.coupon.updateMany({
        where: { id: params.couponId, redemptionCount: { lt: coupon.maxRedemptions } },
        data: { redemptionCount: { increment: 1 } },
      })
      if (claimed.count === 0) throw new CouponError("This coupon has reached its redemption limit.")
    } else {
      await tx.coupon.update({ where: { id: params.couponId }, data: { redemptionCount: { increment: 1 } } })
    }
    await tx.couponRedemption.create({
      data: {
        couponId: params.couponId,
        userId: params.userId,
        inboxHash: userHash,
        cashfreeOrderId: params.cashfreeOrderId,
        originalPaise: params.originalPaise,
        discountPaise: params.discountPaise,
        finalPaise: params.finalPaise,
        planName: params.planName,
        billingCycle: params.billingCycle,
      },
    })
    return
  }

  // Held when the order was created: this payment confirms that use. Only the
  // amounts are brought up to date — the use was already counted.
  const held = await tx.couponRedemption.findUnique({
    where: { cashfreeOrderId: params.cashfreeOrderId },
    select: { id: true },
  })
  if (held) {
    await tx.couponRedemption.update({
      where: { id: held.id },
      data: { originalPaise: params.originalPaise, discountPaise: params.discountPaise, finalPaise: params.finalPaise },
    })
    return
  }

  // No hold: an order created before holds existed, or one whose hold was
  // released as stale before the (late) payment arrived. Honour the payment.
  const { userHash } = await customerUseFilter(tx, params.userId)
  await tx.couponRedemption.create({
    data: {
      couponId: params.couponId,
      userId: params.userId,
      inboxHash: userHash,
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

/**
 * Releases the coupon use held for an order that will not be paid: the row goes
 * and the coupon's counter comes back down. No-op if nothing is held.
 */
export async function releaseCouponHold(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  const held = await tx.couponRedemption.findUnique({ where: { cashfreeOrderId: orderId }, select: { id: true, couponId: true } })
  if (!held) return
  await tx.couponRedemption.delete({ where: { id: held.id } })
  await tx.coupon.updateMany({ where: { id: held.couponId, redemptionCount: { gt: 0 } }, data: { redemptionCount: { decrement: 1 } } })
}
