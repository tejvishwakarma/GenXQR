/**
 * Developer REST API — v1
 * Authenticated via API key middleware.
 * Exposes QR management, analytics, and webhook subscription endpoints
 * consumed by the GenXQR Zapier, Make, and n8n integrations.
 * Mounted at /v1
 */
import { Router, type IRouter } from "express"
import { z } from "zod"
import { QRType } from "@prisma/client"
import type { Request } from "express"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { prisma } from "../db/prisma.js"
import { requireApiKey, requireApiQuota } from "../middleware/apikey.middleware.js"
import { v1Limiter } from "../middleware/rateLimit.middleware.js"
import { requireQRSlot } from "../middleware/plan-gate.middleware.js"
import {
  createQR,
  listQRs,
  getQR,
  updateQR,
  deleteQR,
  toggleQR,
  createQRSchema,
  updateQRSchema,
} from "../services/qr.service.js"
import { getQRAnalytics } from "../services/analytics.service.js"
import {
  createWebhook,
  deleteWebhook,
  listWebhooks,
  getWebhookWithSecret,
  deliverWebhookEvent,
  WEBHOOK_EVENTS,
  type WebhookEvent,
} from "../services/webhook.service.js"

const router: IRouter = Router()
const uid = (req: Request) => (req.user as unknown as AccessTokenPayload).sub

// All v1 routes: authenticate the API key, rate-limit per user (req.user.sub),
// then count the call against the monthly quota. Order matters both ways: the
// limiter reads req.user.sub set by requireApiKey, and the quota comes after
// the limiter so a rate-limited call is never counted.
router.use(requireApiKey)
router.use(v1Limiter)
router.use(requireApiQuota)

// ─── QR Codes ─────────────────────────────────────────────────────────────────

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  // nativeEnum, not string: an unrecognised type must be a 422 naming the field,
  // not a plain string handed to Prisma's enum column, which errors as a 500.
  type: z.nativeEnum(QRType).optional(),
  search: z.string().optional(),
  updatedSince: z.string().datetime({ offset: true }).optional(),
  sort: z.enum(["createdAt", "updatedAt"]).default("createdAt"),
})

/**
 * GET /v1/qr
 * List authenticated user's QR codes. Supports updatedSince + sort for polling triggers.
 */
