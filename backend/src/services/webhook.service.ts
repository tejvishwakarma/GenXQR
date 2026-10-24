import { createHmac, randomBytes } from "node:crypto"
import { lookup } from "node:dns/promises"
import http from "node:http"
import https from "node:https"
import net from "node:net"
import { isNonPublicAddress } from "../utils/ip-classify.util.js"
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

  // Block private/reserved addresses (SSRF prevention) — only in production.
  // A hostname is checked again, by what it resolves to, at delivery time.
  if (env.NODE_ENV === "production") {
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "")
    if (host === "localhost" || host.endsWith(".localhost") || (net.isIP(host) && isNonPublicAddress(host))) {
      throw new AppError(400, "Webhook URL must not target a private or loopback address")
    }
  }
}

/**
 * Resolves the URL's host ONCE, refuses if any address is non-public, and
 * returns the address the request must connect to. Pinning matters: checking
 * one lookup and then letting the HTTP client resolve again allowed DNS
 * rebinding (a 0-TTL record answering public, then internal). Production only,
 * to keep local receivers testable in development (returns null: no pinning).
 */
export async function resolvePinnedAddress(parsed: URL): Promise<{ address: string; family: 4 | 6 } | null> {
  if (env.NODE_ENV !== "production") return null
  const host = parsed.hostname.replace(/^\[|\]$/g, "")
  const addresses = net.isIP(host)
    ? [{ address: host, family: net.isIP(host) as 4 | 6 }]
    : (await lookup(host, { all: true })).map((e) => ({ address: e.address, family: e.family as 4 | 6 }))
  if (addresses.length === 0) throw new AppError(400, "Webhook URL host could not be resolved")
  if (addresses.some((a) => isNonPublicAddress(a.address))) {
    throw new AppError(400, "Webhook URL must not resolve to a private, loopback, or link-local address")
  }
  return addresses[0]!
}

/** Largest response body kept (and read) from a webhook endpoint. */
const MAX_RESPONSE_BYTES = 1000

/**
 * POSTs a webhook. Connects to `pinned` when given (never re-resolving the
 * host), follows no redirects, and stops reading after MAX_RESPONSE_BYTES —
 * `await res.text()` used to buffer whatever a hostile endpoint streamed in
 * the 10 s window before truncating it.
 */
export function postWebhook(
  url: URL,
  headers: Record<string, string>,
  body: string,
  pinned: { address: string; family: 4 | 6 } | null,
  timeoutMs: number,
): Promise<{ status: number; text: string }> {
  const mod = url.protocol === "https:" ? https : http
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => { if (!settled) { settled = true; fn() } }
    const req = mod.request(
      url,
      {
        method: "POST",
        headers: { ...headers, "Content-Length": String(Buffer.byteLength(body)) },
        timeout: timeoutMs,
        ...(pinned
          ? {
              // TLS still verifies the certificate against the URL's hostname.
              lookup: ((_host: string, opts: { all?: boolean }, cb: (...args: unknown[]) => void) => {
                if (opts?.all) cb(null, [{ address: pinned.address, family: pinned.family }])
                else cb(null, pinned.address, pinned.family)
              }) as unknown as net.LookupFunction,
            }
          : {}),
      },
      (res) => {
        const chunks: Buffer[] = []
        let size = 0
        const done = () => finish(() => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8").slice(0, MAX_RESPONSE_BYTES) }))
        res.on("data", (chunk: Buffer) => {
          if (size < MAX_RESPONSE_BYTES) chunks.push(chunk)
          size += chunk.length
          if (size >= MAX_RESPONSE_BYTES) { done(); res.destroy() }
        })
        res.on("end", done)
        res.on("close", done)
        res.on("error", done)
      },
    )
    req.on("timeout", () => req.destroy(new Error("This operation was aborted")))
    req.on("error", (err) => finish(() => reject(err)))
    req.end(body)
  })
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
  // Never rejects. Callers fire this and forget it (`void deliverWebhookEvent`),
  // and an unhandled rejection exits the process (index.ts) — so one database
  // timeout here used to take the whole API down.
  try {
    await deliverWebhookEventUnsafe(userId, event, payload)
  } catch (err) {
    logger.error("Webhook event delivery failed", { userId, event, error: err instanceof Error ? err.message : String(err) })
  }
}

async function deliverWebhookEventUnsafe(
  userId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  const hooks = await prisma.webhook.findMany({
    where: { userId, isActive: true, events: { has: event } },
    select: { id: true, url: true, secret: true },
  })
  if (hooks.length === 0) return

  // Webhooks are part of API access (Pro and above). Creating and managing them
  // was already gated, but delivery was not, so an account that dropped below
  // Pro kept receiving events indefinitely. Its webhooks stay saved and resume
  // when the plan does. Dynamic import: billing.service imports this module.
  const { getPlanLimitsReadOnly } = await import("./billing.service.js")
  if (!(await getPlanLimitsReadOnly(userId)).apiAccess) return

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

/** Whether any active webhook of this account listens for `event` (to skip building costly payloads). */
export async function hasWebhookSubscribers(userId: string, event: WebhookEvent): Promise<boolean> {
  const n = await prisma.webhook.count({ where: { userId, isActive: true, events: { has: event } } })
  return n > 0
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
    // Resolve and check the host now, then connect to exactly that address
    // (defeats DNS rebinding). No redirects are followed, so a public endpoint
    // cannot bounce the request to an internal target.
    const parsed = new URL(url)
    const pinned = await resolvePinnedAddress(parsed)
    const res = await postWebhook(
      parsed,
      {
        "Content-Type": "application/json",
        "X-GenXQR-Signature": `sha256=${signature}`,
        "X-GenXQR-Event": event,
        "X-GenXQR-Attempt": String(attemptNumber),
        "User-Agent": "GenXQR-Webhooks/1.0",
      },
      body,
      pinned,
      DELIVERY_TIMEOUT_MS,
    )
    statusCode = res.status
    responseBody = res.text
    success = res.status >= 200 && res.status < 300
    if (!success) errorMessage = `HTTP ${res.status}`
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
