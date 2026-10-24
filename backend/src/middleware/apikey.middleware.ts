import { isAccountBlocked } from "../services/blocklist.service.js"
import { prisma } from "../db/prisma.js"
import type { Request, Response, NextFunction } from "express"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { verifyApiKey, isApiKeyFormat, meterApiCall } from "../services/apikeys.service.js"
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
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization
    const rawKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : ""
    if (!isApiKeyFormat(rawKey)) {
      throw new AppError(401, "Valid API key required (Authorization: Bearer gxqr_live_...)")
    }

    const { userId, keyId, apiCallsLimit } = await verifyApiKey(rawKey)
    // A blocked account's keys stop working with it.
    const owner = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
    if (!owner || (await isAccountBlocked(userId, owner.email))) {
      throw new AppError(403, "This account has been suspended.")
    }

    const payload: AccessTokenPayload = { sub: userId, email: "", role: "USER" }
    req.user = payload as unknown as Express.User
    req.apiKeyId = keyId
    res.locals.apiCallsLimit = apiCallsLimit
    next()
  } catch (err) {
    next(err)
  }
}

/**
 * Monthly API quota. Mount AFTER the per-minute limiter (which needs req.user
 * from requireApiKey), so a rate-limited call is never counted — see
 * meterApiCall.
 */
export async function requireApiQuota(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req.user as unknown as AccessTokenPayload | undefined)?.sub
    if (!userId || !req.apiKeyId) throw new AppError(401, "Valid API key required (Authorization: Bearer gxqr_live_...)")
    await meterApiCall(userId, req.apiKeyId, Number(res.locals.apiCallsLimit ?? 0))
    next()
  } catch (err) {
    next(err)
  }
}
