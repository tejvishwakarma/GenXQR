import { Router, type IRouter } from "express"
import { z } from "zod"
import type { Request } from "express"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { requireAuth } from "../middleware/auth.middleware.js"
import { requirePlanFeature } from "../middleware/plan-gate.middleware.js"
import { AppError } from "../middleware/error.middleware.js"
import {
  listApiKeys,
  createApiKey,
  revokeApiKey,
  deleteApiKey,
} from "../services/apikeys.service.js"

const router: IRouter = Router()
const uid = (req: Request) => (req.user as unknown as AccessTokenPayload).sub

/**
 * GET /api/apikeys
 * List all API keys for the authenticated user.
 */
router.get("/", requireAuth, requirePlanFeature("apiAccess"), async (req, res, next) => {
  try {
    const keys = await listApiKeys(uid(req))
    res.json({ success: true, data: keys })
  } catch (err) {
    next(err)
  }
})

const createSchema = z.object({
  name: z.string().min(1).max(64),
  expiresInDays: z.number().int().min(1).max(365).optional(),
})

/**
 * POST /api/apikeys
 * Create a new API key. Raw key is returned ONCE in this response.
 */
router.post("/", requireAuth, requirePlanFeature("apiAccess"), async (req, res, next) => {
  try {
    const { name, expiresInDays } = createSchema.parse(req.body)
    const { key, rawKey } = await createApiKey(uid(req), name, expiresInDays)
    res.status(201).json({ success: true, data: { ...key, rawKey } })
  } catch (err) {
    next(err)
  }
})

/**
 * PATCH /api/apikeys/:id/revoke
 * Disable (revoke) an existing API key.
 */
router.patch("/:id/revoke", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }
    if (!id) throw new AppError(400, "Key ID required")
    await revokeApiKey(uid(req), id)
    res.json({ success: true, message: "API key revoked" })
  } catch (err) {
    next(err)
  }
})

/**
 * DELETE /api/apikeys/:id
 * Permanently delete an API key.
 */
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }
    if (!id) throw new AppError(400, "Key ID required")
    await deleteApiKey(uid(req), id)
    res.json({ success: true, message: "API key deleted" })
  } catch (err) {
    next(err)
  }
})

export default router
