/**
 * Cashfree Payments API client.
 *
 * A thin, dependency-free wrapper over the three Cashfree calls this app makes,
 * kept separate from billing.service.ts so gateway mechanics (auth headers,
 * timeouts, signature maths) stay out of the subscription logic.
 *
 * Docs, verified 2026-08-14:
 *   Create order  POST {base}/pg/orders
 *   Get order     GET  {base}/pg/orders/{order_id}
 *   Webhook sig   base64(HMAC-SHA256(timestamp + rawBody, secretKey))
 *   https://www.cashfree.com/docs/api-reference/payments/latest/orders/create
 *   https://www.cashfree.com/docs/payments/online/webhooks/signature-verification
 *
 * Auth is a pair of static headers (x-client-id / x-client-secret) plus a
 * version header that pins the request AND response shape.
 */

import crypto from "crypto"
import { env } from "../config/env.js"
import { AppError } from "../middleware/error.middleware.js"
import { logger } from "../logger/index.js"

/** Cashfree rejects a request that takes too long far less gracefully than we do. */
const REQUEST_TIMEOUT_MS = 15_000

/** Order states Cashfree can report. Only PAID means money actually moved. */
export type CashfreeOrderStatus =
  | "ACTIVE"
  | "PAID"
  | "EXPIRED"
  | "TERMINATED"
  | "TERMINATION_REQUESTED"

export interface CashfreeOrder {
  cf_order_id: string
  order_id: string
  order_status: CashfreeOrderStatus
  order_amount: number
  order_currency: string
  payment_session_id?: string
  order_tags?: Record<string, string> | null
}

export interface CreateOrderInput {
  orderId: string
  amount: number            // major units (rupees) — Cashfree takes a decimal, not paise
  currency: string
  customer: {
    id: string
    name: string
    email: string
    phone: string           // exactly 10 digits
  }
  returnUrl: string
  /**
   * Per-order webhook URL (order_meta.notify_url). Cashfree POSTs the payment
   * result here server-to-server, which is what makes activation survive the
   * user closing the tab mid-redirect.
   *
   * Must be HTTPS and at most 250 characters, per Cashfree. Omit it and this
   * order simply gets no webhook.
   */
  notifyUrl?: string
  /** Server-set metadata echoed back by Get Order. Never populated from client input. */
  tags?: Record<string, string>
  /** Minutes until the order can no longer be paid. */
  expiryMinutes?: number
}

/** Cashfree's documented ceiling for return_url / notify_url. */
export const MAX_CALLBACK_URL_LENGTH = 250

function getConfig(): { appId: string; secretKey: string; base: string; version: string } {
  const appId = env.CASHFREE_APP_ID
  const secretKey = env.CASHFREE_SECRET_KEY
  if (!appId || !secretKey) {
    throw new AppError(
      503,
      "Payment gateway is not configured. Add CASHFREE_APP_ID and CASHFREE_SECRET_KEY to your .env file.",
    )
  }
  return {
    appId,
    secretKey,
    // Tolerate a trailing slash in the configured base so URL building can't
    // produce a double slash, which Cashfree 404s on.
    base: env.CASHFREE_API_BASE.replace(/\/+$/, ""),
    version: env.CASHFREE_API_VERSION,
  }
}

/** True when the gateway has credentials configured — lets callers degrade gracefully. */
export function isCashfreeConfigured(): boolean {
  return Boolean(env.CASHFREE_APP_ID && env.CASHFREE_SECRET_KEY)
}

/**
 * Issues an authenticated request to Cashfree.
 *
 * Failures are surfaced as AppError so error.middleware renders them in the
 * app's standard shape, and the gateway's own message is logged but not echoed
 * to the client — it can contain merchant-account detail.
 */
