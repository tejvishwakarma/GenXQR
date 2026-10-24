/**
 * Monthly scan quota: PLAN_LIMITS.scanLimitPerMonth, ENFORCED.
 *
 * Until 18 Oct 2026 the limit only triggered an email; scans were never refused.
 * Decided then:
 *   - When an account reaches its limit, its codes stop redirecting until the
 *     window resets or the plan is upgraded. Scanners get the "limit reached"
 *     page, or the code's fallbackUrl if it has one.
 *   - The window is a MONTH ANCHORED ON THE PLAN'S START (currentPeriodStart):
 *     a plan that started on the 17th resets on the 17th of each month. Yearly
 *     plans therefore still get the monthly allowance, month by month.
 *   - UNIQUE scans count: one per device (IP + browser) per code per 4 hours —
 *     the same "unique" as analytics (scan.service queueScan). Decided 23 Oct
 *     2026 (security audit): counting repeats let anyone reload a printed code
 *     thousands of times and switch off all of a customer's codes for the
 *     month. Repeats are still shown in analytics; they just don't use quota.
 *     The per-code scanLimit an owner sets still counts every scan.
 *
 * A limit of 0 (FREE) is NOT enforced here. FREE accounts cannot have live
 * codes except during the one-time pause notice (subscription-expiry.service),
 * and blocking them here would cut that notice short; expiry pauses them.
 *
 * Fails OPEN: if Redis or the database cannot answer, the scan goes through.
 * A customer's printed code breaking because our cache hiccupped is a worse
 * outcome than a few scans over quota.
 *
 * The count is a Redis counter per account per window, seeded from Postgres on
 * a miss, incremented as each scan is queued. Check and increment are not
 * atomic, so concurrent scans can overshoot the limit by a handful — accepted.
 */
import { prisma } from "../db/prisma.js"
import { redis } from "../redis/client.js"
import { logger } from "../logger/index.js"
import { PLAN_LIMITS } from "./billing.service.js"
import { isLapsed } from "./subscription-expiry.service.js"
import type { PlanName } from "@prisma/client"

/** Adds whole months in UTC, clamping to the target month's last day (31 Jan + 1 → 28/29 Feb). */
function addMonthsUTC(d: Date, months: number): Date {
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + months
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(
    Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()),
  )
}

/** The monthly window, anchored on `anchor`, that contains `now`. */
export function scanUsageWindow(anchor: Date, now = new Date()): { start: Date; end: Date } {
  if (now < anchor) return { start: anchor, end: addMonthsUTC(anchor, 1) }
  let k = (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + (now.getUTCMonth() - anchor.getUTCMonth())
  let start = addMonthsUTC(anchor, k)
  if (start > now) start = addMonthsUTC(anchor, --k)
  return { start, end: addMonthsUTC(anchor, k + 1) }
}

export interface ScanQuota {
  limit: number
  windowStart: Date
  windowEnd: Date
}

const QUOTA_CACHE_TTL = 300 // s — plan changes also invalidate explicitly
const quotaKey = (userId: string) => `scanquota:plan:${userId}`
// v2: unique scans only (23 Oct 2026). The version makes counters written under
// the old every-scan rule miss once, so each account re-seeds from Postgres.
const countKey = (userId: string, windowStart: Date) => `scanquota:v2:count:${userId}:${windowStart.getTime()}`

/**
 * The account's limit and current window. Read-only (no lapse writes), so it
 * is safe on the public scan path. Cached for 5 minutes.
 */
export async function getScanQuota(userId: string): Promise<ScanQuota> {
  try {
    const cached = await redis.get(quotaKey(userId))
    if (cached) {
      const q = JSON.parse(cached) as { limit: number; windowStart: string; windowEnd: string }
      // A cached window that has ended is stale — fall through and recompute.
      if (new Date(q.windowEnd) > new Date()) {
        return { limit: q.limit, windowStart: new Date(q.windowStart), windowEnd: new Date(q.windowEnd) }
      }
    }
  } catch {
    /* cache miss */
  }

  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: {
      status: true, trialEndsAt: true, currentPeriodStart: true, currentPeriodEnd: true, codesPauseAt: true,
      plan: { select: { name: true } },
    },
  })
  const planName: PlanName = !sub || isLapsed(sub) ? "FREE" : sub.plan.name
  const anchor = sub?.currentPeriodStart ?? new Date()
  const { start, end } = scanUsageWindow(anchor)
  const quota: ScanQuota = { limit: PLAN_LIMITS[planName].scanLimitPerMonth, windowStart: start, windowEnd: end }

  await redis
    .set(quotaKey(userId), JSON.stringify(quota), "EX", QUOTA_CACHE_TTL)
    .catch(() => undefined)
  return quota
}

/** Drop the cached plan/window — call on any plan or period change. */
export async function invalidateScanQuota(userId: string): Promise<void> {
  await redis.del(quotaKey(userId)).catch(() => undefined)
}

/** Scans this account has used in its current window (every scan counts). */
export async function getScanUsage(userId: string, quota?: ScanQuota): Promise<number> {
  const q = quota ?? (await getScanQuota(userId))
  const key = countKey(userId, q.windowStart)
  const live = await redis.get(key).catch(() => null)
  if (live !== null) return Number(live)

  const counted = await prisma.qRScan.count({
    where: { qrCode: { userId }, isUnique: true, scannedAt: { gte: q.windowStart, lt: q.windowEnd } },
  })
  // NX: if a concurrent request seeded it first, keep theirs. Expires a day
  // after the window so old windows clean themselves up.
  const ttl = Math.max(60, Math.ceil((q.windowEnd.getTime() - Date.now()) / 1000) + 86_400)
  await redis.set(key, String(counted), "EX", ttl, "NX").catch(() => undefined)
  return counted
}

/** Whether a new scan must be refused. Fails open. */
export async function isOverScanQuota(userId: string): Promise<boolean> {
  try {
    const quota = await getScanQuota(userId)
    if (quota.limit <= 0) return false // FREE: see the header comment
    return (await getScanUsage(userId, quota)) >= quota.limit
  } catch (err) {
    logger.warn("Scan quota check failed — allowing scan", { userId, error: String(err) })
    return false
  }
}

/** Counts one scan against the account. Called as the scan is queued. */
export async function recordAccountScan(userId: string): Promise<void> {
  try {
    const quota = await getScanQuota(userId)
    await getScanUsage(userId, quota) // ensure the counter exists before INCR
    await redis.incr(countKey(userId, quota.windowStart))
  } catch (err) {
    logger.warn("Failed to count scan against quota", { userId, error: String(err) })
  }
}
