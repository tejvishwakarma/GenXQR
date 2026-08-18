import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import { z } from "zod"
import type { PlanName } from "@prisma/client"
import { requireAuth } from "../middleware/auth.middleware.js"
import { apiLimiter } from "../middleware/rateLimit.middleware.js"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { AppError } from "../middleware/error.middleware.js"
import {
  getOrCreateSubscription,
  getUserPlanLimits,
  createPaymentOrder,
  verifyPaymentForUser,
  processCashfreeWebhook,
  cancelSubscription,
  getUserInvoices,
  PLAN_LIMITS,
  PLAN_PRICES_INR,
} from "../services/billing.service.js"
import { verifyWebhookSignature } from "../services/cashfree.service.js"
import { quoteCoupon } from "../services/coupon.service.js"
import { generateInvoicePDF } from "../services/invoice-pdf.service.js"
import { prisma } from "../db/prisma.js"
import { logger } from "../logger/index.js"
import { env } from "../config/env.js"

const router: IRouter = Router()

function uid(req: Request): string {
  return (req.user as AccessTokenPayload).sub
}

/**
 * Shown as the payee on invoices. The registered legal entity must appear on a
 * receipt for a payment-gateway-processed transaction.
 */
const LEGAL_NAME = "Digital chitrakar"
const SUPPORT_EMAIL = "support@genxqr.com"

// ─── GET /api/billing/plans ────────────────────────────────────────────────────

router.get("/plans", async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const plans = await prisma.plan.findMany({ orderBy: { priceMonthlyINR: "asc" } })
    const enriched = plans.map((p: any) => ({
      ...p,
      limits: PLAN_LIMITS[p.name as PlanName] ?? null,
    }))
    res.json({ success: true, data: enriched })
  } catch (err) {
    next(err)
  }
})

// ─── GET /api/billing/subscription ────────────────────────────────────────────

router.get(
  "/subscription",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const info = await getUserPlanLimits(uid(req))
      const sub = await getOrCreateSubscription(uid(req))
      res.json({
        success: true,
        data: {
          ...info,
          subscription: {
            id: sub.id,
            status: sub.status,
            planId: sub.planId,
            planName: sub.plan.name,
            planDisplayName: sub.plan.displayName,
            trialEndsAt: sub.trialEndsAt,
            currentPeriodStart: sub.currentPeriodStart,
            currentPeriodEnd: sub.currentPeriodEnd,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          },
        },
      })
    } catch (err) {
      next(err)
    }
  },
)

// ─── POST /api/billing/create-order ───────────────────────────────────────────

const CreateOrderSchema = z.object({
  planName:     z.enum(["STARTER", "PRO", "BUSINESS", "ENTERPRISE"]),
  billingCycle: z.enum(["monthly", "yearly"]),
  phone:        z.string().regex(/^\d{10}$/).optional(),
  // Only the CODE is accepted. Any amount or discount in the body is ignored —
  // what a coupon is worth is decided server-side.
  couponCode:   z.string().trim().min(1).max(40).optional(),
})

router.post(
  "/create-order",
  requireAuth,
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = CreateOrderSchema.parse(req.body)
      const result = await createPaymentOrder(uid(req), body.planName as PlanName, body.billingCycle, body.phone, body.couponCode)
      res.json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },
)

// ─── POST /api/billing/downgrade ──────────────────────────────────────────────

const DowngradeSchema = z.object({
  planName: z.enum(["STARTER", "PRO", "BUSINESS"]),
})

router.post(
  "/downgrade",
  requireAuth,
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { planName } = DowngradeSchema.parse(req.body)
      const userId = uid(req)
      const sub = await getOrCreateSubscription(userId)
      
      const planOrder: PlanName[] = ["FREE", "STARTER", "PRO", "BUSINESS", "ENTERPRISE"]
      const currentIndex = planOrder.indexOf(sub.plan.name as PlanName)
      const targetIndex = planOrder.indexOf(planName)
      
      if (targetIndex >= currentIndex) {
        throw new AppError(400, "You can only downgrade to a lower tier.")
      }
      
      const newPlan = await prisma.plan.findUniqueOrThrow({ where: { name: planName } })
      
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { planId: newPlan.id },
      })
      
      res.json({ success: true, message: `Successfully downgraded to ${planName}.` })
    } catch (err) {
      next(err)
    }
  }
)

// ─── POST /api/billing/validate-coupon ────────────────────────────────────────
//
// Prices a coupon so the checkout page can show the discount before the customer
// commits. Deliberately uses the SAME quoteCoupon the order creation uses, so the
// figure previewed here and the figure charged cannot diverge.
//
// This does NOT reserve the code. Validating is free and repeatable; a coupon is
// only consumed in the transaction that activates a paid subscription.
//
// Authenticated and rate-limited: per-user redemption limits cannot be evaluated
// anonymously, and an open endpoint that reports whether a code exists is a
// code-guessing oracle.

