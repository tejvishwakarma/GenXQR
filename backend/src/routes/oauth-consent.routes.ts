import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import { z } from "zod"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { requireAuth } from "../middleware/auth.middleware.js"
import { forbidWhileImpersonating } from "../middleware/impersonation.middleware.js"
import { prisma } from "../db/prisma.js"
import { AppError } from "../middleware/error.middleware.js"
import { logAudit } from "../services/audit.service.js"
import { sendSecurityNotice } from "../services/email.service.js"
import * as OAuth from "../services/oauth.service.js"

/**
 * /api/oauth — the signed-in side of "Sign in with GenXQR" for AI apps: the
 * consent page's request, the answer, and the list of connected apps (with
 * disconnect). Personal account only, like API keys.
 */
const router: IRouter = Router()
router.use(requireAuth)
const me = (req: Request) => (req.user as unknown as AccessTokenPayload).sub

router.get("/requests/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await OAuth.describeRequest(me(req), String(req.params["id"])) })
  } catch (err) {
    next(err)
  }
})

/** POST /api/oauth/requests/:id {approve} → { redirect } for the browser to follow back to the app. */
router.post("/requests/:id", forbidWhileImpersonating, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { approve } = z.object({ approve: z.boolean() }).parse(req.body)
    const user = await prisma.user.findUnique({ where: { id: me(req) }, select: { id: true, email: true } })
    if (!user) throw new AppError(401, "Sign in again.")
    const result = await OAuth.answerRequest(user, String(req.params["id"]), approve)
    if (approve) {
      logAudit({ userId: user.id, action: "oauth.connect", category: "auth", entityType: "OAuthClient", metadata: { app: result.clientName }, ip: req.ip, userAgent: req.headers["user-agent"] })
      void sendSecurityNotice(user.id, { kind: "ai_app_connected", app: result.clientName })
    }
    res.json({ success: true, data: { redirect: result.redirect } })
  } catch (err) {
    next(err)
  }
})

router.get("/connections", async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await OAuth.listConnections(me(req)) })
  } catch (err) {
    next(err)
  }
})

router.delete("/connections/:clientId", forbidWhileImpersonating, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clientId = String(req.params["clientId"])
    await OAuth.revokeConnection(me(req), clientId)
    logAudit({ userId: me(req), action: "oauth.disconnect", category: "auth", entityId: clientId, entityType: "OAuthClient", ip: req.ip, userAgent: req.headers["user-agent"] })
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
