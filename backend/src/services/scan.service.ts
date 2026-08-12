import { createHash } from "crypto"
import { Queue } from "bullmq"
import { redis } from "../redis/client.js"
import { getCountryCode } from "./geo.service.js"
import { env } from "../config/env.js"
import { prisma } from "../db/prisma.js"
import { logger } from "../logger/index.js"
import type { QRCode, QRContent, QRDesign, SmartRoutingRule, ABTestVariant } from "@prisma/client"

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ExpiredReason = "deactivated" | "expired" | "limit"

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
  type: string
  category: string
  slug: string
  isActive: boolean
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
      type: true,
      category: true,
      slug: true,
      isActive: true,
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
      },
    },
  })

  if (!qr) return null

  return {
    id: qr.id,
    type: qr.type,
    category: qr.category,
    slug: qr.slug,
    isActive: qr.isActive,
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

function buildDestinationFromContent(type: string, content: Record<string, unknown>): string | null {
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
export async function resolveQRScan(
  slug: string,
  ip: string,
  ua: string | undefined,
  ref: string | undefined,
): Promise<QRResolution> {
  // 1. Cache lookup
  let qr = await getCachedQR(slug)
  if (!qr) {
    qr = await fetchQRFromDB(slug)
    if (!qr) {
      return { action: "expired", slug, fallbackUrl: null, reason: "expired" }
    }
    await setCachedQR(slug, qr)
    // Rebuilding the metadata cache from Postgres — resync the live scan
    // counter to the authoritative value at the same time.
    await redis.set(scanCountKey(slug), String(qr.scanCount)).catch((err: unknown) => {
      logger.warn("Failed to seed live scan count", { slug, error: String(err) })
    })
  }

  // 2. Check isActive flag
  if (!qr.isActive) {
    return { action: "expired", slug, fallbackUrl: qr.fallbackUrl, reason: "deactivated" }
  }

  // 3. Check date window
  const now = new Date()
  if (qr.activeFrom && new Date(qr.activeFrom) > now) {
    return { action: "expired", slug, fallbackUrl: qr.fallbackUrl, reason: "expired" }
  }
  if (qr.activeUntil && new Date(qr.activeUntil) < now) {
    return { action: "expired", slug, fallbackUrl: qr.fallbackUrl, reason: "expired" }
  }

  // 4. Check scan limit — against the live Redis counter, not the cached
  // blob's scanCount field, which can be up to CACHE_TTL_SECONDS stale.
  if (qr.scanLimit !== null) {
    const liveScanCount = await getLiveScanCount(slug, qr.scanCount)
    if (liveScanCount >= qr.scanLimit) {
      return { action: "expired", slug, fallbackUrl: qr.fallbackUrl, reason: "limit" }
    }
  }

  // 5. Password protection check
  if (qr.isPasswordProtected) {
    return { action: "password", slug }
  }

  // 6. Smart routing evaluation
  const deviceType = ua ? parseDeviceType(ua) : "desktop"
  const hour = now.getUTCHours()
  const countryCode = await getCountryCode(ip)
  const smartUrl = evaluateSmartRoutes(qr.smartRoutes, { deviceType, hour, countryCode })
  if (smartUrl) {
    void queueScan(qr.id, qr.slug, ip, ua, ref)
    return wrapRedirect(smartUrl, qr)
  }

  // 7. A/B test
  if (qr.abTestEnabled && qr.abVariants.length > 0) {
    const variant = pickABVariant(qr.abVariants, qr.abTestSplitPct)
    if (variant) {
      void queueScan(qr.id, qr.slug, ip, ua, ref, variant.variantId)
      return wrapRedirect(variant.url, qr)
    }
  }

  // 8. Log scan asynchronously
  void queueScan(qr.id, qr.slug, ip, ua, ref)

  // 9. Determine destination
  if (REDIRECT_TYPES.has(qr.type) && qr.content) {
    const url = buildDestinationFromContent(qr.type, qr.content)
    if (url) return wrapRedirect(url, qr)
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

function wrapRedirect(url: string, qr: CachedQR): QRResolution {
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

async function queueScan(
  qrId: string,
  slug: string,
  ip: string,
  userAgent: string | undefined,
  referrer: string | undefined,
  abVariantId?: string,
): Promise<void> {
  try {
    // Deduplicate: suppress repeat scans from the same device within 4 hours.
    // The key combines qrId + IP + a short UA fingerprint so that two different
    // devices sharing the same LAN IP (e.g. two phones on the same WiFi) are
    // still counted as separate scans.
    const uaFingerprint = createHash("sha256")
      .update(userAgent ?? "unknown")
      .digest("hex")
      .slice(0, 12)
    const dedupKey = `scan:dedup:${qrId}:${ip}:${uaFingerprint}`
    const acquired = await redis.set(dedupKey, "1", "EX", DEDUP_TTL_SECONDS, "NX")
    if (!acquired) {
      logger.debug("Scan deduped", { qrId })
      return
    }

    // This scan counts toward scanLimit — bump the live counter synchronously,
    // in the same request, rather than waiting on the async worker's DB write.
    await incrementLiveScanCount(slug)

    await scanQueue.add("log-scan" as string, {
      qrId,
      ip,
      userAgent,
      referrer,
      scannedAt: new Date().toISOString(),
      abVariantId,
    })
  } catch (err) {
    logger.error("Failed to queue scan job", { qrId, error: String(err) })
  }
}
