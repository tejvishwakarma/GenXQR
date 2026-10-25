import type { Request, Response, NextFunction } from "express"
import { verifyTurnstileToken } from "../services/turnstile.service.js"

/**
 * Requires a valid Cloudflare Turnstile token on a route (register, login,
 * contact). No-op when Turnstile is not configured. The token is sent by the
 * frontend widget in the JSON body as `turnstileToken`, or the standard
 * `cf-turnstile-response` header; either is accepted.
 *
 * Runs after the rate limiter so a flood is still cheap to reject, and before
 * the handler so a failed challenge never reaches account creation or email.
 */
export async function requireTurnstile(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const body = (req.body ?? {}) as { turnstileToken?: unknown }
    const token =
      (typeof body.turnstileToken === "string" ? body.turnstileToken : undefined) ??
      (req.headers["cf-turnstile-response"] as string | undefined)
    await verifyTurnstileToken(token, req.ip)
    next()
  } catch (err) {
    next(err)
  }
}
