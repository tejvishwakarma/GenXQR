import { createHash } from "crypto"
import { Queue } from "bullmq"
import { redis } from "../redis/client.js"
import { getCountryCode } from "./geo.service.js"
import { env } from "../config/env.js"
import { prisma } from "../db/prisma.js"
import { logger } from "../logger/index.js"
import { isDestinationBlocked, isOwnerBlocked } from "./blocklist.service.js"
import { isOverScanQuota, recordAccountScan } from "./scan-quota.service.js"
import type { QRCode, QRContent, QRDesign, SmartRoutingRule, ABTestVariant } from "@prisma/client"

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * "blocked" is moderation, not the customer's own scheduling. It is kept
 * distinct so the expired page can say the content was removed rather than
 * imply the owner let it lapse.
 */
export type ExpiredReason = "deactivated" | "expired" | "limit" | "blocked"

export type QRResolution =
  | { action: "redirect"; url: string }
  | { action: "pixel_redirect"; url: string; fbPixelId: string | null; gaId: string | null; gtmId: string | null }
  | { action: "landing"; slug: string; type: string; content: Record<string, unknown>; design: Record<string, unknown> }
  | { action: "password"; slug: string }
  | { action: "expired"; slug: string; fallbackUrl: string | null; reason: ExpiredReason }

export interface ScanJobData {
  qrId: string
  ip: string
  userAgent: string | undefined
  referrer: string | undefined
  scannedAt: string
  abVariantId: string | undefined
  /** False when this device+IP already scanned inside DEDUP_TTL_SECONDS. */
  isUnique: boolean
}

// ─── BullMQ Queue ──────────────────────────────────────────────────────────────

export const scanQueue = new Queue<ScanJobData>("scan-log", {
  connection: { url: env.REDIS_URL },
  defaultJobOptions: {
    removeOnComplete: 500,
    removeOnFail: 100,
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
  },
})

// ─── Redis cache TTL ───────────────────────────────────────────────────────────

const CACHE_TTL_SECONDS = 600 // 10 minutes

type CachedQR = {
  id: string
  /** Owner, for the blocklist check. Absent on blobs cached before this field
   *  existed — treated as not-blocked, and self-heals within the 10-minute TTL. */
  userId: string | null
  type: string
  category: string
  slug: string
  isActive: boolean
  /** Taken down by an admin. Optional: blobs cached before it existed self-heal within the TTL. */
  disabledByAdmin?: boolean
  isPasswordProtected: boolean
  activeFrom: string | null
  activeUntil: string | null
  scanLimit: number | null
  scanCount: number
  fallbackUrl: string | null
  fbPixelId: string | null
  gaId: string | null
  gtmId: string | null
  abTestEnabled: boolean
  abTestSplitPct: number
  content: Record<string, unknown> | null
  design: Record<string, unknown> | null
  smartRoutes: Array<{
    id: string
    priority: number
    conditionType: string
    conditionValue: Record<string, unknown>
    targetUrl: string
    isActive: boolean
  }>
  abVariants: Array<{
    id: string
    targetUrl: string
    splitPct: number
  }>
}

// ─── Direct-redirect QR types (no landing page) ────────────────────────────────

const REDIRECT_TYPES = new Set(["WHATSAPP", "INSTAGRAM"])

// ─── Cache helpers ─────────────────────────────────────────────────────────────

async function getCachedQR(slug: string): Promise<CachedQR | null> {
  try {
    const raw = await redis.get(`qr:slug:${slug}`)
    if (!raw) return null
    return JSON.parse(raw) as CachedQR
  } catch {
    return null
  }
}

async function setCachedQR(slug: string, qr: CachedQR): Promise<void> {
  try {
    await redis.setex(`qr:slug:${slug}`, CACHE_TTL_SECONDS, JSON.stringify(qr))
  } catch (err) {
    logger.warn("Failed to cache QR", { slug, error: String(err) })
  }
}

export async function invalidateQRCache(slug: string): Promise<void> {
  try {
    await redis.del(`qr:slug:${slug}`, scanCountKey(slug))
  } catch (err) {
    logger.warn("Failed to invalidate QR cache", { slug, error: String(err) })
  }
}

