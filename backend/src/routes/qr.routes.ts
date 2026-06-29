import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import { z } from "zod"
import QRCode from "qrcode"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { requireAuth } from "../middleware/auth.middleware.js"
import { apiLimiter } from "../middleware/rateLimit.middleware.js"
import * as QRService from "../services/qr.service.js"
import { prisma } from "../db/prisma.js"
import { invalidateQRCache } from "../services/scan.service.js"
import { deliverWebhookEvent } from "../services/webhook.service.js"
import type { Prisma } from "@prisma/client"
import { requireQRSlot, requirePlanFeature } from "../middleware/plan-gate.middleware.js"
import { logAudit } from "../services/audit.service.js"

const router: IRouter = Router()

/** Extract authenticated user ID from the request */
const uid = (req: Request): string => (req.user as unknown as AccessTokenPayload).sub

// All QR routes require authentication
router.use(requireAuth)

/**
 * POST /api/qr
 * Create a new QR code.
 */
router.post(
  "/",
  apiLimiter,
  requireQRSlot,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = QRService.createQRSchema.parse(req.body)
      const qr = await QRService.createQR(uid(req), input)
      void deliverWebhookEvent(uid(req), "qr.created", { qr })
      logAudit({ userId: uid(req), action: "qr.create", category: "qr", entityId: qr.id, entityType: "QRCode", metadata: { name: qr.name, type: qr.type }, ip: req.ip, userAgent: req.headers["user-agent"] })
      res.status(201).json({ success: true, data: qr })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * GET /api/qr
 * List the authenticated user's QR codes (paginated, filterable).
 */
router.get(
  "/",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = QRService.listQRSchema.parse(req.query)
      const result = await QRService.listQRs(uid(req), query)
      res.json({ success: true, ...result })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * GET /api/qr/:id
 * Get a single QR code by ID (must belong to the authenticated user).
 */
router.get(
  "/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const qr = await QRService.getQR(req.params["id"] as string, uid(req))
      res.json({ success: true, data: qr })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * PUT /api/qr/:id
 * Update a QR code's content, design, or settings.
 */
router.put(
  "/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = QRService.updateQRSchema.parse(req.body)
      const qr = await QRService.updateQR(req.params["id"] as string, uid(req), input)
      await invalidateQRCache(qr.slug)
      void deliverWebhookEvent(uid(req), "qr.updated", { qr })
      logAudit({ userId: uid(req), action: "qr.update", category: "qr", entityId: qr.id, entityType: "QRCode", metadata: { name: qr.name, type: qr.type }, ip: req.ip, userAgent: req.headers["user-agent"] })
      res.json({ success: true, data: qr })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * DELETE /api/qr/:id
 * Permanently delete a QR code and all its data.
 */
router.delete(
  "/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params["id"] as string
      const existing = await QRService.getQR(id, uid(req))
      await QRService.deleteQR(id, uid(req))
      if (existing?.slug) await invalidateQRCache(existing.slug)
      void deliverWebhookEvent(uid(req), "qr.deleted", { qrId: id, name: existing?.name ?? "" })
      logAudit({ userId: uid(req), action: "qr.delete", category: "qr", entityId: id, entityType: "QRCode", metadata: { name: existing?.name ?? "" }, ip: req.ip, userAgent: req.headers["user-agent"] })
      res.json({ success: true, message: "QR code deleted successfully" })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * PATCH /api/qr/:id/toggle
 * Toggle the isActive flag.
 */
router.patch(
  "/:id/toggle",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await QRService.toggleQR(req.params["id"] as string, uid(req))
      await invalidateQRCache(result.slug)
      logAudit({ userId: uid(req), action: result.isActive ? "qr.activate" : "qr.deactivate", category: "qr", entityId: result.id, entityType: "QRCode", metadata: { isActive: result.isActive }, ip: req.ip, userAgent: req.headers["user-agent"] })
      res.json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * POST /api/qr/:id/duplicate
 * Clone a QR code with a new slug and "(Copy)" appended to the name.
 * Counts toward the user's QR slot limit.
 */
router.post(
  "/:id/duplicate",
  requireQRSlot,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const qr = await QRService.duplicateQR(req.params["id"] as string, uid(req))
      res.status(201).json({ success: true, data: qr })
    } catch (err) {
      next(err)
    }
  },
)

// ─── Smart Routing Rules ──────────────────────────────────────────────────────

const smartRoutingGuard = requirePlanFeature("smartRouting")
const abTestingGuard    = requirePlanFeature("abTesting")

const SmartRouteConditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("device"), device: z.enum(["mobile", "tablet", "desktop"]) }),
  z.object({ type: z.literal("time"),   from: z.number().int().min(0).max(23), to: z.number().int().min(0).max(23) }),
  z.object({ type: z.literal("geo"),    countries: z.array(z.string().length(2)).min(1).max(50) }),
])

