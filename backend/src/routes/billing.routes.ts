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
  processPayUCallback,
  cancelSubscription,
  getUserInvoices,
  PLAN_LIMITS,
  PLAN_PRICES_INR,
} from "../services/billing.service.js"
import { prisma } from "../db/prisma.js"
import { logger } from "../logger/index.js"
import { env } from "../config/env.js"

const router: IRouter = Router()

function uid(req: Request): string {
  return (req.user as AccessTokenPayload).sub
}

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
})

router.post(
  "/create-order",
  requireAuth,
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = CreateOrderSchema.parse(req.body)
      const result = await createPaymentOrder(uid(req), body.planName as PlanName, body.billingCycle, body.phone)
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

// ─── PayU callback helpers ────────────────────────────────────────────────────
//
// PayU's Prebuilt Checkout page uses browser-side JavaScript to auto-submit a
// form to the surl after the user completes OTP/3DS. This is always a POST with
// an application/x-www-form-urlencoded body.
//
// However PayU's test sandbox occasionally does a GET redirect instead (all
// payment fields arrive as URL query-string params). We handle both so dev
// testing works without needing ngrok.
//
// surl/furl point to BACKEND_URL (port 3001 in dev) so the browser goes directly
// to Express — bypassing the Vite proxy, which can corrupt redirect chains.

function extractPayUData(req: Request): Record<string, string> {
  // POST: data in body (normal production flow)
  // GET:  data in query string (PayU test sandbox fallback)
  const source: Record<string, unknown> =
    req.method === "POST" ? (req.body as Record<string, unknown>) : (req.query as Record<string, unknown>)

  // Flatten: all values to strings, ignore arrays/objects
  const result: Record<string, string> = {}
  for (const [k, v] of Object.entries(source ?? {})) {
    if (typeof v === "string") result[k] = v
    else if (Array.isArray(v) && typeof v[0] === "string") result[k] = v[0]
  }
  return result
}

// ─── GET+POST /api/billing/payu-success ───────────────────────────────────────

async function payuSuccessHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = extractPayUData(req)
    logger.info("PayU success callback", { method: req.method, txnid: data["txnid"], status: data["status"] })
    const { redirectUrl } = await processPayUCallback(data)
    res.redirect(303, redirectUrl)
  } catch (err) {
    logger.error("PayU success handler fatal error", {
      error: err instanceof Error ? err.message : String(err),
    })
    // Redirect the browser rather than returning JSON — PayU sends the browser here
    try {
      res.redirect(303, `${env.FRONTEND_URL}/app/billing?payment=failure&reason=server_error`)
    } catch {
      next(err)
    }
  }
}

router.get("/payu-success", (req, res, next) => { void payuSuccessHandler(req, res, next) })
router.post("/payu-success", (req, res, next) => { void payuSuccessHandler(req, res, next) })

// ─── GET+POST /api/billing/payu-failure ───────────────────────────────────────

function payuFailureHandler(req: Request, res: Response): void {
  const data = extractPayUData(req)
  logger.warn("PayU failure callback", { method: req.method, txnid: data["txnid"], status: data["status"] })
  res.redirect(303, `${env.FRONTEND_URL}/app/billing?payment=failure`)
}