const ValidateCouponSchema = z.object({
  code:         z.string().trim().min(1).max(40),
  planName:     z.enum(["STARTER", "PRO", "BUSINESS"]),
  billingCycle: z.enum(["monthly", "yearly"]),
})

router.post(
  "/validate-coupon",
  requireAuth,
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = ValidateCouponSchema.parse(req.body)
      const quote = await quoteCoupon({
        code: body.code,
        userId: uid(req),
        planName: body.planName as PlanName,
        billingCycle: body.billingCycle,
      })
      res.json({ success: true, data: quote })
    } catch (err) {
      // A rejected coupon is an ordinary outcome, not an error worth a stack
      // trace — answer 200 with the reason so the page can show it inline.
      if (err instanceof AppError && err.statusCode === 422) {
        res.json({ success: false, error: err.message })
        return
      }
      next(err)
    }
  },
)

// ─── POST /api/billing/verify-payment ─────────────────────────────────────────
//
// Called by the SPA when the browser returns from Cashfree checkout. The return
// URL proves nothing on its own, so the order id in it is treated purely as
// "which order should I look at" — the service re-reads that order from
// Cashfree's authenticated API before activating anything.
//
// This exists for responsiveness, not correctness: the webhook below is the
// authoritative path and will activate the subscription even if the user closes
// the tab. Both are idempotent, so whichever lands first wins and the other
// becomes a no-op.

const VerifyPaymentSchema = z.object({
  orderId: z.string().min(1).max(120),
})

router.post(
  "/verify-payment",
  requireAuth,
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { orderId } = VerifyPaymentSchema.parse(req.body)
      const result = await verifyPaymentForUser(uid(req), orderId)

      if (result.status === "not_paid") {
        res.status(202).json({
          success: false,
          status: result.status,
          error: "This payment has not completed yet.",
          orderStatus: result.orderStatus,
        })
        return
      }

      res.json({ success: true, status: result.status })
    } catch (err) {
      next(err)
    }
  },
)

// ─── POST /api/billing/cashfree-webhook ───────────────────────────────────────
//
// Cashfree's server-to-server notification, and the authoritative confirmation
// of payment. Public by necessity — authenticity comes from the HMAC signature
// over the RAW request body, not from a session.
//
// Two things this handler must get right:
//   1. Verify before parsing anything. req.rawBody is captured in app.ts for
//      exactly this path; the signature is over those bytes, so re-serialising
//      the parsed JSON would change key order and never match.
//   2. Always 200 once the signature is valid. A non-2xx makes Cashfree retry,
//      and retrying will not fix a malformed payload or an order we have already
//      processed — it just produces noise. Genuine server faults still return
//      500 so the retry is useful.
//
// Rate limiting: this path inherits the global /api limiter (200 req/min per IP)
// and is deliberately NOT exempted. Being public, an exemption would hand an
// attacker an unmetered endpoint. The signature check runs before any outbound
// Cashfree call, so unsigned floods are rejected cheaply and cannot be amplified
// into API traffic. A throttled *genuine* webhook is not lost either: Cashfree
// retries, and the browser-return verification is an independent second path.
// Revisit the 200/min ceiling only if real webhook volume approaches it.

router.post(
  "/cashfree-webhook",
  async (req: Request, res: Response): Promise<void> => {
    const signature = req.header("x-webhook-signature") ?? ""
    const timestamp = req.header("x-webhook-timestamp") ?? ""
    const rawBody = (req as Request & { rawBody?: string }).rawBody ?? ""

    if (!rawBody) {
      // Means the raw-body capture in app.ts is not covering this path. Fail
      // loudly rather than silently accepting unverifiable webhooks.
      logger.error("Cashfree webhook: raw body unavailable — signature cannot be verified")
      res.status(500).json({ success: false, error: "Webhook misconfigured" })
      return
    }

    if (!verifyWebhookSignature(rawBody, timestamp, signature)) {
      logger.warn("Cashfree webhook: signature verification failed", {
        hasSignature: Boolean(signature),
        hasTimestamp: Boolean(timestamp),
      })
      res.status(401).json({ success: false, error: "Invalid signature" })
      return
    }

    try {
      const result = await processCashfreeWebhook(req.body as Parameters<typeof processCashfreeWebhook>[0])
      res.status(200).json({ success: true, ...result })
    } catch (err) {
      // Retry only helps for transient faults. A 4xx AppError means the payload
      // is permanently unprocessable (unknown plan, missing tags, amount
      // mismatch) — retrying delivers the same bad data forever, so it is
      // acknowledged instead, loudly. Everything else (DB down, gateway
      // unreachable) returns 500 so Cashfree's retry is actually useful.
      const isPermanent =
        err instanceof AppError && err.statusCode >= 400 && err.statusCode < 500

      logger.error("Cashfree webhook: processing failed", {
        error: err instanceof Error ? err.message : String(err),
        permanent: isPermanent,
        stack: err instanceof Error ? err.stack : undefined,
      })

      if (isPermanent) {
        res.status(200).json({ success: false, error: "Webhook not processable", retry: false })
        return
      }
      res.status(500).json({ success: false, error: "Webhook processing failed" })
    }
  },
)

