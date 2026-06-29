import { createHmac, randomBytes } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { prisma } from "../db/prisma.js"
import { AppError } from "../middleware/error.middleware.js"
import { logger } from "../logger/index.js"
import { env } from "../config/env.js"

export type WebhookEvent =
  | "qr.created"
  | "qr.updated"
  | "qr.deleted"
  | "qr.scanned"
  | "subscription.activated"
  | "subscription.cancelled"
  | "test"

export const WEBHOOK_EVENTS: WebhookEvent[] = [
  "qr.created",
  "qr.updated",
  "qr.deleted",
  "qr.scanned",
  "subscription.activated",
  "subscription.cancelled",
  "test",
]

const DELIVERY_TIMEOUT_MS = 10_000

/**
 * Validates a webhook URL against SSRF risks.
 * - Requires HTTPS in production.
 * - Blocks loopback, link-local, and RFC-1918 private addresses.
 */
function validateWebhookUrl(urlStr: string): void {
  let parsed: URL
  try {
    parsed = new URL(urlStr)
  } catch {
    throw new AppError(400, "Webhook URL is not a valid URL")
  }

  // Enforce HTTPS in production
  if (env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new AppError(400, "Webhook URL must use HTTPS in production")
  }

  if (!["https:", "http:"].includes(parsed.protocol)) {
    throw new AppError(400, "Webhook URL must use http or https")
  }

  // Block private/reserved IP ranges (SSRF prevention) — only in production
  if (env.NODE_ENV === "production") {
    const host = parsed.hostname.toLowerCase()
    const privatePattern = /^(localhost|::1|0\.0\.0\.0|127(\.\d+){3}|10(\.\d+){3}|172\.(1[6-9]|2\d|3[01])(\.\d+){2}|192\.168(\.\d+){2}|169\.254(\.\d+){2}|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])(\.\d+){2})$/
    if (privatePattern.test(host)) {
      throw new AppError(400, "Webhook URL must not target a private or loopback address")
    }
  }
}

export interface WebhookRecord {
  id: string
  name: string
  url: string
  events: string[]
  isActive: boolean
  createdAt: string
  deliveryCount: number
}

export async function listWebhooks(userId: string): Promise<WebhookRecord[]> {
  const hooks = await prisma.webhook.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { deliveries: true } } },
  })
  return hooks.map((h) => ({
    id: h.id,
    name: h.name,
    url: h.url,
    events: h.events,
    isActive: h.isActive,
    createdAt: h.createdAt.toISOString(),
    deliveryCount: h._count.deliveries,
  }))
}

export async function createWebhook(
  userId: string,
  name: string,
  url: string,
  events: string[],
  source?: "zapier" | "make" | "n8n",
): Promise<WebhookRecord & { secret: string }> {
  // Validate events
  const invalid = events.filter((e) => !WEBHOOK_EVENTS.includes(e as WebhookEvent))
  if (invalid.length > 0) throw new AppError(400, `Unknown webhook events: ${invalid.join(", ")}`)

  // Validate URL — protocol allowlist + SSRF prevention
  validateWebhookUrl(url)

  const count = await prisma.webhook.count({ where: { userId } })
  if (count >= 20) throw new AppError(400, "Maximum of 20 webhooks allowed per account")

  const secret = randomBytes(24).toString("hex")
  const hook = await prisma.webhook.create({
    data: { userId, name, url, events, secret, source: source ?? null },
    include: { _count: { select: { deliveries: true } } },
  })
  return {
    id: hook.id,
    name: hook.name,
    url: hook.url,
    events: hook.events,
    isActive: hook.isActive,
    createdAt: hook.createdAt.toISOString(),
    deliveryCount: hook._count.deliveries,
    secret: hook.secret,
  }
}

export async function updateWebhook(
  userId: string,
  webhookId: string,
  patch: { name?: string; url?: string; events?: string[]; isActive?: boolean },
): Promise<WebhookRecord> {
  const hook = await prisma.webhook.findFirst({ where: { id: webhookId, userId } })
  if (!hook) throw new AppError(404, "Webhook not found")

  if (patch.url) {
    validateWebhookUrl(patch.url)
  }
  if (patch.events) {
    const invalid = patch.events.filter((e) => !WEBHOOK_EVENTS.includes(e as WebhookEvent))
    if (invalid.length > 0) throw new AppError(400, `Unknown webhook events: ${invalid.join(", ")}`)
  }

  const updated = await prisma.webhook.update({
    where: { id: webhookId },
    data: patch,
    include: { _count: { select: { deliveries: true } } },
  })
  return {
    id: updated.id,
    name: updated.name,
    url: updated.url,
    events: updated.events,
    isActive: updated.isActive,
    createdAt: updated.createdAt.toISOString(),
    deliveryCount: updated._count.deliveries,
  }
}

export async function deleteWebhook(userId: string, webhookId: string): Promise<void> {
  const hook = await prisma.webhook.findFirst({ where: { id: webhookId, userId } })
  if (!hook) throw new AppError(404, "Webhook not found")
  await prisma.webhook.delete({ where: { id: webhookId } })
}

/**
 * Get a single webhook including its secret.
 * Used by the v1 API so integration clients (n8n trigger node) can fetch the
 * HMAC secret to verify inbound webhook signatures.
 */
