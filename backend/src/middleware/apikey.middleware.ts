import type { Request, Response, NextFunction } from "express"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { verifyApiKey } from "../services/apikeys.service.js"
import { AppError } from "./error.middleware.js"

/**
 * Developer API authentication middleware.
 * Accepts an API key from the Authorization header as "Bearer nxqr_live_...".
 * On success, sets req.user.sub = userId and req.apiKeyId = keyId.
 */
export async function requireApiKey(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith("Bearer nxqr_live_")) {
      throw new AppError(401, "Valid API key required (Authorization: Bearer nxqr_live_...)")
    }

    const rawKey = authHeader.slice(7)
    const { userId, keyId } = await verifyApiKey(rawKey)

    const payload: AccessTokenPayload = { sub: userId, email: "", role: "USER" }
    req.user = payload as unknown as Express.User
    req.apiKeyId = keyId
    next()
  } catch (err) {
    next(err)
  }
}