// ─── POST /api/billing/cancel ──────────────────────────────────────────────────

router.post(
  "/cancel",
  requireAuth,
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await cancelSubscription(uid(req))
      res.json({ success: true, message: "Subscription will be cancelled at the end of the current period" })
    } catch (err) {
      next(err)
    }
  },
)

// ─── GET /api/billing/invoices ─────────────────────────────────────────────────

const InvoicePaginationSchema = z.object({
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

router.get(
  "/invoices",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { limit, offset } = InvoicePaginationSchema.parse(req.query)
      const invoices = await getUserInvoices(uid(req), limit, offset)
      res.json({ success: true, data: invoices })
    } catch (err) {
      next(err)
    }
  },
)

// ─── GET /api/billing/invoices/:id/download ────────────────────────────────────

router.get(
  "/invoices/:id/download",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const invoiceId = String(req.params["id"] ?? "")
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          user: { select: { name: true, email: true } },
        },
      })
      type InvoiceWithUser = typeof invoice & { user: { name: string; email: string } }

      if (!invoice) {
        res.status(404).json({ success: false, error: "Invoice not found" })
        return
      }

      // Ownership check — prevent users from downloading other users' invoices
      if (invoice.userId !== uid(req)) {
        res.status(403).json({ success: false, error: "Forbidden" })
        return
      }

      const inv = invoice as InvoiceWithUser
      const invoiceNumber = `INV-${inv.createdAt.getFullYear()}${String(inv.createdAt.getMonth() + 1).padStart(2, "0")}-${inv.id.slice(-6).toUpperCase()}`

      // A coupon's figures live on CouponRedemption, not on the invoice, so they
      // have to be joined in — without this the PDF shows only the discounted
      // total and a ₹799 plan bought with a 99% code reads as costing ₹7.99 with
      // no explanation. Keyed on the order id, which both records share.
      const redemption = inv.cashfreeOrderId
        ? await prisma.couponRedemption.findUnique({
            where: { cashfreeOrderId: inv.cashfreeOrderId },
            select: {
              originalPaise: true,
              discountPaise: true,
              coupon: { select: { code: true } },
            },
          })
        : null

      const pdfBuffer = await generateInvoicePDF({
        invoiceNumber,
        createdAt: inv.createdAt,
        periodStart: inv.periodStart,
        periodEnd: inv.periodEnd,
        amount: inv.amount,
        discount: redemption
          ? {
              code: redemption.coupon.code,
              originalPaise: redemption.originalPaise,
              discountPaise: redemption.discountPaise,
            }
          : null,
        currency: inv.currency,
        status: inv.status,
        planName: inv.planName,
        billingCycle: inv.billingCycle,
        cashfreeOrderId: inv.cashfreeOrderId,
        cashfreePaymentId: inv.cashfreePaymentId,
        customer: { name: inv.user.name, email: inv.user.email },
        siteUrl: env.FRONTEND_URL,
        supportEmail: SUPPORT_EMAIL,
        legalName: LEGAL_NAME,
      })

      res.setHeader("Content-Type", "application/pdf")
      res.setHeader("Content-Disposition", `attachment; filename="${invoiceNumber}.pdf"`)
      res.setHeader("Content-Length", pdfBuffer.length.toString())
      res.send(pdfBuffer)
    } catch (err) {
      next(err)
    }
  },
)

// ─── GET /api/billing/usage ────────────────────────────────────────────────────

router.get(
  "/usage",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = uid(req)
      const { limits, planName } = await getUserPlanLimits(userId)

      const monthStart = new Date()
      monthStart.setDate(1)
      monthStart.setHours(0, 0, 0, 0)

      const [qrCount, storage, scansThisMonth] = await Promise.all([
        prisma.qRCode.count({ where: { userId } }),
        prisma.qRFile.aggregate({
          where: { qrCode: { userId } },
          _sum: { sizeBytes: true },
        }),
        prisma.qRScan.count({
          // Quota counts EVERY scan, repeats included — the same figure the
          // dashboard shows as "Total Scans", so the two can never disagree.
          // Note this consumes quota faster than the pre-split behaviour, where
          // repeat scans were discarded before they were ever recorded.
          where: { qrCode: { userId }, scannedAt: { gte: monthStart } },
        }),
      ])

      const storageBytesUsed = Number(storage._sum.sizeBytes ?? 0)
      const storageGBUsed    = storageBytesUsed / (1024 ** 3)

      res.json({
        success: true,
        data: {
          planName,
          qrCodes:   { used: qrCount,                                      limit: limits.dynamicQRLimit     },
          scans:     { used: scansThisMonth,                                limit: limits.scanLimitPerMonth  },
          storageGB: { used: Math.round(storageGBUsed * 100) / 100,        limit: limits.fileStorageGB      },
          apiCalls:  { used: 0,                                             limit: limits.apiCallsLimit      },
        },
      })
    } catch (err) {
      next(err)
    }
  },
)

export default router
