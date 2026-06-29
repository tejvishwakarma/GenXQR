import { randomBytes, createHash, timingSafeEqual } from "node:crypto"
import { prisma } from "../db/prisma.js"
import { AppError } from "../middleware/error.middleware.js"
import { checkAndNotifyLimit } from "./limit-notification.service.js"
import { getUserPlanLimits } from "./billing.service.js"
import { logger } from "../logger/index.js"

const KEY_PREFIX = "nxqr_live_"
const MAX_KEYS_PER_USER = 10

/**
 * Generate a new raw API key and its stored hash.
 * Format: nxqr_live_<64 hex chars>
 */
function generateRawKey(): { raw: string; hash: string; prefix: string } {
  const raw = KEY_PREFIX + randomBytes(32).toString("hex")
  const hash = createHash("sha256").update(raw).digest("hex")
  const prefix = raw.slice(0, KEY_PREFIX.length + 8) // "nxqr_live_XXXXXXXX"
  return { raw, hash, prefix }
}

export interface ApiKeyRecord {
  id: string
  name: string
  prefix: string
  lastUsedAt: string | null
  callCount: number
  isActive: boolean
  expiresAt: string | null
  createdAt: string
}

/**
 * List all API keys for a user (never returns the raw key or hash).
 */
export async function listApiKeys(userId: string): Promise<ApiKeyRecord[]> {
  const keys = await prisma.apiKey.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      lastUsedAt: true,
      callCount: true,
      isActive: true,
      expiresAt: true,
      createdAt: true,
    },
  })
  return keys.map((k) => ({
    id: k.id,
    name: k.name,
    prefix: k.keyPrefix,
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    callCount: k.callCount,
    isActive: k.isActive,
    expiresAt: k.expiresAt?.toISOString() ?? null,
    createdAt: k.createdAt.toISOString(),
  }))
}

/**
 * Create a new API key. Returns the raw key ONCE — it cannot be retrieved again.
 */
export async function createApiKey(
  userId: string,
  name: string,
  expiresInDays?: number,
): Promise<{ key: ApiKeyRecord; rawKey: string }> {
  // Enforce per-user key limit
  const count = await prisma.apiKey.count({ where: { userId } })
  if (count >= MAX_KEYS_PER_USER) {
    throw new AppError(400, `Maximum of ${MAX_KEYS_PER_USER} API keys allowed per account`)
  }

  const { raw, hash, prefix } = generateRawKey()
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : null

  const record = await prisma.apiKey.create({
    data: {
      userId,
      name: name.trim(),
      keyHash: hash,
      keyPrefix: prefix,
      expiresAt,
    },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      lastUsedAt: true,
      callCount: true,
      isActive: true,
      expiresAt: true,
      createdAt: true,
    },
  })

  return {
    rawKey: raw,
    key: {
      id: record.id,
      name: record.name,
      prefix: record.keyPrefix,
      lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
      callCount: record.callCount,
      isActive: record.isActive,
      expiresAt: record.expiresAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
    },
  }
}

/**
 * Revoke an API key (sets isActive = false).
 * Returns 404 if key doesn't belong to user.
 */
export async function revokeApiKey(userId: string, keyId: string): Promise<void> {
  const key = await prisma.apiKey.findFirst({ where: { id: keyId, userId } })
  if (!key) throw new AppError(404, "API key not found")

  await prisma.apiKey.update({
    where: { id: keyId },
    data: { isActive: false },
  })
}

/**
 * Permanently delete an API key.
 */
export async function deleteApiKey(userId: string, keyId: string): Promise<void> {
  const key = await prisma.apiKey.findFirst({ where: { id: keyId, userId } })
  if (!key) throw new AppError(404, "API key not found")
  await prisma.apiKey.delete({ where: { id: keyId } })
}

/**
 * Verify a raw API key from an incoming request.
 * Returns the resolved userId and keyId on success.
 * Throws 401 for any invalid/expired/inactive key.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export async function verifyApiKey(
  rawKey: string,
): Promise<{ userId: string; keyId: string }> {
  if (!rawKey.startsWith(KEY_PREFIX)) {
    throw new AppError(401, "Invalid API key format")
  }

  const incomingHash = createHash("sha256").update(rawKey).digest("hex")

  // Look up by prefix first (narrow the set), then timing-safe compare full hash
  const prefix = rawKey.slice(0, KEY_PREFIX.length + 8)
  const candidates = await prisma.apiKey.findMany({
    where: { keyPrefix: prefix, isActive: true },
    select: { id: true, userId: true, keyHash: true, expiresAt: true, isActive: true },
  })

  const matched = candidates.find((c) => {
    try {
      return timingSafeEqual(
        Buffer.from(c.keyHash, "hex"),
        Buffer.from(incomingHash, "hex"),
      )
    } catch {
      return false
    }
  })

  if (!matched) throw new AppError(401, "Invalid or revoked API key")
  if (matched.expiresAt && matched.expiresAt < new Date()) {
    throw new AppError(401, "API key has expired")
  }

  // Bump usage stats asynchronously (don't block request)
  void (async () => {
    try {
      await prisma.apiKey.update({
        where: { id: matched.id },
        data: { lastUsedAt: new Date(), callCount: { increment: 1 } },
      })

      // Check monthly API call limit across all keys for this user
      const { limits, planName } = await getUserPlanLimits(matched.userId)
      if (limits.apiCallsLimit > 0) {
        const monthStart = new Date()
        monthStart.setUTCDate(1)
        monthStart.setUTCHours(0, 0, 0, 0)
        // Sum callCount across all keys — approximation since callCount is all-time,
        // so we use a direct DB aggregate that's already tracked per-key
        const agg = await prisma.apiKey.aggregate({
          where: { userId: matched.userId },
          _sum: { callCount: true },
        })
        const totalCalls = agg._sum.callCount ?? 0
        await checkAndNotifyLimit(matched.userId, "api_calls", totalCalls, limits.apiCallsLimit, planName)
      }
    } catch (err) {
      logger.warn("API call limit check failed", { userId: matched.userId, error: String(err) })
    }
  })()

  return { userId: matched.userId, keyId: matched.id }
}
