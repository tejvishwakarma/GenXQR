import type { Request, Response, NextFunction } from "express"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { verifyApiKey, isApiKeyFormat } from "../services/apikeys.service.js"
import { AppError } from "./error.middleware.js"

/**
 * Developer API authentication middleware.
 * Accepts an API key from the Authorization header as "Bearer gxqr_live_...",
 * and the legacy "nxqr_live_" form still held by existing customers.
 *
 * The accepted prefixes are owned by apikeys.service.ts rather than repeated as a
 * literal here — this file hardcoding its own copy is exactly how the two could
 * disagree, and a middleware that rejects a prefix the service happily issues
 * would make every new key fail with no hint as to why.
 */
export async function requireApiKey(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization
    const rawKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : ""
    if (!isApiKeyFormat(rawKey)) {
      throw new AppError(401, "Valid API key required (Authorization: Bearer gxqr_live_...)")
    }

    const { userId, keyId } = await verifyApiKey(rawKey)

    const payload: AccessTokenPayload = { sub: userId, email: "", role: "USER" }
    req.user = payload as unknown as Express.User
    req.apiKeyId = keyId
    next()
  } catch (err) {
    next(err)
  }
}