const SmartRouteBodySchema = z.object({
  conditionType:  z.enum(["device", "time", "geo"]),
  conditionValue: z.record(z.unknown()),
  targetUrl:      z.string().url().max(2048),
  priority:       z.number().int().min(1).max(100),
  isActive:       z.boolean().optional().default(true),
})

/** Verify QR ownership; returns the slug for cache invalidation or throws 404. */
async function requireQROwnerId(qrId: string, userId: string): Promise<string> {
  const qr = await prisma.qRCode.findFirst({
    where: { id: qrId, userId },
    select: { slug: true },
  })
  if (!qr) throw Object.assign(new Error("QR code not found"), { status: 404 })
  return qr.slug
}

/** GET /api/qr/:id/smart-routes */
router.get(
  "/:id/smart-routes",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await requireQROwnerId(req.params["id"] as string, uid(req))
      const rules = await prisma.smartRoutingRule.findMany({
        where: { qrId: req.params["id"] as string },
        orderBy: { priority: "asc" },
      })
      res.json({ success: true, data: rules })
    } catch (err) {
      next(err)
    }
  },
)

/** POST /api/qr/:id/smart-routes */
router.post(
  "/:id/smart-routes",
  smartRoutingGuard,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const qrId = req.params["id"] as string
      const slug = await requireQROwnerId(qrId, uid(req))
      const body = SmartRouteBodySchema.parse(req.body)
      // Validate conditionValue shape matches conditionType
      SmartRouteConditionSchema.parse({ type: body.conditionType, ...body.conditionValue })
      const rule = await prisma.smartRoutingRule.create({
        data: {
          qrId,
          conditionType:  body.conditionType,
          conditionValue: body.conditionValue as Prisma.InputJsonValue,
          targetUrl:      body.targetUrl,
          priority:       body.priority,
          isActive:       body.isActive,
        },
      })
      await invalidateQRCache(slug)
      res.status(201).json({ success: true, data: rule })
    } catch (err) {
      next(err)
    }
  },
)

/** PUT /api/qr/:id/smart-routes/:ruleId */
router.put(
  "/:id/smart-routes/:ruleId",
  smartRoutingGuard,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const qrId = req.params["id"] as string
      const ruleId = req.params["ruleId"] as string
      const slug = await requireQROwnerId(qrId, uid(req))
      const body = SmartRouteBodySchema.parse(req.body)
      SmartRouteConditionSchema.parse({ type: body.conditionType, ...body.conditionValue })
      // Verify rule belongs to this QR
      const existing = await prisma.smartRoutingRule.findFirst({ where: { id: ruleId, qrId } })
      if (!existing) {
        res.status(404).json({ success: false, error: "Rule not found" })
        return
      }
      const rule = await prisma.smartRoutingRule.update({
        where: { id: ruleId },
        data: {
          conditionType:  body.conditionType,
          conditionValue: body.conditionValue as Prisma.InputJsonValue,
          targetUrl:      body.targetUrl,
          priority:       body.priority,
          isActive:       body.isActive,
        },
      })
      await invalidateQRCache(slug)
      res.json({ success: true, data: rule })
    } catch (err) {
      next(err)
    }
  },
)

/** DELETE /api/qr/:id/smart-routes/:ruleId */
router.delete(
  "/:id/smart-routes/:ruleId",
  smartRoutingGuard,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const qrId = req.params["id"] as string
      const ruleId = req.params["ruleId"] as string
      const slug = await requireQROwnerId(qrId, uid(req))
      const existing = await prisma.smartRoutingRule.findFirst({ where: { id: ruleId, qrId } })
      if (!existing) {
        res.status(404).json({ success: false, error: "Rule not found" })
        return
      }
      await prisma.smartRoutingRule.delete({ where: { id: ruleId } })
      await invalidateQRCache(slug)
      res.json({ success: true, message: "Rule deleted" })
    } catch (err) {
      next(err)
    }
  },
)

// ─── A/B Test ─────────────────────────────────────────────────────────────────

const ABSettingsSchema = z.object({
  abTestEnabled: z.boolean(),
  abTestSplitPct: z.number().int().min(1).max(99).optional().default(50),
})

const ABVariantSchema = z.object({
  name:      z.string().min(1).max(80),
  targetUrl: z.string().url().max(2048),
  splitPct:  z.number().int().min(1).max(99),
})

/** PATCH /api/qr/:id/ab-test — Enable/disable A/B test and set split % */
router.patch(
  "/:id/ab-test",
  abTestingGuard,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const qrId = req.params["id"] as string
      const slug = await requireQROwnerId(qrId, uid(req))
      const { abTestEnabled, abTestSplitPct } = ABSettingsSchema.parse(req.body)
      const updated = await prisma.qRCode.update({
        where: { id: qrId },
        data: { abTestEnabled, abTestSplitPct },
        select: { id: true, abTestEnabled: true, abTestSplitPct: true },
      })
      await invalidateQRCache(slug)
      res.json({ success: true, data: updated })
    } catch (err) {
      next(err)
    }
  },
)