async function cashfreeRequest<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const { appId, secretKey, base, version } = getConfig()
  const url = `${base}${path}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers: {
        "x-client-id": appId,
        "x-client-secret": secretKey,
        "x-api-version": version,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    })
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError"
    logger.error("Cashfree request failed", {
      method,
      path,
      reason: aborted ? "timeout" : err instanceof Error ? err.message : String(err),
    })
    throw new AppError(
      502,
      aborted
        ? "The payment gateway did not respond in time. Please try again."
        : "Could not reach the payment gateway. Please try again.",
    )
  } finally {
    clearTimeout(timeout)
  }

  const text = await response.text()
  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : {}
  } catch {
    logger.error("Cashfree returned a non-JSON response", { path, status: response.status, body: text.slice(0, 400) })
    throw new AppError(502, "The payment gateway returned an unreadable response.")
  }

  if (!response.ok) {
    const detail = parsed as { message?: string; code?: string; type?: string }

    // 401/403 almost always means the key pair does not match the configured
    // environment: sandbox and production have SEPARATE credentials, so pointing
    // CASHFREE_API_BASE at one while holding the other's keys fails here. That is
    // a configuration mistake with a specific fix, so say so in the log rather
    // than leaving a bare "rejected the request".
    if (response.status === 401 || response.status === 403) {
      const environment = base.includes("sandbox") ? "SANDBOX" : "PRODUCTION"
      logger.error(
        `Cashfree rejected the credentials (${response.status}). CASHFREE_API_BASE points at ${environment}, ` +
          `so CASHFREE_APP_ID and CASHFREE_SECRET_KEY must be the ${environment} key pair — ` +
          `the two environments do not share credentials.`,
        { path, status: response.status, code: detail.code, message: detail.message, base },
      )
      throw new AppError(
        502,
        "The payment gateway rejected our credentials. This is a configuration problem on our side — please contact support.",
      )
    }

    logger.error("Cashfree API error", {
      path,
      status: response.status,
      code: detail.code,
      type: detail.type,
      message: detail.message,
    })
    // 4xx here is our bug or a merchant-config problem, not the user's, so it is
    // reported as a gateway failure rather than blamed on their request.
    throw new AppError(502, "The payment gateway rejected the request. Please try again or contact support.")
  }

  return parsed as T
}

/**
 * Creates a Cashfree order and returns it, including the payment_session_id the
 * browser SDK needs to open checkout.
 *
 * The amount is whatever the caller passes — the caller is responsible for
 * deriving it server-side from trusted plan pricing, never from the client.
 */
export async function createOrder(input: CreateOrderInput): Promise<CashfreeOrder> {
  const body: Record<string, unknown> = {
    order_id: input.orderId,
    // Cashfree takes rupees as a decimal number. Two decimal places, because
    // floats such as 2988.0000000001 are rejected as a mismatch.
    order_amount: Number(input.amount.toFixed(2)),
    order_currency: input.currency,
    customer_details: {
      customer_id: input.customer.id,
      customer_name: input.customer.name,
      customer_email: input.customer.email,
      customer_phone: input.customer.phone,
    },
    order_meta: {
      return_url: input.returnUrl,
      // Only sent when supplied AND usable. Cashfree rejects a non-HTTPS
      // notify_url, which would fail the whole order rather than just skipping
      // the webhook — so an unusable value is dropped here instead.
      ...(input.notifyUrl ? { notify_url: input.notifyUrl } : {}),
    },
  }

  for (const [field, value] of [
    ["return_url", input.returnUrl],
    ["notify_url", input.notifyUrl],
  ] as const) {
    if (value && value.length > MAX_CALLBACK_URL_LENGTH) {
      logger.error(`Cashfree ${field} exceeds the ${MAX_CALLBACK_URL_LENGTH}-character limit`, {
        length: value.length,
      })
      throw new AppError(500, "Payment callback URL is too long. Please contact support.")
    }
  }

  if (input.tags) body["order_tags"] = input.tags
  if (input.expiryMinutes) {
    body["order_expiry_time"] = new Date(Date.now() + input.expiryMinutes * 60_000).toISOString()
  }

  return cashfreeRequest<CashfreeOrder>("POST", "/orders", body)
}

/**
 * Fetches an order's authoritative state.
 *
 * This is the only trustworthy way to confirm a payment from the browser's
 * return trip: the return URL itself carries no proof, so its query string is
 * treated purely as a hint about *which* order to look up.
 */
export async function getOrder(orderId: string): Promise<CashfreeOrder> {
  return cashfreeRequest<CashfreeOrder>("GET", `/orders/${encodeURIComponent(orderId)}`)
}

/**
 * Verifies a webhook's authenticity.
 *
 * Cashfree signs `timestamp + rawBody` with the merchant secret key, so this
 * MUST be given the exact bytes received. Re-serialising the parsed JSON changes
 * key order and whitespace and the signature will never match.
 *
 * Returns false rather than throwing so the caller decides the HTTP response.
 */
export function verifyWebhookSignature(
  rawBody: string,
  timestamp: string,
  signature: string,
): boolean {
  const secretKey = env.CASHFREE_SECRET_KEY
  if (!secretKey || !rawBody || !timestamp || !signature) return false

  const expected = crypto
    .createHmac("sha256", secretKey)
    .update(timestamp + rawBody)
    .digest("base64")

  // Constant-time compare. timingSafeEqual throws on a length mismatch, which
  // itself leaks nothing useful here, but must not surface as a 500.
  const a = Buffer.from(expected, "utf8")
  const b = Buffer.from(signature, "utf8")
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}
