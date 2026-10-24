import type { Request, Response, NextFunction } from "express"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { AppError } from "./error.middleware.js"

/**
 * Refuses an action during an admin impersonation session (token with `act`).
 * For things that outlive the session or move money or credentials — API keys,
 * webhooks, payments and plan changes, the password, deleting the account.
 * Before this an impersonating admin could, e.g., mint API keys as the customer
 * that kept working after the 15-minute session ended (audit, 24 Oct 2026).
 */
export function forbidWhileImpersonating(req: Request, _res: Response, next: NextFunction): void {
  if ((req.user as AccessTokenPayload | undefined)?.act) {
    next(new AppError(403, "Not available while impersonating a user."))
    return
  }
  next()
}