// ─── Live scan-count tracking ──────────────────────────────────────────────────
// qr.scanCount inside the CachedQR blob above is only as fresh as the last
// cache (re)build — up to CACHE_TTL_SECONDS stale — so it cannot be trusted
// for scan-limit enforcement (a QR with scanLimit=1 would accept scans from
// any number of devices for up to 10 minutes before the limit actually took
// effect). This tracks the count separately with atomic Redis INCR, updated
// synchronously in the request path (not deferred to the async scan worker),
// so concurrent scans can't all read the same stale value and all pass.

function scanCountKey(slug: string): string {
  return `qr:slug:${slug}:count`
}

async function getLiveScanCount(slug: string, fallback: number): Promise<number> {
  try {
    const key = scanCountKey(slug)
    const raw = await redis.get(key)
    if (raw !== null) return Number(raw)
    // Not seeded yet (first access since a cache rebuild, or evicted under
    // memory pressure) — seed from the value we already have in hand.
    await redis.set(key, String(fallback), "NX")
    return fallback
  } catch (err) {
    logger.warn("Failed to read live scan count, falling back to cached value", {
      slug,
      error: String(err),
    })
    return fallback
  }
}

async function incrementLiveScanCount(slug: string): Promise<void> {
  try {
    await redis.incr(scanCountKey(slug))
  } catch (err) {
    logger.warn("Failed to increment live scan count", { slug, error: String(err) })
  }
}

// ─── DB fetch ─────────────────────────────────────────────────────────────────

async function fetchQRFromDB(slug: string): Promise<CachedQR | null> {
  const qr = await prisma.qRCode.findUnique({
    where: { slug },
    select: {
      id: true,
      userId: true,
      type: true,
      category: true,
      slug: true,
      isActive: true,
      disabledByAdminAt: true,
      isPasswordProtected: true,
      activeFrom: true,
      activeUntil: true,
      scanLimit: true,
      scanCount: true,
      fallbackUrl: true,
      fbPixelId: true,
      gaId: true,
      gtmId: true,
      abTestEnabled: true,
      abTestSplitPct: true,
      content: { select: { data: true } },
      design: {
        select: {
          primaryColor: true,
          secondaryColor: true,
          backgroundColor: true,
          foregroundColor: true,
          dotStyle: true,
          cornerSquareStyle: true,
          cornerDotStyle: true,
          logoUrl: true,
          frameStyle: true,
          frameText: true,
          frameColor: true,
          fontTitle: true,
          fontBody: true,
          welcomeScreenUrl: true,
        },
      },
      smartRoutes: {
        where: { isActive: true },
        orderBy: { priority: "asc" },
        select: {
          id: true,
          priority: true,
          conditionType: true,
          conditionValue: true,
          targetUrl: true,
          isActive: true,
        },
      },
      abVariants: {
        select: { id: true, targetUrl: true, splitPct: true },
        // Same order the dashboard lists them in (qr.routes.ts), so the split %
        // applies to the variant the owner sees as "Variant A". Without an
        // orderBy Postgres returns rows in no guaranteed order.
        orderBy: { createdAt: "asc" },
      },
    },
  })

  if (!qr) return null

  return {
    id: qr.id,
    userId: qr.userId,
    type: qr.type,
    category: qr.category,
    slug: qr.slug,
    isActive: qr.isActive,
    disabledByAdmin: qr.disabledByAdminAt !== null,
    isPasswordProtected: qr.isPasswordProtected,
    activeFrom: qr.activeFrom?.toISOString() ?? null,
    activeUntil: qr.activeUntil?.toISOString() ?? null,
    scanLimit: qr.scanLimit,
    scanCount: qr.scanCount,
    fallbackUrl: qr.fallbackUrl,
    fbPixelId: qr.fbPixelId ?? null,
    gaId: qr.gaId ?? null,
    gtmId: qr.gtmId ?? null,
    abTestEnabled: qr.abTestEnabled,
    abTestSplitPct: qr.abTestSplitPct,
    content: (qr.content?.data as Record<string, unknown>) ?? null,
    design: qr.design as Record<string, unknown> ?? null,
    smartRoutes: qr.smartRoutes.map((r) => ({
      id: r.id,
      priority: r.priority,
      conditionType: r.conditionType,
      conditionValue: r.conditionValue as Record<string, unknown>,
      targetUrl: r.targetUrl,
      isActive: r.isActive,
    })),
    abVariants: qr.abVariants,
  }
}

