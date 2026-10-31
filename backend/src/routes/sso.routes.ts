import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import { z } from "zod"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { env } from "../config/env.js"
import { requireAuth } from "../middleware/auth.middleware.js"
import { requirePlanFeature } from "../middleware/plan-gate.middleware.js"
import { forbidWhileImpersonating } from "../middleware/impersonation.middleware.js"
import * as Sso from "../services/sso.service.js"
import { SSO_PROVIDERS } from "../services/oidc.service.js"

/**
 * /api/sso — the owner's single sign-on settings (services/sso.service.ts).
 * The account's own business, like billing: ignores the workspace header.
 * Sign-in itself is /api/auth/sso/* (auth.routes.ts).
 */

export const SSO_STATE_COOKIE = "sso_state"

/** Binds the provider round trip to this browser; read back at /api/auth/sso/callback. */
export function setSsoStateCookie(res: Response, state: string): void {
  res.cookie(SSO_STATE_COOKIE, state, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    // Lax: the callback is a top-level GET from the provider's site.
    sameSite: "lax",
    maxAge: Sso.SSO_STATE_TTL_SECONDS * 1000,
    path: "/api/auth/sso",
  })
}

const router: IRouter = Router()
const uid = (req: Request) => (req.user as unknown as AccessTokenPayload).sub

router.use(requireAuth)

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await Sso.getSettings(uid(req)) })
  } catch (err) { next(err) }
})

const SaveSchema = z.object({
  domain: z.string().trim().min(1).max(253),
  provider: z.enum(SSO_PROVIDERS as [string, ...string[]]).transform((p) => p as (typeof SSO_PROVIDERS)[number]),
  defaultRole: z.enum(Sso.SSO_JOIN_ROLES).default("VIEWER"),
})

router.put("/", forbidWhileImpersonating, requirePlanFeature("sso"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await Sso.saveConnection(uid(req), SaveSchema.parse(req.body)) })
  } catch (err) { next(err) }
})

router.post("/verify", requirePlanFeature("sso"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await Sso.verifyDomain(uid(req)) })
  } catch (err) { next(err) }
})

router.post("/link", forbidWhileImpersonating, requirePlanFeature("sso"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { url, state } = await Sso.startLink(uid(req))
    setSsoStateCookie(res, state)
    res.json({ success: true, data: { url } })
  } catch (err) { next(err) }
})

const EnforceSchema = z.object({ enforced: z.boolean() })

router.put("/enforce", forbidWhileImpersonating, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // No plan gate: switching ON already needs a ready connection (plan
    // included), and switching OFF must always work.
    const { enforced } = EnforceSchema.parse(req.body)
    res.json({ success: true, data: await Sso.setEnforced(uid(req), enforced) })
  } catch (err) { next(err) }
})

router.delete("/", forbidWhileImpersonating, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await Sso.deleteConnection(uid(req))
    res.json({ success: true })
  } catch (err) { next(err) }
})

export default router