/** GET /api/qr/:id/ab-variants */
router.get(
  "/:id/ab-variants",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await requireQROwnerId(req.params["id"] as string, uid(req))
      const variants = await prisma.aBTestVariant.findMany({
        where: { qrId: req.params["id"] as string },
        orderBy: { createdAt: "asc" },
      })
      res.json({ success: true, data: variants })
    } catch (err) {
      next(err)
    }
  },
)

/** POST /api/qr/:id/ab-variants */
router.post(
  "/:id/ab-variants",
  abTestingGuard,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const qrId = req.params["id"] as string
      const slug = await requireQROwnerId(qrId, uid(req))
      const body = ABVariantSchema.parse(req.body)
      // Max 2 variants per QR
      const count = await prisma.aBTestVariant.count({ where: { qrId } })
      if (count >= 2) {
        res.status(400).json({ success: false, error: "Maximum 2 A/B variants allowed per QR code" })
        return
      }
      const variant = await prisma.aBTestVariant.create({
        data: { qrId, name: body.name, targetUrl: body.targetUrl, splitPct: body.splitPct },
      })
      await invalidateQRCache(slug)
      res.status(201).json({ success: true, data: variant })
    } catch (err) {
      next(err)
    }
  },
)

/** PUT /api/qr/:id/ab-variants/:variantId */
router.put(
  "/:id/ab-variants/:variantId",
  abTestingGuard,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const qrId = req.params["id"] as string
      const variantId = req.params["variantId"] as string
      const slug = await requireQROwnerId(qrId, uid(req))
      const body = ABVariantSchema.parse(req.body)
      const existing = await prisma.aBTestVariant.findFirst({ where: { id: variantId, qrId } })
      if (!existing) {
        res.status(404).json({ success: false, error: "Variant not found" })
        return
      }
      const variant = await prisma.aBTestVariant.update({
        where: { id: variantId },
        data: { name: body.name, targetUrl: body.targetUrl, splitPct: body.splitPct },
      })
      await invalidateQRCache(slug)
      res.json({ success: true, data: variant })
    } catch (err) {
      next(err)
    }
  },
)

/** DELETE /api/qr/:id/ab-variants/:variantId */
router.delete(
  "/:id/ab-variants/:variantId",
  abTestingGuard,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const qrId = req.params["id"] as string
      const variantId = req.params["variantId"] as string
      const slug = await requireQROwnerId(qrId, uid(req))
      const existing = await prisma.aBTestVariant.findFirst({ where: { id: variantId, qrId } })
      if (!existing) {
        res.status(404).json({ success: false, error: "Variant not found" })
        return
      }
      await prisma.aBTestVariant.delete({ where: { id: variantId } })
      await invalidateQRCache(slug)
      res.json({ success: true, message: "Variant deleted" })
    } catch (err) {
      next(err)
    }
  },
)

// ─── Download ────────────────────────────────────────────────────────────────

const DownloadFormatSchema = z.enum(["svg", "json"]).default("svg")

/**
 * GET /api/qr/:id/download?format=svg|json
 *
 * svg  — streams an image/svg+xml file containing the QR code (no canvas required)
 * json — returns the QR design config + encoded URL so the client can render any format
 *
 * Ownership is verified before any data is returned.
 */
router.get(
  "/:id/download",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const qr = await QRService.getQR(req.params["id"] as string, uid(req))
      const format = DownloadFormatSchema.parse(req.query["format"] ?? "svg")

      // The QR always encodes the redirect URL: https://<host>/r/<slug>
      const host = process.env["APP_URL"] ?? `${req.protocol}://${req.host}`
      const encodedUrl = `${host}/r/${qr.slug}`

      if (format === "json") {
        res.json({
          success: true,
          data: {
            name: qr.name,
            encodedUrl,
            design: qr.design,
          },
        })
        return
      }

      // SVG — pure-JS generation, no native canvas dependency required
      const design = (qr.design as unknown) as Record<string, string | null | undefined> | null
      const svg = await QRCode.toString(encodedUrl, {
        type: "svg",
        errorCorrectionLevel: "H",
        margin: 2,
        color: {
          dark: design?.primaryColor ?? "#7c3aed",
          light: design?.backgroundColor ?? "#000000",
        },
      })

      const safeName = qr.name.replace(/[^a-z0-9_-]/gi, "_").slice(0, 64) || "qr"
      res.setHeader("Content-Type", "image/svg+xml")
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}.svg"`)
      res.send(svg)
    } catch (err) {
      next(err)
    }
  },
)

export default router
