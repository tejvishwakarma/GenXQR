/**
 * /api/referrals — the signed-in user's referral link, credit and referrals.
 * Personal, like billing: not workspace-scoped. Rules in referral.service.ts.
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import { requireAuth } from "../middleware/auth.middleware.js"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { getReferralSummary } from "../services/referral.service.js"

const router: IRouter = Router()
const uid = (req: Request) => (req.user as unknown as AccessTokenPayload).sub

/** GET /api/referrals/me — code (created on first call), credit, referrals, history. */
router.get("/me", requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await getReferralSummary(uid(req)) })
  } catch (err) {
    next(err)
  }
})

export default router
