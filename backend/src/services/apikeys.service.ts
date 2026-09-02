import { randomBytes, createHash, timingSafeEqual } from "node:crypto"
import { prisma } from "../db/prisma.js"
import { AppError } from "../middleware/error.middleware.js"
import { checkAndNotifyLimit } from "./limit-notification.service.js"
import { getUserPlanLimits, getPlanLimitsReadOnly } from "./billing.service.js"
import { redis } from "../redis/client.js"
import { logger } from "../logger/index.js"

/** Prefix every newly issued key carries. */
const KEY_PREFIX = "gxqr_live_"

/**
 * Prefixes accepted on an inbound request.
 *
 * `nxqr_live_` dates from the product's previous name (NexusQR). Keys issued
 * under it are still in customers' hands, in their Zaps, Make scenarios and n8n
 * credentials — so it stays accepted. Removing it would 401 every existing key
 * the moment this deployed, with the failure surfacing inside somebody else's
 * automation rather than here.
 *
 * Nothing distinguishes a legacy key beyond these ten characters: the stored
 * hash covers the whole key, so verification is prefix-agnostic and both forms
 * are equally valid. Drop the legacy entry only once `keyPrefix LIKE 'nxqr_%'`
 * returns no active rows.
 */
const ACCEPTED_KEY_PREFIXES = [KEY_PREFIX, "nxqr_live_"] as const

/**
 * Both generation and lookup slice the stored prefix at a FIXED offset
 * (KEY_PREFIX.length + 8), so an accepted prefix of a different length would
 * produce a keyPrefix that never matches — the key would fail with "invalid or
 * revoked" and nothing would say why. Fail at import instead.
 */
for (const accepted of ACCEPTED_KEY_PREFIXES) {
  if (accepted.length !== KEY_PREFIX.length) {
    throw new Error(
      `API key prefix "${accepted}" is ${accepted.length} chars but the lookup offset assumes ` +
        `${KEY_PREFIX.length}. All accepted prefixes must be the same length.`,
    )
  }
}

const PREFIX_LOOKUP_LENGTH = KEY_PREFIX.length + 8

const MAX_KEYS_PER_USER = 10

/** True if the token looks like an API key at all — any accepted prefix. */
export function isApiKeyFormat(token: string): boolean {
  return ACCEPTED_KEY_PREFIXES.some((accepted) => token.startsWith(accepted))
}

/**
 * Generate a new raw API key and its stored hash.
 * Format: gxqr_live_<64 hex chars>
 */
function generateRawKey(): { raw: string; hash: string; prefix: string } {
  const raw = KEY_PREFIX + randomBytes(32).toString("hex")
  const hash = createHash("sha256").update(raw).digest("hex")
  const prefix = raw.slice(0, PREFIX_LOOKUP_LENGTH) // "gxqr_live_XXXXXXXX"
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
  // Accepts legacy prefixes too — see ACCEPTED_KEY_PREFIXES.
  if (!isApiKeyFormat(rawKey)) {
    throw new AppError(401, "Invalid API key format")
  }

  const incomingHash = createHash("sha256").update(rawKey).digest("hex")

  // Look up by prefix first (narrow the set), then timing-safe compare full hash
  const prefix = rawKey.slice(0, PREFIX_LOOKUP_LENGTH)
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

  // ── Finding #7: authorize the CURRENT plan on every use, not just at issuance ──
  // A key issued while on a paid plan otherwise kept working forever after a
  // downgrade or trial expiry. Read-only (getPlanLimitsReadOnly) so an API call
  // never triggers a subscription write.
  const limits = await getPlanLimitsReadOnly(matched.userId)
  if (!limits.apiAccess) {
    throw new AppError(403, "Your current plan does not include API access.")
  }

  // ── Finding #8: enforce the monthly call quota, don't just notify ──────────
  // callCount is all-time and the old check only sent an email. This is an
  // atomic per-user, per-calendar-month Redis counter that REJECTS once the plan
  // limit is reached. A limit of 0 means unlimited (see PLAN_LIMITS), so only a
  // positive limit gates.
  if (limits.apiCallsLimit > 0) {
    const month = new Date().toISOString().slice(0, 7) // YYYY-MM (UTC)
    const usageKey = `apiusage:${matched.userId}:${month}`
    let count: number
    try {
      count = await redis.incr(usageKey)
      if (count === 1) await redis.expire(usageKey, 35 * 24 * 60 * 60) // outlive the month
    } catch (err) {
      // Redis down: fail OPEN on metering rather than block a paying customer's
      // integration over an infra blip. Enforcement resumes when Redis returns.
      logger.error("API quota counter unavailable — allowing the call", {
        userId: matched.userId, error: String(err),
      })
      count = 0
    }
    if (count > limits.apiCallsLimit) {
      // Do not count the rejected call.
      void redis.decr(usageKey).catch(() => undefined)
      throw new AppError(429, "Monthly API call limit reached for your plan.")
    }
  }

  // Bump per-key stats + fire the 80%/100% warning email asynchronously.
  void (async () => {
    try {
      await prisma.apiKey.update({
        where: { id: matched.id },
        data: { lastUsedAt: new Date(), callCount: { increment: 1 } },
      })
      const { limits: freshLimits, planName } = await getUserPlanLimits(matched.userId)
      if (freshLimits.apiCallsLimit > 0) {
        const month = new Date().toISOString().slice(0, 7)
        const used = Number((await redis.get(`apiusage:${matched.userId}:${month}`)) ?? 0)
        await checkAndNotifyLimit(matched.userId, "api_calls", used, freshLimits.apiCallsLimit, planName)
      }
    } catch (err) {
      logger.warn("API usage notification failed", { userId: matched.userId, error: String(err) })
    }
  })()

  return { userId: matched.userId, keyId: matched.id }
}

/**
 * Current-month API call count for a user, from the same Redis counter the
 * middleware enforces (finding #8). Exposed so billing usage reports the real
 * number instead of zero. Returns 0 when Redis is unavailable.
 */
export async function getMonthlyApiCallCount(userId: string): Promise<number> {
  try {
    const month = new Date().toISOString().slice(0, 7)
    return Number((await redis.get(`apiusage:${userId}:${month}`)) ?? 0)
  } catch {
    return 0
  }
}
