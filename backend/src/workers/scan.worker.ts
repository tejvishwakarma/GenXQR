import { Worker, type Job } from "bullmq"
import { prisma } from "../db/prisma.js"
import { env } from "../config/env.js"
import { logger } from "../logger/index.js"
import type { ScanJobData } from "../services/scan.service.js"
import { lookupGeo } from "../services/geo.service.js"
import { deliverWebhookEvent } from "../services/webhook.service.js"
import type { DeviceType } from "@prisma/client"
import { checkAndNotifyLimit } from "../services/limit-notification.service.js"
import { getUserPlanLimits } from "../services/billing.service.js"

// ─── User-Agent Parser ─────────────────────────────────────────────────────────

interface UAInfo {
  deviceType: DeviceType
  os: string | null
  browser: string | null
}

function parseUA(ua: string | undefined): UAInfo {
  if (!ua) return { deviceType: "UNKNOWN", os: null, browser: null }

  const lower = ua.toLowerCase()

  // Device type
  let deviceType: DeviceType = "DESKTOP"
  if (/tablet|ipad/.test(lower)) {
    deviceType = "TABLET"
  } else if (/mobile|android.*mobile|iphone|ipod|blackberry|windows phone/.test(lower)) {
    deviceType = "MOBILE"
  }

  // OS detection
  let os: string | null = null
  if (/iphone|ipad|ipod/.test(lower)) {
    os = "iOS"
  } else if (/android/.test(lower)) {
    os = "Android"
  } else if (/windows nt/.test(lower)) {
    os = "Windows"
  } else if (/macintosh|mac os x/.test(lower)) {
    os = "macOS"
  } else if (/linux/.test(lower)) {
    os = "Linux"
  }

  // Browser detection (order matters — check Edge before Chrome)
  let browser: string | null = null
  if (/edg\/|edge\//.test(lower)) {
    browser = "Edge"
  } else if (/opr\/|opera\//.test(lower)) {
    browser = "Opera"
  } else if (/samsung/.test(lower)) {
    browser = "Samsung Browser"
  } else if (/firefox\//.test(lower)) {
    browser = "Firefox"
  } else if (/chrome\//.test(lower)) {
    browser = "Chrome"
  } else if (/safari\//.test(lower)) {
    browser = "Safari"
  }

  return { deviceType, os, browser }
}

// ─── Worker process function ───────────────────────────────────────────────────

async function processScanJob(job: Job<ScanJobData>): Promise<void> {
  const { qrId, ip, userAgent, referrer, scannedAt, abVariantId } = job.data
  // Jobs queued before this field existed are treated as unique, which is what
  // they were: the old pipeline only ever enqueued unique scans.
  const isUnique = job.data.isUnique ?? true

  const { deviceType, os, browser } = parseUA(userAgent)
  const { country, countryCode, city, region, lat, lng } = await lookupGeo(ip)
  const scannedAtDate = new Date(scannedAt)

  // Insert scan record
  await prisma.qRScan.create({
    data: {
      qrId,
      ip,
      deviceType,
      os,
      browser,
      userAgent: userAgent ?? null,
      referrer: referrer ?? null,
      scannedAt: scannedAtDate,
      isUnique,
      abVariantId: abVariantId ?? null,
      country,
      countryCode,
      city,
      region,
      lat,
      lng,
    },
  })

  // Increment global scan counter + set lastScannedAt
  const updated = await prisma.qRCode.update({
    where: { id: qrId },
    data: {
      scanCount: { increment: 1 },
      ...(isUnique && { uniqueScanCount: { increment: 1 } }),
      lastScannedAt: scannedAtDate,
    },
    select: { userId: true, name: true, slug: true },
  })

  // Fire qr.scanned webhook event (fire-and-forget)
  if (!updated.userId) return
  void deliverWebhookEvent(updated.userId, "qr.scanned", {
    qrId,
    name: updated.name,
    slug: updated.slug,
    scannedAt: scannedAtDate.toISOString(),
  })

  // Check monthly scan limit and notify if threshold crossed (fire-and-forget)
  if (updated.userId) {
    void (async () => {
      try {
        const { limits, planName } = await getUserPlanLimits(updated.userId!)
        if (limits.scanLimitPerMonth > 0) {
          const monthStart = new Date()
          monthStart.setUTCDate(1)
          monthStart.setUTCHours(0, 0, 0, 0)
          const monthlyScans = await prisma.qRScan.count({
            // Must match the quota rule in billing.routes.ts — every scan, repeats
            // included — or the "near your limit" email reports a different number
            // than the billing page.
            where: { qrCode: { userId: updated.userId }, scannedAt: { gte: monthStart } },
          })
          await checkAndNotifyLimit(updated.userId!, "scans", monthlyScans, limits.scanLimitPerMonth, planName)
        }
      } catch (err) {
        logger.warn("Scan limit check failed", { userId: updated.userId, error: String(err) })
      }
    })()
  }

  // Upsert daily aggregate
  const dateOnly = new Date(
    Date.UTC(scannedAtDate.getUTCFullYear(), scannedAtDate.getUTCMonth(), scannedAtDate.getUTCDate()),
  )
  await prisma.qRScanDaily.upsert({
    where: { qrId_date: { qrId, date: dateOnly } },
    create: { qrId, date: dateOnly, count: 1, uniqueCount: isUnique ? 1 : 0 },
    update: {
      count: { increment: 1 },
      ...(isUnique && { uniqueCount: { increment: 1 } }),
    },
  })

  // Increment A/B variant counter if applicable
  if (abVariantId) {
    await prisma.aBTestVariant.update({
      where: { id: abVariantId },
      data: { scanCount: { increment: 1 } },
    })
  }

  logger.debug("Scan logged", { qrId, deviceType, os, browser })
}

// ─── Worker instance ───────────────────────────────────────────────────────────

let scanWorker: Worker<ScanJobData> | null = null

export function startScanWorker(): void {
  if (scanWorker) return

  scanWorker = new Worker<ScanJobData>("scan-log", processScanJob, {
    connection: { url: env.REDIS_URL },
    concurrency: 5,
  })

  scanWorker.on("completed", (job) => {
    logger.debug("Scan job completed", { jobId: job.id })
  })

  scanWorker.on("failed", (job, err) => {
    logger.error("Scan job failed", { jobId: job?.id, error: err.message })
  })

  logger.info("Scan worker started")
}

export async function stopScanWorker(): Promise<void> {
  if (scanWorker) {
    await scanWorker.close()
    scanWorker = null
    logger.info("Scan worker stopped")
  }
}