router.get("/qr", async (req, res, next) => {
  try {
    const query = listSchema.parse(req.query)
    const result = await listQRs(uid(req), {
      page: query.page,
      limit: query.limit,
      type: query.type,
      search: query.search,
      updatedSince: query.updatedSince,
      sort: query.sort,
    })
    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /v1/qr
 * Create a new dynamic QR code.
 */
router.post("/qr", requireQRSlot, async (req, res, next) => {
  try {
    const input = createQRSchema.parse(req.body)
    const qr = await createQR(uid(req), input)
    // Same events qr.routes.ts fires. Without these, a QR created through the
    // developer API raised no qr.created — so an integration's own "New QR Code"
    // trigger never saw anything it created, or anything another integration did.
    void deliverWebhookEvent(uid(req), "qr.created", { qr })
    res.status(201).json({ success: true, data: qr })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /v1/qr/:id
 * Get a single QR code by ID.
 */
router.get("/qr/:id", async (req, res, next) => {
  try {
    const qr = await getQR(req.params.id!, uid(req))
    res.json({ success: true, data: qr })
  } catch (err) {
    next(err)
  }
})

/**
 * PATCH /v1/qr/:id
 * Update a QR code.
 */
router.patch("/qr/:id", async (req, res, next) => {
  try {
    // Same validation as the dashboard route (qr.routes.ts). This used to pass
    // req.body straight through, skipping every rule in updateQRSchema.
    const qr = await updateQR(req.params.id!, uid(req), updateQRSchema.parse(req.body))
    void deliverWebhookEvent(uid(req), "qr.updated", { qr })
    res.json({ success: true, data: qr })
  } catch (err) {
    next(err)
  }
})

/**
 * PATCH /v1/qr/:id/toggle
 * Flip isActive between true/false.
 */
router.patch("/qr/:id/toggle", async (req, res, next) => {
  try {
    const result = await toggleQR(req.params.id!, uid(req))
    // Same as the dashboard toggle: on/off is an update for qr.updated subscribers.
    void getQR(result.id, uid(req))
      .then((qr) => deliverWebhookEvent(uid(req), "qr.updated", { qr }))
      .catch(() => undefined)
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

/**
 * DELETE /v1/qr/:id
 * Delete a QR code.
 */
router.delete("/qr/:id", async (req, res, next) => {
  try {
    // Read the name before deleting: the qr.deleted payload carries it, and after
    // the row is gone there is nothing left to read it from.
    const existing = await getQR(req.params.id!, uid(req))
    await deleteQR(req.params.id!, uid(req))
    void deliverWebhookEvent(uid(req), "qr.deleted", { qrId: req.params.id!, name: existing?.name ?? "" })
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

/**
 * GET /v1/qr/:id/analytics
 * Get analytics for a QR code (last 30 days by default, capped at 90).
 */
router.get("/qr/:id/analytics", async (req, res, next) => {
  try {
    // Validated: a non-numeric `days` used to become NaN, an invalid date, and a
    // 500. Values above 90 are capped rather than refused, as documented.
    const { days: requested } = analyticsQuerySchema.parse(req.query)
    const days = Math.min(requested, 90)
    await getQR(req.params.id!, uid(req)) // ownership check (throws 404 if not owned)
    const data = await getQRAnalytics(req.params.id!, days)
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

const analyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).default(30),
})

// ─── Scans (polling fallback for Zapier/Make triggers) ───────────────────────

const scansListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  since: z.string().datetime({ offset: true }).optional(),
})

/**
 * GET /v1/qr/:id/scans
 * Return recent scans for a QR code, newest-first, with stable `id` for dedup.
 * Integration polling triggers call this when webhook delivery is unavailable.
 */
router.get("/qr/:id/scans", async (req, res, next) => {
  try {
    const { limit, since } = scansListSchema.parse(req.query)
    await getQR(req.params.id!, uid(req)) // ownership check

    const scans = await prisma.qRScan.findMany({
      where: {
        qrId: req.params.id!,
        ...(since && { scannedAt: { gte: new Date(since) } }),
      },
      orderBy: { scannedAt: "desc" },
      take: limit,
      select: {
        id: true,
        qrId: true,
        scannedAt: true,
        country: true,
        countryCode: true,
        city: true,
        region: true,
        deviceType: true,
        os: true,
        browser: true,
        referrer: true,
      },
    })

    res.json({ success: true, data: scans })
  } catch (err) {
    next(err)
  }
})

// ─── Webhooks (REST Hook subscribe/unsubscribe lifecycle) ─────────────────────

const subscribeSchema = z.object({
  url: z.string().url(),
  event: z.string().refine((e) => WEBHOOK_EVENTS.includes(e as WebhookEvent), {
    message: `event must be one of: ${WEBHOOK_EVENTS.join(", ")}`,
  }),
  source: z.enum(["zapier", "make", "n8n"]).optional(),
  name: z.string().max(64).optional(),
})

/**
 * GET /v1/webhooks
 * List subscriptions (debug + reconciliation for integrations).
 */
router.get("/webhooks", async (req, res, next) => {
  try {
    const hooks = await listWebhooks(uid(req))
    res.json({ success: true, data: hooks })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /v1/webhooks
 * Subscribe — called by Zapier/Make when a trigger is created, or by n8n when
 * the trigger node activates. Accepts a single event (subscription-per-event model).
 */
router.post("/webhooks", async (req, res, next) => {
  try {
    const { url, event, source, name } = subscribeSchema.parse(req.body)
    const hook = await createWebhook(
      uid(req),
      name ?? `${source ?? "integration"} — ${event}`,
      url,
      [event],
      source,
    )
    res.status(201).json({ success: true, data: hook })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /v1/webhooks/:id
 * Return a single webhook INCLUDING its secret. Used by n8n trigger nodes to
 * verify inbound HMAC signatures. Callers must keep the secret confidential.
 */
router.get("/webhooks/:id", async (req, res, next) => {
  try {
    const hook = await getWebhookWithSecret(uid(req), req.params.id!)
    res.json({ success: true, data: hook })
  } catch (err) {
    next(err)
  }
})

/**
 * DELETE /v1/webhooks/:id
 * Unsubscribe — called when a Zap, Make scenario, or n8n workflow is turned off.
 */
router.delete("/webhooks/:id", async (req, res, next) => {
  try {
    await deleteWebhook(uid(req), req.params.id!)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

// ─── Meta ─────────────────────────────────────────────────────────────────────

/**
 * GET /v1/events
 * List of supported webhook event names, for integrations building dynamic
 * event dropdowns. Needs an API key like every /v1 route (router.use above).
 */
router.get("/events", (_req, res) => {
  res.json({ success: true, data: WEBHOOK_EVENTS })
})

export default router
