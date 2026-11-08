import { isAccountBlocked } from "../services/blocklist.service.js"
import { prisma } from "../db/prisma.js"
import type { Request, Response, NextFunction } from "express"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { verifyApiKey, isApiKeyFormat, meterApiCall } from "../services/apikeys.service.js"
import { AppError } from "./error.middleware.js"
import { ACCESS_TOKEN_PREFIX, mcpResourceUrl, oauthProvider } from "../services/oauth.service.js"
import { getUserPlanLimits } from "../services/billing.service.js"

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
 * /v1 authentication: an API key everywhere, and on /v1/mcp also an OAuth
 * access token from "Sign in with GenXQR" (oauth.service). A token is for the
 * MCP endpoint only (its resource), and — like a key — needs API access on the
 * account's plan at every use. A 401 on /v1/mcp names the protected-resource
 * metadata (RFC 9728), which is how an AI app finds out how to sign in.
 */
export async function requireApiKeyOrMcpToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const isMcp = req.path === "/mcp"
  const bearer = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : ""
  const challenge = (err: unknown) => {
    if (isMcp && err instanceof AppError && err.statusCode === 401) {
      res.setHeader("WWW-Authenticate", `Bearer resource_metadata="${new URL("/.well-known/oauth-protected-resource/v1/mcp", mcpResourceUrl()).href}"`)
    }
    next(err)
  }
  if (!isMcp || !bearer.startsWith(ACCESS_TOKEN_PREFIX)) {
    return requireApiKey(req, res, (err?: unknown) => (err ? challenge(err) : next()))
  }
  try {
    const info = await oauthProvider.verifyAccessToken(bearer).catch(() => {
      throw new AppError(401, "Invalid or expired access token")
    })
    if (info.resource?.href !== mcpResourceUrl().href) throw new AppError(401, "This token is not for this server")
    const userId = String(info.extra?.userId ?? "")
    const owner = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
    if (!owner || (await isAccountBlocked(userId, owner.email))) throw new AppError(403, "This account has been suspended.")
    const { limits } = await getUserPlanLimits(userId)
    if (!limits.apiAccess) throw new AppError(403, "Your current plan does not include API access.")
    req.user = { sub: userId, email: "", role: "USER" } as unknown as Express.User
    req.oauthClientId = info.clientId
    res.locals.apiCallsLimit = limits.apiCallsLimit
    next()
  } catch (err) {
    challenge(err)
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
    if (!userId || !(req.apiKeyId || req.oauthClientId)) throw new AppError(401, "Valid API key required (Authorization: Bearer gxqr_live_...)")
    // An OAuth token has no key row to update; it counts against the same monthly quota.
    await meterApiCall(userId, req.apiKeyId ?? null, Number(res.locals.apiCallsLimit ?? 0))
    next()
  } catch (err) {
    next(err)
  }
}