export async function getWebhookWithSecret(
  userId: string,
  webhookId: string,
): Promise<WebhookRecord & { secret: string; source: string | null }> {
  const hook = await prisma.webhook.findFirst({
    where: { id: webhookId, userId },
    include: { _count: { select: { deliveries: true } } },
  })
  if (!hook) throw new AppError(404, "Webhook not found")
  return {
    id: hook.id,
    name: hook.name,
    url: hook.url,
    events: hook.events,
    isActive: hook.isActive,
    createdAt: hook.createdAt.toISOString(),
    deliveryCount: hook._count.deliveries,
    secret: hook.secret,
    source: hook.source,
  }
}

export async function getWebhookDeliveries(userId: string, webhookId: string) {
  const hook = await prisma.webhook.findFirst({ where: { id: webhookId, userId } })
  if (!hook) throw new AppError(404, "Webhook not found")

  return prisma.webhookDelivery.findMany({
    where: { webhookId },
    orderBy: { attemptedAt: "desc" },
    take: 50,
    select: {
      id: true,
      event: true,
      statusCode: true,
      success: true,
      attemptedAt: true,
      responseBody: true,
    },
  })
}

/**
 * Deliver a webhook event to all active matching webhooks for a user.
 * Fire-and-forget — errors are logged but never thrown to the caller.
 * Each failed delivery is scheduled for retry by the webhook retry worker.
 */
export async function deliverWebhookEvent(
  userId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  const hooks = await prisma.webhook.findMany({
    where: { userId, isActive: true, events: { has: event } },
    select: { id: true, url: true, secret: true },
  })

  await Promise.allSettled(
    hooks.map((hook) => attemptDelivery({
      webhookId: hook.id,
      url: hook.url,
      secret: hook.secret,
      event,
      payload,
    })),
  )
}

export const MAX_DELIVERY_ATTEMPTS = 5

/**
 * Exponential back-off schedule: delay before the N-th attempt.
 * attempt=1 failed → wait 30s for attempt 2
 * attempt=2 failed → wait 2m for attempt 3
 * attempt=3 failed → wait 8m for attempt 4
 * attempt=4 failed → wait 32m for attempt 5
 */
function backoffDelayMs(nextAttemptNumber: number): number {
  const base = 30_000
  return base * Math.pow(4, nextAttemptNumber - 2)
}

interface AttemptDeliveryInput {
  webhookId: string
  url: string
  secret: string
  event: string
  payload: Record<string, unknown>
  /** If provided, update this existing delivery row instead of creating a new one (retry path). */
  deliveryId?: string
  /** Current attempt number; defaults to 1 for first attempt. */
  attemptNumber?: number
  maxAttempts?: number
}

/**
 * Attempt a single webhook delivery, recording the outcome.
 * - First attempt creates a new WebhookDelivery row.
 * - Retries update the existing row and increment attemptNumber.
 * - On failure with attempts remaining, schedules nextRetryAt via exponential back-off.
 * - Exported so webhook-retry.worker can reuse the exact same logic.
 */
export async function attemptDelivery(input: AttemptDeliveryInput): Promise<void> {
  const {
    webhookId,
    url,
    secret,
    event,
    payload,
    deliveryId,
    attemptNumber = 1,
    maxAttempts = MAX_DELIVERY_ATTEMPTS,
  } = input

  const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload })
  const signature = createHmac("sha256", secret).update(body).digest("hex")

  let statusCode: number | null = null
  let responseBody: string | null = null
  let success = false
  let errorMessage: string | null = null

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-GenXQR-Signature": `sha256=${signature}`,
          "X-GenXQR-Event": event,
          "X-GenXQR-Attempt": String(attemptNumber),
          "User-Agent": "GenXQR-Webhooks/1.0",
        },
        body,
        signal: controller.signal,
      })
      statusCode = res.status
      responseBody = (await res.text()).slice(0, 1000) // cap stored response body
      success = res.ok
      if (!success) errorMessage = `HTTP ${res.status}`
    } finally {
      clearTimeout(timeoutId)
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Unknown error"
    responseBody = errorMessage
    logger.warn("Webhook delivery failed", { webhookId, url, event, attemptNumber, error: errorMessage })
  }

  // Compute next retry only if failed AND attempts remain
  const hasAttemptsRemaining = !success && attemptNumber < maxAttempts
  const nextRetryAt = hasAttemptsRemaining
    ? new Date(Date.now() + backoffDelayMs(attemptNumber + 1))
    : null

  if (deliveryId) {
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        statusCode,
        responseBody,
        success,
        attemptedAt: new Date(),
        attemptNumber,
        nextRetryAt,
        lastError: success ? null : errorMessage,
      },
    })
  } else {
    await prisma.webhookDelivery.create({
      data: {
        webhookId,
        event,
        payload: payload as Prisma.InputJsonValue,
        statusCode,
        responseBody,
        success,
        attemptNumber,
        maxAttempts,
        nextRetryAt,
        lastError: success ? null : errorMessage,
      },
    })
  }
}

/**
 * Send a test ping to a specific webhook.
 */
export async function testWebhook(userId: string, webhookId: string): Promise<{ success: boolean; statusCode: number | null }> {
  const hook = await prisma.webhook.findFirst({ where: { id: webhookId, userId } })
  if (!hook) throw new AppError(404, "Webhook not found")

  // Test pings are one-shot — no retries
  await attemptDelivery({
    webhookId: hook.id,
    url: hook.url,
    secret: hook.secret,
    event: "test",
    payload: { message: "This is a test event from GenXQR", webhookId: hook.id },
    maxAttempts: 1,
  })

  const latest = await prisma.webhookDelivery.findFirst({
    where: { webhookId: hook.id, event: "test" },
    orderBy: { attemptedAt: "desc" },
    select: { success: true, statusCode: true },
  })

  return { success: latest?.success ?? false, statusCode: latest?.statusCode ?? null }
}
