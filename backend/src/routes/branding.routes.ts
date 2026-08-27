import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import { requireAuth } from "../middleware/auth.middleware.js"
import { requirePlanFeature } from "../middleware/plan-gate.middleware.js"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { logAudit } from "../services/audit.service.js"
import * as BrandingService from "../services/branding.service.js"

const router: IRouter = Router()
const uid = (req: Request) => (req.user as unknown as AccessTokenPayload).sub

/**
 * GET /api/branding
 *
 * Deliberately NOT gated on the whiteLabel plan feature. The dashboard needs to
 * render this section for everyone — for accounts without the feature it shows
 * the upgrade prompt, and it must still be able to display what a customer had
 * configured before a downgrade rather than an empty form implying it was lost.
 * whiteLabelEnabled in the response is what the UI keys off.
 */
router.get(
  "/",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({ success: true, data: await BrandingService.getBranding(uid(req)) })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * PATCH /api/branding
 *
 * Gated: this is the paid feature. The server is the only real gate — the
 * dashboard's own check fails open by design (see usePlanFeature).
 */
router.patch(
  "/",
  requireAuth,
  requirePlanFeature("whiteLabel"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = BrandingService.brandingSchema.parse(req.body)
      const data = await BrandingService.updateBranding(uid(req), input)
      logAudit({
        userId: uid(req),
        action: "branding.update",
        // No "settings" category exists; branding is an account-level change.
        category: "system",
        entityId: uid(req),
        entityType: "User",
        metadata: { brandName: data.brandName, hasLogo: Boolean(data.brandLogoUrl) },
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      })
      res.json({ success: true, data, message: "Branding updated" })
    } catch (err) {
      next(err)
    }
  },
)

export default router
