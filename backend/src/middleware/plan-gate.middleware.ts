/**
 * Plan Gate Middleware — enforces subscription plan limits before destructive actions.
 *
 * Usage in routes:
 *   router.post("/qr", requireAuth, requirePlanFeature("dynamicQR"), handler)
 */

import type { Request, Response, NextFunction } from "express"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { getUserPlanLimits } from "../services/billing.service.js"
import { AppError } from "./error.middleware.js"
import { prisma } from "../db/prisma.js"
import { checkAndNotifyLimit } from "../services/limit-notification.service.js"

function uid(req: Request): string {
  return (req.user as AccessTokenPayload).sub
}

/**
 * Checks that the authenticated user has not exceeded their dynamic QR code limit.
 * Pass this middleware after `requireAuth` on the QR create route.
 */
export async function requireQRSlot(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = uid(req)
    const { limits, planName, isTrialing } = await getUserPlanLimits(userId)

    const currentCount = await prisma.qRCode.count({ where: { userId } })

    if (limits.dynamicQRLimit === 0 || currentCount >= limits.dynamicQRLimit) {
      // Notify the user that their QR code limit is exhausted (fire-and-forget)
      void checkAndNotifyLimit(userId, "qr_codes", currentCount, limits.dynamicQRLimit, planName)

      if (limits.dynamicQRLimit === 0) {
        throw new AppError(403, "trial_expired_subscribe_required")
      }

      const trialNote = isTrialing ? " Your 14-day trial is active." : ""
      throw new AppError(
        403,
        `Your ${planName} plan allows up to ${limits.dynamicQRLimit} dynamic QR codes.${trialNote} Please upgrade to create more.`,
      )
    }

    // Warn at 80% (before the slot is taken, so currentCount + 1 is what they'd be at)
    if (limits.dynamicQRLimit > 0) {
      const pctAfterCreate = ((currentCount + 1) / limits.dynamicQRLimit) * 100
      if (pctAfterCreate >= 80) {
        void checkAndNotifyLimit(userId, "qr_codes", currentCount + 1, limits.dynamicQRLimit, planName)
      }
    }

    next()
  } catch (err) {
    next(err)
  }
}

/**
 * Generic feature gate. Throws 403 if the user's plan doesn't include the feature.
 *
 * @param feature  A boolean key from PlanLimits (e.g. "apiAccess", "bulkGeneration")
 */
export function requirePlanFeature(
  feature: "apiAccess" | "bulkGeneration" | "customDomains" | "whiteLabel" | "abTesting" | "smartRouting" | "qrExpiry",
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { limits, planName } = await getUserPlanLimits(uid(req))
      if (!limits[feature]) {
        throw new AppError(
          403,
          `The "${feature}" feature is not available on the ${planName} plan. Please upgrade.`,
        )
      }
      next()
    } catch (err) {
      next(err)
    }
  }
}
