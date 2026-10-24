/**
 * Webhook Retry Worker
 *
 * Periodically scans WebhookDelivery rows that are due for retry
 * (success = false, nextRetryAt <= now, attemptNumber < maxAttempts)
 * and re-attempts delivery using the shared attemptDelivery() logic.
 *
 * Runs as a setInterval in the main process — delivery volume is moderate,
 * so a dedicated BullMQ queue is unnecessary complexity.
 */

import { prisma } from "../db/prisma.js"
import { logger } from "../logger/index.js"
import { attemptDelivery } from "../services/webhook.service.js"

const RETRY_SCAN_INTERVAL_MS = 60_000
const BATCH_SIZE = 50

let intervalHandle: NodeJS.Timeout | null = null
let isScanning = false

/**
 * Takes a due retry for this process. Conditional on the nextRetryAt it was
 * read with, so of several processes reading the same row, exactly one wins.
 */
export async function claimDelivery(id: string, nextRetryAt: Date | null): Promise<boolean> {
  const claimed = await prisma.webhookDelivery.updateMany({
    where: { id, success: false, nextRetryAt },
    data: { nextRetryAt: null },
  })
  return claimed.count === 1
}

async function scanAndRetry(): Promise<void> {
  if (isScanning) return // prevent overlapping runs if a batch is slow
  isScanning = true
  try {
    const now = new Date()
    const pending = await prisma.webhookDelivery.findMany({
      where: {
        success: false,
        nextRetryAt: { lte: now, not: null },
      },
      include: {
        webhook: {
          select: { url: true, secret: true, isActive: true, userId: true },
        },
      },
      orderBy: { nextRetryAt: "asc" },
      take: BATCH_SIZE,
    })

    if (pending.length === 0) return

    logger.info("Webhook retry scan — processing batch", { count: pending.length })

    await Promise.allSettled(
      pending.map(async (delivery) => {
        // Claim it. PM2 runs this loop in every process (one per CPU), so
        // without a claim each due retry went out once per process. Only the
        // process whose conditional update matches the row sends it.
        if (!(await claimDelivery(delivery.id, delivery.nextRetryAt))) return

        // Skip if the webhook was deleted or deactivated after initial failure
        if (!delivery.webhook.isActive) {
          await prisma.webhookDelivery.update({
            where: { id: delivery.id },
            data: { nextRetryAt: null, lastError: "Webhook deactivated — retries halted" },
          })
          return
        }

        // Webhooks are part of API access: an account that dropped below Pro
        // stops getting retries too, not just new deliveries.
        const { getPlanLimitsReadOnly } = await import("../services/billing.service.js")
        if (!(await getPlanLimitsReadOnly(delivery.webhook.userId)).apiAccess) {
          await prisma.webhookDelivery.update({
            where: { id: delivery.id },
            data: { nextRetryAt: null, lastError: "Plan no longer includes webhooks — retries halted" },
          })
          return
        }

        // Guard against exceeding maxAttempts (should be enforced by attemptDelivery,
        // but belt-and-braces)
        if (delivery.attemptNumber >= delivery.maxAttempts) {
          await prisma.webhookDelivery.update({
            where: { id: delivery.id },
            data: { nextRetryAt: null },
          })
          return
        }

        await attemptDelivery({
          webhookId: delivery.webhookId,
          url: delivery.webhook.url,
          secret: delivery.webhook.secret,
          event: delivery.event,
          payload: delivery.payload as Record<string, unknown>,
          deliveryId: delivery.id,
          attemptNumber: delivery.attemptNumber + 1,
          maxAttempts: delivery.maxAttempts,
        })
      }),
    )
  } catch (err) {
    logger.error("Webhook retry worker scan error", {
      error: err instanceof Error ? err.message : String(err),
    })
  } finally {
    isScanning = false
  }
}

export function startWebhookRetryWorker(): void {
  if (intervalHandle) return
  intervalHandle = setInterval(() => {
    void scanAndRetry()
  }, RETRY_SCAN_INTERVAL_MS)
  logger.info("Webhook retry worker started", { intervalMs: RETRY_SCAN_INTERVAL_MS })
}

export async function stopWebhookRetryWorker(): Promise<void> {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
    logger.info("Webhook retry worker stopped")
  }
  // Wait for any in-flight scan to finish
  const deadline = Date.now() + 15_000
  while (isScanning && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}
