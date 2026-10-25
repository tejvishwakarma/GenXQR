import type { Prisma } from "@prisma/client"
import { prisma } from "../db/prisma.js"
import { AppError } from "../middleware/error.middleware.js"
import { logger } from "../logger/index.js"
import { getOrderRefunds, getRefund, isCashfreeConfigured, type CashfreeRefund } from "./cashfree.service.js"
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
  return recordFromCashfree(orderId, await getRefund(orderId, refundId))
}

/** Records one refund as Cashfree reported it (SUCCESS only; idempotent on its id). */
async function recordFromCashfree(orderId: string, refund: CashfreeRefund): Promise<{ recorded: boolean; reason?: string }> {
  const refundId = refund.refund_id
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

/**
 * How far back the sweep looks. Refunds normally follow within the 7-day refund
 * window; 60 days leaves room for late goodwill refunds and disputes.
 */
export const REFUND_RECONCILE_DAYS = 60
/** Orders asked about per run (every 10 minutes) — one Cashfree call each. */
export const REFUND_RECONCILE_BATCH = 25

/**
 * Reconciliation sweep (expiry worker, every 10 minutes). Cashfree's dashboard
 * offers no refund webhook for this account, so a refund made there is found by
 * asking Cashfree directly: recent paid orders, least-recently-checked first,
 * a batch per run. Recording is idempotent on cf_refund_id, so a refund already
 * recorded (by a webhook or an earlier run) is skipped. One order's failure is
 * logged and does not stop the rest. Access is never touched.
 */
export async function reconcileRefunds(now = new Date()): Promise<{ checked: number; recorded: number }> {
  if (!isCashfreeConfigured()) return { checked: 0, recorded: 0 }
  const since = new Date(now.getTime() - REFUND_RECONCILE_DAYS * 86_400_000)
  const invoices = await prisma.invoice.findMany({
    where: {
      status: "paid",
      amount: { gt: 0 },
      createdAt: { gte: since },
      // Real Cashfree orders only: ours start "genxqr_"; free grants
      // ("genxqr_free_…") have no Cashfree order to ask about.
      AND: [
        { cashfreeOrderId: { startsWith: "genxqr_" } },
        { NOT: { cashfreeOrderId: { startsWith: "genxqr_free_" } } },
      ],
      refundedAmount: { lt: prisma.invoice.fields.amount },
    },
    orderBy: { refundCheckedAt: { sort: "asc", nulls: "first" } },
    take: REFUND_RECONCILE_BATCH,
    select: { id: true, cashfreeOrderId: true },
  })

  let recorded = 0
  for (const inv of invoices) {
    const orderId = inv.cashfreeOrderId!
    try {
      for (const refund of await getOrderRefunds(orderId)) {
        if ((await recordFromCashfree(orderId, refund)).recorded) recorded += 1
      }
    } catch (err) {
      logger.warn("Refund reconciliation failed for an order", { orderId, error: err instanceof Error ? err.message : String(err) })
    }
    // Stamped even on failure so one bad order cannot hold the queue.
    await prisma.invoice.update({ where: { id: inv.id }, data: { refundCheckedAt: now } })
  }
  if (recorded > 0) logger.info("Refund reconciliation recorded refunds", { checked: invoices.length, recorded })
  return { checked: invoices.length, recorded }
}