// ─── Smart routing rule evaluator ─────────────────────────────────────────────

export function parseDeviceType(userAgent: string): "mobile" | "tablet" | "desktop" {
  const ua = userAgent.toLowerCase()
  if (/tablet|ipad/.test(ua)) return "tablet"
  if (/mobile|android|iphone|ipod|blackberry|windows phone/.test(ua)) return "mobile"
  return "desktop"
}

function evaluateSmartRoutes(
  rules: CachedQR["smartRoutes"],
  context: { deviceType: string; hour: number; countryCode: string | null },
): string | null {
  for (const rule of rules) {
    const cv = rule.conditionValue
    switch (rule.conditionType) {
      case "device":
        if (typeof cv.device === "string" && cv.device.toLowerCase() === context.deviceType) {
          return rule.targetUrl
        }
        break
      case "time": {
        const from = typeof cv.from === "number" ? cv.from : null
        const to = typeof cv.to === "number" ? cv.to : null
        if (from !== null && to !== null) {
          const inRange =
            from <= to
              ? context.hour >= from && context.hour < to
              : context.hour >= from || context.hour < to // crosses midnight
          if (inRange) return rule.targetUrl
        }
        break
      }
      case "geo": {
        // conditionValue.countries is an array of ISO-2 country codes
        const countries = Array.isArray(cv.countries) ? (cv.countries as string[]) : []
        if (context.countryCode && countries.map((c) => c.toUpperCase()).includes(context.countryCode.toUpperCase())) {
          return rule.targetUrl
        }
        break
      }
      default:
        break
    }
  }
  return null
}

// ─── A/B test variant picker ───────────────────────────────────────────────────

function pickABVariant(
  variants: CachedQR["abVariants"],
  splitPct: number,
): { variantId: string; url: string } | null {
  if (!variants.length) return null
  const roll = Math.random() * 100
  if (roll < splitPct && variants[0]) {
    return { variantId: variants[0].id, url: variants[0].targetUrl }
  }
  if (variants[1]) {
    return { variantId: variants[1].id, url: variants[1].targetUrl }
  }
  return null
}

// ─── Build destination URL from content ───────────────────────────────────────

function normalizeUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null
  const s = raw.trim()
  if (/^https?:\/\//i.test(s)) return s
  // Reject any value that already has a non-http scheme (javascript:, data:, etc.)
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null
  return `https://${s}`
}

/**
 * Builds a direct destination for the content types that have one.
 *
 * NOTE: step 9's REDIRECT_TYPES gate only lets WHATSAPP and INSTAGRAM through, so
 * a URL or FACEBOOK code normally lands on its landing page instead. The password
 * path has always redirected those two straight to their target, and that
 * behaviour is preserved deliberately rather than quietly changed — see the
 * caller in scan.routes.ts.
 */
export function buildDestinationFromContent(type: string, content: Record<string, unknown>): string | null {
  switch (type) {
    case "URL":
      return normalizeUrl(content.url)
    case "WHATSAPP": {
      const phone = String(content.phone ?? "").replace(/\D/g, "")
      const msg = content.message ? `?text=${encodeURIComponent(String(content.message))}` : ""
      return phone ? `https://wa.me/${phone}${msg}` : null
    }
    case "INSTAGRAM":
      return typeof content.username === "string"
        ? `https://instagram.com/${content.username}`
        : null
    case "FACEBOOK":
      return normalizeUrl(content.pageUrl ?? content.url)
    default:
      return null
  }
}

// ─── Main resolution function ──────────────────────────────────────────────────

/**
 * Resolves where a QR scan should be sent.
 *
 * @param slug  - The QR code slug from the URL
 * @param ip    - Client IP address
 * @param ua    - User-Agent header
 * @param ref   - Referer header
 */
/**
 * Why a code cannot be served right now, or null if it can. Steps 1b–4b of
 * resolveQRScan, shared with GET /api/public/qr/:slug (scanAvailability): that
 * endpoint used to check only isActive and the password, so opening /l/<slug>
 * directly still showed an expired, used-up or blocked code's content —
 * coupon codes, WiFi passwords, files — without the scan being counted.
 *
 * The fallbackUrl is the customer's to set, so it is screened against the
 * destination blocklist too (it used to be followed unchecked).
 */