router.get("/payu-failure", payuFailureHandler)
router.post("/payu-failure", payuFailureHandler)

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
      const amountINR = (inv.amount / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })
      const issueDate = inv.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
      const periodStart = inv.periodStart.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
      const periodEnd   = inv.periodEnd.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Invoice ${invoiceNumber}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 794px; }
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; color: #374151; background: #fff; padding: 40px; line-height: 1.4; }
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px; }
  .brand-wrapper { display: flex; align-items: center; gap: 10px; }
  .logo-box { width: 40px; height: 40px; background: linear-gradient(135deg, #8b5cf6, #6d28d9); border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 20px; flex-shrink: 0; }
  .brand { display: flex; flex-direction: column; gap: 1px; }
  .brand-name { font-size: 20px; font-weight: 800; color: #111827; letter-spacing: -0.5px; }
  .brand-url { font-size: 12px; color: #6b7280; font-weight: 500; }
  .invoice-meta { text-align: right; }
  .invoice-label { font-size: 26px; font-weight: 300; letter-spacing: -1px; color: #111827; margin-bottom: 4px; }
  .invoice-number { font-size: 13px; font-weight: 600; color: #6b7280; }
  .addresses { display: flex; justify-content: space-between; margin-bottom: 22px; background: #f9fafb; padding: 18px 24px; border-radius: 12px; border: 1px solid #f3f4f6; }
  .address-block { flex: 1; }
  .address-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #9ca3af; margin-bottom: 7px; font-weight: 700; }
  .address-name { font-weight: 700; font-size: 14px; color: #111827; margin-bottom: 2px; }
  .address-detail { font-size: 12px; color: #4b5563; line-height: 1.5; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
  .meta-item { display: flex; flex-direction: column; gap: 3px; }
  .meta-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; font-weight: 600; }
  .meta-val { font-size: 13px; font-weight: 600; color: #111827; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 18px; border-radius: 10px; overflow: hidden; border: 1px solid #e5e7eb; }
  thead th { background: #f9fafb; padding: 11px 14px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #4b5563; font-weight: 700; border-bottom: 1px solid #e5e7eb; }
  tbody td { padding: 13px 14px; border-bottom: 1px solid #f3f4f6; font-size: 13px; color: #374151; vertical-align: top; }
  tbody tr:last-child td { border-bottom: none; }
  .text-right { text-align: right; }
  .status-badge { display: inline-flex; align-items: center; justify-content: center; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; background: #d1fae5; color: #065f46; border: 1px solid #34d399; }
  .summary-container { display: flex; justify-content: flex-end; }
  .totals { width: 290px; background: #f9fafb; padding: 15px 18px; border-radius: 10px; border: 1px solid #f3f4f6; }
  .total-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; color: #4b5563; }
  .total-row.grand { border-top: 1px dashed #d1d5db; margin-top: 6px; padding-top: 11px; font-size: 15px; font-weight: 800; color: #111827; }
  .txn-section { margin-top: 20px; padding-top: 16px; border-top: 1px solid #e5e7eb; }
  .txn-title { font-size: 13px; color: #111827; font-weight: 700; margin-bottom: 10px; }
  .txn-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .txn-box { background: #f9fafb; padding: 9px 13px; border-radius: 8px; border: 1px solid #f3f4f6; }
  .txn-key { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; font-weight: 600; margin-bottom: 3px; }
  .txn-val { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; color: #111827; font-weight: 500; word-break: break-all; }
  .footer { text-align: center; font-size: 12px; color: #9ca3af; margin-top: 20px; padding-top: 16px; border-top: 1px solid #f3f4f6; line-height: 1.8; }
  .footer a { color: #6b7280; text-decoration: none; }
</style>
</head>
<body>
  <div class="header">
    <div class="brand-wrapper">
      <div class="logo-box">G</div>
      <div class="brand">
        <div class="brand-name">GenXQR</div>
        <div class="brand-url">${env.FRONTEND_URL}</div>
      </div>
    </div>
    <div class="invoice-meta">
      <div class="invoice-label">INVOICE</div>
      <div class="invoice-number"># ${invoiceNumber}</div>
    </div>
  </div>

  <div class="addresses">
    <div class="address-block">
      <div class="address-label">Billed From</div>
      <div class="address-name">GenXQR</div>
      <div class="address-detail">India<br />support@genxqr.com</div>
    </div>
    <div class="address-block">
      <div class="address-label">Billed To</div>
      <div class="address-name">${inv.user.name}</div>
      <div class="address-detail">${inv.user.email}</div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-item">
      <span class="meta-label">Date Issued</span>
      <span class="meta-val">${issueDate}</span>
    </div>
    <div class="meta-item text-right">
      <span class="meta-label">Payment Status</span>
      <div style="margin-top: 3px;"><span class="status-badge">${inv.status.toUpperCase()}</span></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>Period</th>
        <th class="text-right">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          <strong style="color: #111827; font-size: 14px;">GenXQR ${inv.planName} Plan</strong><br />
          <span style="font-size:12px;color:#6b7280; display: inline-block; margin-top: 3px;">Subscription — ${inv.planName} tier (${inv.billingCycle})</span>
        </td>
        <td style="font-size:12px; color: #4b5563;">${periodStart}<br />to ${periodEnd}</td>
        <td class="text-right" style="font-size: 14px;"><strong>₹${amountINR}</strong></td>
      </tr>
    </tbody>
  </table>

  <div class="summary-container">
    <div class="totals">
      <div class="total-row"><span>Subtotal</span><span style="font-weight: 500; color: #111827;">₹${amountINR}</span></div>
      <div class="total-row"><span>Tax (GST)</span><span style="font-weight: 500; color: #111827;">Included</span></div>
      <div class="total-row grand"><span>Total Paid</span><span>₹${amountINR}</span></div>
    </div>
  </div>

  ${inv.payuTxnId || inv.payuPaymentId ? `
  <div class="txn-section">
    <div class="txn-title">Payment Details</div>
    <div class="txn-grid">
      ${inv.payuTxnId ? `<div class="txn-box"><span class="txn-key">Transaction ID</span><span class="txn-val">${inv.payuTxnId}</span></div>` : ""}
      ${inv.payuPaymentId ? `<div class="txn-box"><span class="txn-key">PayU Ref</span><span class="txn-val">${inv.payuPaymentId}</span></div>` : ""}
      <div class="txn-box"><span class="txn-key">Method</span><span class="txn-val">PayU Gateway</span></div>
      <div class="txn-box"><span class="txn-key">Currency</span><span class="txn-val">${inv.currency}</span></div>
    </div>
  </div>` : ""}

  <div class="footer">
    <p style="font-weight: 600; color: #4b5563; margin-bottom: 3px;">Thank you for your business!</p>
    <p>This is a computer-generated invoice and does not require a signature.</p>
    <p>Questions? Contact <a href="mailto:support@genxqr.com">support@genxqr.com</a></p>
  </div>
</body>
</html>`

      // Generate PDF via headless Chromium (puppeteer)
      const puppeteer = await import("puppeteer")
      const browser = await puppeteer.default.launch({
        headless: true,
        // On ARM servers (Oracle Cloud Ampere), point to the system Chromium.
        // Set PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser in .env to override.
        executablePath: process.env["PUPPETEER_EXECUTABLE_PATH"] || undefined,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
      })
      try {
        const page = await browser.newPage()
        // Lock viewport to A4 width at 96 dpi (8.27" × 96 = 794px) so the
        // fixed-width HTML layout renders exactly one page tall.
        await page.setViewport({ width: 794, height: 1122, deviceScaleFactor: 1 })
        await page.setContent(html, { waitUntil: "load" })
        const pdfBuffer = await page.pdf({
          format: "A4",
          printBackground: true,
          margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
        })
        res.setHeader("Content-Type", "application/pdf")
        res.setHeader("Content-Disposition", `attachment; filename="${invoiceNumber}.pdf"`)
        res.setHeader("Content-Length", pdfBuffer.length.toString())
        res.send(Buffer.from(pdfBuffer))
      } finally {
        await browser.close()
      }
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
