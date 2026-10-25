import type { Prisma } from "@prisma/client"
import { prisma } from "../db/prisma.js"
import { AppError } from "../middleware/error.middleware.js"
import { logger } from "../logger/index.js"
import { getRefund } from "./cashfree.service.js"
import { voidReferralForOrderInTx } from "./referral.service.js"
import { revokeToFreeForRefund } from "./subscription-expiry.service.js"

/**
 * Refunds (decided 25 Oct 2026). A refund done in the Cashfree dashboard arrives
 * as a webhook and is recorded here — re-fetched from Cashfree's API, like a
 * payment — and an admin can also record one by hand. Partial refunds are
 * supported: Invoice.refundedAmount is the running total, and every revenue
 * figure is `amount - refundedAmount`.
 *
 * Fully refunding a referral's qualifying purchase voids both rewards (the same
 * as an admin cancelling the referral). Access is only pulled when an admin
 * records a manual refund and asks for it — a Cashfree-dashboard refund just
 * corrects the money, since no one is choosing at that moment.
 */

/** Rupees (Cashfree) → paise, rounded. */
const toPaise = (rupees: number) => Math.round(rupees * 100)

interface ApplyInput {
  invoiceId: string
  amountPaise: number
  reason: string | null
  source: "cashfree" | "manual"
  cashfreeRefundId?: string | null
  createdByAdminId?: string | null
}

/**
 * The transactional core shared by both paths. Caps the refund so the running
 * total never exceeds what was paid, bumps refundedAmount/refundedAt, and voids
 * the referral if this makes the invoice fully refunded. Returns the recorded
 * refund paise (after capping), or null if it was a no-op (duplicate webhook).
 */
async function applyRefund(input: ApplyInput): Promise<number | null> {
  return prisma.$transaction(async (tx) => {
    // Idempotency: a Cashfree refund id is recorded at most once (the webhook
    // can fire repeatedly). createMany + skipDuplicates races cleanly.
    if (input.cashfreeRefundId) {
      const existing = await tx.refund.findUnique({ where: { cashfreeRefundId: input.cashfreeRefundId }, select: { id: true } })
      if (existing) return null
    }

    const invoice = await tx.invoice.findUnique({
      where: { id: input.invoiceId },
      select: { id: true, amount: true, refundedAmount: true, cashfreeOrderId: true },
    })
    if (!invoice) throw new AppError(404, "Invoice not found")

    const remaining = invoice.amount - invoice.refundedAmount
    if (remaining <= 0) {
      logger.info("Refund ignored — invoice already fully refunded", { invoiceId: invoice.id })
      return null
    }
    const applied = Math.min(input.amountPaise, remaining)
    if (applied <= 0) throw new AppError(422, "Refund amount must be greater than zero.")

    try {
      await tx.refund.create({
        data: {
          invoiceId: invoice.id,
          cashfreeRefundId: input.cashfreeRefundId ?? null,
          amountPaise: applied,
          reason: input.reason,
          source: input.source,
          createdByAdminId: input.createdByAdminId ?? null,
        },
      })
    } catch (err) {
      // Lost the unique-id race to a concurrent webhook delivery — already recorded.
      if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") return null
      throw err
    }

    const now = new Date()
    const newRefunded = invoice.refundedAmount + applied
    await tx.invoice.update({ where: { id: invoice.id }, data: { refundedAmount: newRefunded, refundedAt: now } })

    // Fully refunded + was a referral's qualifying purchase → void both rewards.
    if (newRefunded >= invoice.amount && invoice.cashfreeOrderId) {
      await voidReferralForOrderInTx(tx as unknown as Prisma.TransactionClient, invoice.cashfreeOrderId, "qualifying purchase refunded")
    }
    return applied
  })
}

/**
 * Webhook path: a refund Cashfree reported. The payload is only a hint — the
 * refund is re-fetched and must read SUCCESS before anything is recorded.
 * Access is never touched here. Idempotent.
 */
export async function recordCashfreeRefund(orderId: string, refundId: string): Promise<{ recorded: boolean; reason?: string }> {
  const refund = await getRefund(orderId, refundId)
  if (refund.refund_status !== "SUCCESS") {
    logger.info("Cashfree refund not yet SUCCESS — not recording", { orderId, refundId, status: refund.refund_status })
    return { recorded: false, reason: `refund_${refund.refund_status.toLowerCase()}` }
  }
  const invoice = await prisma.invoice.findUnique({ where: { cashfreeOrderId: orderId }, select: { id: true } })
  if (!invoice) {
    logger.warn("Cashfree refund for an unknown order — ignored", { orderId, refundId })
    return { recorded: false, reason: "unknown_order" }
  }
  const applied = await applyRefund({
    invoiceId: invoice.id,
    amountPaise: toPaise(refund.refund_amount),
    reason: "Refunded in Cashfree",
    source: "cashfree",
    cashfreeRefundId: String(refund.cf_refund_id),
  })
  logger.info("Cashfree refund recorded", { orderId, refundId, appliedPaise: applied })
  return { recorded: applied !== null }
}

/**
 * Manual path: an admin records a refund (done in Cashfree, or a correction),
 * optionally also pulling the customer's access. SUPER_ADMIN only is enforced
 * by the route.
 */
export async function recordManualRefund(input: {
  invoiceId: string
  amountPaise: number
  reason: string
  adminId: string
  revokeAccess: boolean
}): Promise<void> {
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
    throw new AppError(422, "Refund amount must be a positive number of paise.")
  }
  const applied = await applyRefund({
    invoiceId: input.invoiceId,
    amountPaise: input.amountPaise,
    reason: input.reason,
    source: "manual",
    createdByAdminId: input.adminId,
  })
  if (applied === null) throw new AppError(409, "This invoice is already fully refunded.")

  if (input.revokeAccess) {
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: input.invoiceId }, select: { userId: true } })
    await revokeToFreeForRefund(invoice.userId)
  }
  logger.info("Manual refund recorded", { invoiceId: input.invoiceId, adminId: input.adminId, appliedPaise: applied, revokeAccess: input.revokeAccess })
}