async function unavailableFor(qr: CachedQR, now: Date): Promise<{ reason: ExpiredReason; fallbackUrl: string | null } | null> {
  // Owner blocklisted — takes every code they own down at once. fallbackUrl is
  // dropped: honouring it would let whoever earned the block carry on.
  if (await isOwnerBlocked(qr.userId)) return { reason: "blocked", fallbackUrl: null }
  // Taken down by an admin: same treatment — no owner-controlled fallback.
  if (qr.disabledByAdmin) return { reason: "blocked", fallbackUrl: null }

  const fallbackUrl = await screenedFallback(qr)

  if (!qr.isActive) return { reason: "deactivated", fallbackUrl }
  if (qr.activeFrom && new Date(qr.activeFrom) > now) return { reason: "expired", fallbackUrl }
  if (qr.activeUntil && new Date(qr.activeUntil) < now) return { reason: "expired", fallbackUrl }

  // Scan limit — against the live Redis counter, not the cached blob's
  // scanCount, which can be up to CACHE_TTL_SECONDS stale.
  if (qr.scanLimit !== null) {
    const liveScanCount = await getLiveScanCount(qr.slug, qr.scanCount)
    if (liveScanCount >= qr.scanLimit) return { reason: "limit", fallbackUrl }
  }

  // The owner's monthly scan quota (scan-quota.service.ts).
  if (qr.userId && (await isOverScanQuota(qr.userId))) return { reason: "limit", fallbackUrl }

  return null
}

/** The code's fallbackUrl, unless it points at a blocked destination. */
async function screenedFallback(qr: CachedQR): Promise<string | null> {
  return qr.fallbackUrl && !(await isDestinationBlocked(qr.fallbackUrl)) ? qr.fallbackUrl : null
}

/**
 * Takes one of a code's scanLimit slots atomically: increment, and give it back
 * if that went over. Checking first and counting later (in queueScan) let N
 * simultaneous scans of a "1 scan only" code all through (audit, 24 Oct 2026).
 * Fails open on a Redis error, like the other scan checks — then the slot is
 * counted later by queueScan as before.
 */
async function reserveScanSlot(qr: CachedQR, limit: number): Promise<"reserved" | "full" | "unreserved"> {
  try {
    const key = scanCountKey(qr.slug)
    await redis.set(key, String(qr.scanCount), "NX") // seed if missing
    const n = await redis.incr(key)
    if (n > limit) {
      await redis.decr(key)
      return "full"
    }
    return "reserved"
  } catch (err) {
    logger.warn("Scan slot reservation failed — allowing the scan", { slug: qr.slug, error: String(err) })
    return "unreserved"
  }
}

/** Whether a code's landing content may be served now; the reason if not. */
export async function scanAvailability(slug: string): Promise<ExpiredReason | null> {
  let qr = await getCachedQR(slug)
  if (!qr) {
    qr = await fetchQRFromDB(slug)
    if (!qr) return "expired"
    await setCachedQR(slug, qr)
  }
  return (await unavailableFor(qr, new Date()))?.reason ?? null
}

/**
 * True if any http(s) link inside a code's content is on the destination
 * blocklist. URL/FACEBOOK codes and link pages are shown as landing pages, so
 * their links never went through the redirect's blocklist check.
 */
