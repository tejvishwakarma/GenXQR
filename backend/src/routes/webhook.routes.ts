import { Router, type IRouter } from "express"
import { z } from "zod"
import type { Request } from "express"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { requireAuth } from "../middleware/auth.middleware.js"
import { requirePlanFeature } from "../middleware/plan-gate.middleware.js"
import {
  listWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  getWebhookDeliveries,
  testWebhook,
  WEBHOOK_EVENTS,
} from "../services/webhook.service.js"

const router: IRouter = Router()
const uid = (req: Request) => (req.user as unknown as AccessTokenPayload).sub

// All webhook routes require PRO+ plan
const planGuard = requirePlanFeature("apiAccess")

/**
 * GET /api/webhooks
 */
router.get("/", requireAuth, planGuard, async (req, res, next) => {
  try {
    const hooks = await listWebhooks(uid(req))
    res.json({ success: true, data: hooks })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/webhooks/events
 * Return list of supported event names.
 */
router.get("/events", requireAuth, (_req, res) => {
  res.json({ success: true, data: WEBHOOK_EVENTS })
})

const createSchema = z.object({
  name: z.string().min(1).max(64),
  url: z.string().url(),
  events: z.array(z.string()).min(1),
})

/**
 * POST /api/webhooks
 */
router.post("/", requireAuth, planGuard, async (req, res, next) => {
  try {
    const { name, url, events } = createSchema.parse(req.body)
    const hook = await createWebhook(uid(req), name, url, events)
    res.status(201).json({ success: true, data: hook })
  } catch (err) {
    next(err)
  }
})

const updateSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  url: z.string().url().optional(),
  events: z.array(z.string()).min(1).optional(),
  isActive: z.boolean().optional(),
})

/**
 * PATCH /api/webhooks/:id
 */
router.patch("/:id", requireAuth, planGuard, async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }
    const patch = updateSchema.parse(req.body)
    const hook = await updateWebhook(uid(req), id, patch)
    res.json({ success: true, data: hook })
  } catch (err) {
    next(err)
  }
})

/**
 * DELETE /api/webhooks/:id
 */
router.delete("/:id", requireAuth, planGuard, async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }
    await deleteWebhook(uid(req), id)
    res.json({ success: true, message: "Webhook deleted" })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/webhooks/:id/deliveries
 * Recent delivery history for a webhook (last 50).
 */
router.get("/:id/deliveries", requireAuth, planGuard, async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }
    const deliveries = await getWebhookDeliveries(uid(req), id)
    res.json({ success: true, data: deliveries })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/webhooks/:id/test
 * Send a test payload to verify the endpoint is reachable.
 */
router.post("/:id/test", requireAuth, planGuard, async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }
    const result = await testWebhook(uid(req), id)
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

export default router
