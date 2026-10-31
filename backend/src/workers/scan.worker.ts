import { Worker, type Job } from "bullmq"
import { prisma } from "../db/prisma.js"
import { env } from "../config/env.js"
import { logger } from "../logger/index.js"
import type { ScanJobData } from "../services/scan.service.js"
import { lookupGeo } from "../services/geo.service.js"
import { deliverWebhookEvent } from "../services/webhook.service.js"
import { parseUA } from "../utils/user-agent.util.js"
import { checkAndNotifyLimit } from "../services/limit-notification.service.js"
import { getScanQuota, getScanUsage } from "../services/scan-quota.service.js"
import { maybeSendScanMilestone } from "../services/engagement-email.service.js"
import { getUserPlanLimits } from "../services/billing.service.js"

// ─── Worker process function ───────────────────────────────────────────────────

export async function processScanJob(job: Pick<Job<ScanJobData>, "data">): Promise<void> {
  const { qrId, ip, userAgent, referrer, scannedAt, abVariantId } = job.data
  // Jobs queued before this field existed are treated as unique, which is what
  // they were: the old pipeline only ever enqueued unique scans.
  const isUnique = job.data.isUnique ?? true

  const { deviceType, os, browser } = parseUA(userAgent)
  const { country, countryCode, city, region, lat, lng } = await lookupGeo(ip)
  const scannedAtDate = new Date(scannedAt)

  // Every count for this scan in ONE transaction. They used to be separate
  // writes with attempts: 3 on the job, so a late failure (e.g. the A/B variant
  // deleted meanwhile — no foreign key, so the update threw) replayed the job
  // and counted the scan, the totals and the webhook again. Now a retry either
  // finds nothing written or redoes it all once.
  const dateOnly = new Date(
    Date.UTC(scannedAtDate.getUTCFullYear(), scannedAtDate.getUTCMonth(), scannedAtDate.getUTCDate()),
  )
  const updated = await prisma.$transaction(async (tx) => {
    await tx.qRScan.create({
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

    // Global scan counter + lastScannedAt
    const row = await tx.qRCode.update({
      where: { id: qrId },
      data: {
        scanCount: { increment: 1 },
        ...(isUnique && { uniqueScanCount: { increment: 1 } }),
        lastScannedAt: scannedAtDate,
      },
      select: { userId: true, name: true, slug: true, scanCount: true },
    })

    // Daily aggregate — for every code, owned or not (an early return for
    // ownerless codes used to skip it).
    await tx.qRScanDaily.upsert({
      where: { qrId_date: { qrId, date: dateOnly } },
      create: { qrId, date: dateOnly, count: 1, uniqueCount: isUnique ? 1 : 0 },
      update: {
        count: { increment: 1 },
        ...(isUnique && { uniqueCount: { increment: 1 } }),
      },
    })

    // A/B variant counter; updateMany, so a variant deleted since the scan is a no-op.
    if (abVariantId) {
      await tx.aBTestVariant.updateMany({
        where: { id: abVariantId },
        data: { scanCount: { increment: 1 } },
      })
    }
    return row
  })

  // 100 / 1,000 / 10,000-scan milestone email (fire-and-forget, deduped).
  void maybeSendScanMilestone(qrId, updated.scanCount).catch((err) =>
    logger.warn("Milestone check failed", { qrId, error: String(err) }),
  )

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
          // The enforced window and count (scan-quota.service.ts) — the email
          // must report the same number the scans are refused at.
          const quota = await getScanQuota(updated.userId!)
          const monthlyScans = await getScanUsage(updated.userId!, quota)
          await checkAndNotifyLimit(updated.userId!, "scans", monthlyScans, limits.scanLimitPerMonth, planName, {
            periodKey: `scans-${quota.windowStart.toISOString().slice(0, 10)}`,
            resetsAt: quota.windowEnd,
          })
        }
      } catch (err) {
        logger.warn("Scan limit check failed", { userId: updated.userId, error: String(err) })
      }
    })()
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