export async function contentHasBlockedLink(content: unknown): Promise<boolean> {
  const urls = new Set(JSON.stringify(content ?? {}).match(/https?:\/\/[^\s"'<>\\]+/gi) ?? [])
  for (const url of [...urls].slice(0, 100)) {
    if (await isDestinationBlocked(url)) return true
  }
  return false
}

export async function resolveQRScan(
  slug: string,
  ip: string,
  ua: string | undefined,
  ref: string | undefined,
  /**
   * Set once the visitor has entered the correct password. Everything after the
   * password gate — smart routing, A/B split, destination building, scan logging
   * — then runs exactly as it does for an unprotected code, instead of being
   * reimplemented by the caller.
   */
  opts?: { passwordVerified?: boolean },
): Promise<QRResolution> {
  // 1. Cache lookup
  let qr = await getCachedQR(slug)
  if (!qr) {
    qr = await fetchQRFromDB(slug)
    if (!qr) {
      return { action: "expired", slug, fallbackUrl: null, reason: "expired" }
    }
    await setCachedQR(slug, qr)
    // Seed the live scan counter from Postgres.
    // NX: only when the counter is missing. The live counter runs AHEAD of
    // the database (the worker writes scanCount moments later), so overwriting
    // it on every cache rebuild undid scans just counted — and let a burst of
    // scans of a "1 scan only" code through (audit, 24 Oct 2026). Anything
    // that really resets the count (purge, edits) deletes the key via
    // invalidateQRCache, so seeding from Postgres then is correct.
    await redis.set(scanCountKey(slug), String(qr.scanCount), "NX").catch((err: unknown) => {
      logger.warn("Failed to seed live scan count", { slug, error: String(err) })
    })
  }

  // 1b–4b. Blocked owner, switched off, outside its dates, scan limit, monthly
  // quota — shared with the landing-page content endpoint (scanAvailability).
  const now = new Date()
  const unavailable = await unavailableFor(qr, now)
  if (unavailable) return { action: "expired", slug, ...unavailable }

  // 5. Password protection check
  if (qr.isPasswordProtected && !opts?.passwordVerified) {
    return { action: "password", slug }
  }

  // 5b. Whether this scan counts at all (one address hammering one code does
  // not — see withinScanRate), and if the code has a scanLimit, take the slot
  // now, atomically. After the password gate so a prompt costs nothing.
  const counted = await withinScanRate(qr.id, ip)
  let liveCountDone = false
  if (counted && qr.scanLimit !== null) {
    const slot = await reserveScanSlot(qr, qr.scanLimit)
    if (slot === "full") return { action: "expired", slug, reason: "limit", fallbackUrl: await screenedFallback(qr) }
    liveCountDone = slot === "reserved"
  }
  const logScan = (abVariantId?: string) => {
    if (counted) void queueScan(qr.id, qr.userId, qr.slug, ip, ua, ref, abVariantId, { liveCountDone })
  }

  // Smart routing and A/B tests are Pro features. Saved rules used to keep
  // routing after a downgrade (indefinitely, for a lapsed Pro trial); now they
  // apply only while the owner's plan includes them. Looked up only for codes
  // that have either, so ordinary scans pay nothing.
  const hasRouting = qr.smartRoutes.length > 0
  const hasAB = qr.abTestEnabled && qr.abVariants.length > 0
  // Dynamic import: billing.service reaches this module through subscription-expiry.
  const features = (hasRouting || hasAB) && qr.userId
    ? await import("./billing.service.js").then((m) => m.getPlanLimitsReadOnly(qr.userId!)).catch(() => null)
    : null

  // 6. Smart routing evaluation
  const deviceType = ua ? parseDeviceType(ua) : "desktop"
  const hour = now.getUTCHours()
  const countryCode = await getCountryCode(ip)
  const smartUrl = features?.smartRouting ? evaluateSmartRoutes(qr.smartRoutes, { deviceType, hour, countryCode }) : null
  if (smartUrl) {
    logScan()
    return await wrapRedirect(smartUrl, qr)
  }

  // 7. A/B test
  if (hasAB && features?.abTesting) {
    const variant = pickABVariant(qr.abVariants, qr.abTestSplitPct)
    if (variant) {
      logScan(variant.variantId)
      return await wrapRedirect(variant.url, qr)
    }
  }

  // 8. Log scan asynchronously
  logScan()

  // 9. Determine destination
  if (REDIRECT_TYPES.has(qr.type) && qr.content) {
    const url = buildDestinationFromContent(qr.type, qr.content)
    if (url) return await wrapRedirect(url, qr)
  }

  // 10. Landing page
  return {
    action: "landing",
    slug: qr.slug,
    type: qr.type,
    content: qr.content ?? {},
    design: qr.design ?? {},
  }
}

// ─── Pixel redirect helper ────────────────────────────────────────────────────

async function wrapRedirect(url: string, qr: CachedQR): Promise<QRResolution> {
  // Every redirect in resolveQRScan funnels through here — smart routing, A/B
  // variants and the content-derived destination alike — so screening once here
  // cannot be bypassed by picking a different route through the resolver. A
  // smart-routing rule or A/B variant is exactly where a blocked destination
  // would otherwise reappear, since those URLs never pass through QRContent.
  if (await isDestinationBlocked(url)) {
    return { action: "expired", slug: qr.slug, fallbackUrl: null, reason: "blocked" }
  }

  if (qr.fbPixelId || qr.gaId || qr.gtmId) {
    return {
      action: "pixel_redirect",
      url,
      fbPixelId: qr.fbPixelId,
      gaId: qr.gaId,
      gtmId: qr.gtmId,
    }
  }
  return { action: "redirect", url }
}

// ─── Queue helpers ─────────────────────────────────────────────────────────────

const DEDUP_TTL_SECONDS = 4 * 60 * 60 // 4 hours

/** Scans of ONE code from ONE address that are counted, per minute / per day. */
export const SCAN_RATE_PER_MINUTE = 10
export const SCAN_RATE_PER_DAY = 100

/**
 * True while this address is within the counted-scan rate for this code.
 * Relies on req.ip being the real visitor (config/trusted-proxies.ts). Fails
 * open: if Redis cannot answer, the scan is counted as before.
 */
async function withinScanRate(qrId: string, ip: string): Promise<boolean> {
  try {
    const now = Date.now()
    const minuteKey = `scan:rate:m:${qrId}:${ip}:${Math.floor(now / 60_000)}`
    const dayKey = `scan:rate:d:${qrId}:${ip}:${Math.floor(now / 86_400_000)}`
    const res = await redis.multi().incr(minuteKey).expire(minuteKey, 120).incr(dayKey).expire(dayKey, 2 * 86_400).exec()
    const perMinute = Number(res?.[0]?.[1] ?? 0)
    const perDay = Number(res?.[2]?.[1] ?? 0)
    return perMinute <= SCAN_RATE_PER_MINUTE && perDay <= SCAN_RATE_PER_DAY
  } catch {
    return true
  }
}

async function queueScan(
  qrId: string,
  ownerId: string | null,
  slug: string,
  ip: string,
  userAgent: string | undefined,
  referrer: string | undefined,
  abVariantId?: string,
  /** The live scanLimit counter was already incremented (reserveScanSlot). */
  opts: { liveCountDone?: boolean } = {},
): Promise<void> {
  try {
    // Only called for scans that count: one address hammering one code is
    // still redirected but not counted, logged or sent to webhooks — checked by
    // the caller (resolveQRScan step 5b, withinScanRate).

    // Deduplicate: suppress repeat scans from the same device within 4 hours.
    // The key combines qrId + IP + a short UA fingerprint so that two different
    // devices sharing the same LAN IP (e.g. two phones on the same WiFi) are
    // still counted as separate scans.
    const uaFingerprint = createHash("sha256")
      .update(userAgent ?? "unknown")
      .digest("hex")
      .slice(0, 12)
    const dedupKey = `scan:dedup:${qrId}:${ip}:${uaFingerprint}`
    // The marker no longer decides whether the scan is recorded — only whether it
    // counts as unique. Repeat scans used to be dropped entirely, which made the
    // dashboard silently under-report: someone testing their own code, or a
    // visitor opening it twice, simply did not appear.
    const isUnique = Boolean(await redis.set(dedupKey, "1", "EX", DEDUP_TTL_SECONDS, "NX"))

    // Every scan counts toward scanLimit, matching the total now shown as the
    // headline figure. Previously only unique scans did, so a limit of 100 could
    // absorb far more than 100 actual opens.
    if (!opts.liveCountDone) await incrementLiveScanCount(slug)
    // The monthly quota counts unique scans only (scan-quota.service.ts).
    if (ownerId && isUnique) await recordAccountScan(ownerId)

    await scanQueue.add("log-scan" as string, {
      qrId,
      ip,
      userAgent,
      referrer,
      scannedAt: new Date().toISOString(),
      abVariantId,
      isUnique,
    })
  } catch (err) {
    logger.error("Failed to queue scan job", { qrId, error: String(err) })
  }
}
