/**
 * Billing Service — PayU Bolt payment integration + plan limit enforcement.
 *
 * Flow:
 *   1. Client calls POST /api/billing/create-order  → returns PayU Bolt params + hash
 *   2. Frontend launches PayU Bolt popup; user pays
 *   3. Client calls POST /api/billing/verify-payment with PayU response data
 *   4. We verify the reverse SHA-512 hash, activate subscription, create invoice
 */

import crypto from "crypto"
import type { PlanName, SubscriptionStatus } from "@prisma/client"
import { prisma } from "../db/prisma.js"
import { env } from "../config/env.js"
import { AppError } from "../middleware/error.middleware.js"
import { logger } from "../logger/index.js"
import { deliverWebhookEvent } from "./webhook.service.js"

// ─── Plan constants (mirrors seed data) ───────────────────────────────────────

export interface PlanLimits {
  dynamicQRLimit: number
  scanLimitPerMonth: number
  fileStorageGB: number
  teamSeatsLimit: number
  apiCallsLimit: number
  analyticsRetentionDays: number
  bulkGeneration: boolean
  apiAccess: boolean
  customDomains: boolean
  whiteLabel: boolean
  prioritySupport: boolean
  abTesting: boolean
  smartRouting: boolean
  qrExpiry: boolean
}

export const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  FREE: {
    dynamicQRLimit: 0,   // Post-trial: no QR creation without a paid subscription
    scanLimitPerMonth: 0,
    fileStorageGB: 0,
    teamSeatsLimit: 1,
    apiCallsLimit: 0,
    analyticsRetentionDays: 30,
    bulkGeneration: false,
    apiAccess: false,
    customDomains: false,
    whiteLabel: false,
    prioritySupport: false,
    abTesting: false,
    smartRouting: false,
    qrExpiry: false,
  },
  STARTER: {
    dynamicQRLimit: 50,
    scanLimitPerMonth: 5000,
    fileStorageGB: 1,
    teamSeatsLimit: 1,
    apiCallsLimit: 0,
    analyticsRetentionDays: 90,
    bulkGeneration: false,
    apiAccess: false,
    customDomains: false,
    whiteLabel: false,
    prioritySupport: false,
    abTesting: false,
    smartRouting: false,
    qrExpiry: true,
  },
  PRO: {
    dynamicQRLimit: 250,
    scanLimitPerMonth: 50000,
    fileStorageGB: 5,
    teamSeatsLimit: 5,
    apiCallsLimit: 10000,
    analyticsRetentionDays: 365,
    bulkGeneration: true,
    apiAccess: true,
    customDomains: true,
    whiteLabel: false,
    prioritySupport: false,
    abTesting: true,
    smartRouting: true,
    qrExpiry: true,
  },
  BUSINESS: {
    dynamicQRLimit: 2000,
    scanLimitPerMonth: 500000,
    fileStorageGB: 50,
    teamSeatsLimit: 20,
    apiCallsLimit: 100000,
    analyticsRetentionDays: 730,
    bulkGeneration: true,
    apiAccess: true,
    customDomains: true,
    whiteLabel: true,
    prioritySupport: true,
    abTesting: true,
    smartRouting: true,
    qrExpiry: true,
  },
  ENTERPRISE: {
    dynamicQRLimit: 999999,
    scanLimitPerMonth: 999999999,
    fileStorageGB: 1000,
    teamSeatsLimit: 999,
    apiCallsLimit: 999999999,
    analyticsRetentionDays: 999999,
    bulkGeneration: true,
    apiAccess: true,
    customDomains: true,
    whiteLabel: true,
    prioritySupport: true,
    abTesting: true,
    smartRouting: true,
    qrExpiry: true,
  },
}

export const PLAN_PRICES_INR: Record<PlanName, { monthly: number; yearly: number }> = {
  FREE:       { monthly: 0,    yearly: 0     },
  STARTER:    { monthly: 299,  yearly: 2988  },
  PRO:        { monthly: 799,  yearly: 7788  },
  BUSINESS:   { monthly: 2499, yearly: 23988 },
  ENTERPRISE: { monthly: 9999, yearly: 99990 },
}

// ─── PayU config ──────────────────────────────────────────────────────────────

function getPayUConfig(): { key: string; salt: string; baseUrl: string } {
  const key  = env.PAYU_MERCHANT_KEY
  const salt = env.PAYU_MERCHANT_SALT
  if (!key || !salt) {
    throw new AppError(503, "Payment gateway is not configured. Add PAYU_MERCHANT_KEY and PAYU_MERCHANT_SALT to your .env file.")
  }
  return { key, salt, baseUrl: env.PAYU_BASE_URL }
}

/**
 * Compute the forward SHA-512 hash for PayU prebuilt checkout.
 *
 * PayU spec (17 fields, 16 pipes):
 *   SHA512(key|txnid|amount|productinfo|firstname|email|
 *          udf1|udf2|udf3|udf4|udf5||||||SALT)
 *
 *   udf1 = planName  udf2 = billingCycle  udf3 = userId
 *   udf4, udf5 = empty; positions 12-16 = 5 reserved empty padding fields
 */
function computePayUHash(params: {
  key: string; salt: string; txnid: string; amount: string
  productinfo: string; firstname: string; email: string
  udf1?: string; udf2?: string; udf3?: string
}): string {
  const { key, salt, txnid, amount, productinfo, firstname, email, udf1 = "", udf2 = "", udf3 = "" } = params
  const hashString = [
    key, txnid, amount, productinfo, firstname, email,
    udf1, udf2, udf3,   // udf3 = userId for callback identification
    "", "",             // udf4, udf5 (unused)
    "", "", "", "", "", // 5 reserved padding fields
    salt,
  ].join("|")
  return crypto.createHash("sha512").update(hashString).digest("hex")
}

/**
 * Verify the reverse hash PayU sends in the payment callback POST.
 * Formula: SHA512(SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
 */
function verifyPayUHash(params: {
  key: string; salt: string; status: string; txnid: string; amount: string
  productinfo: string; firstname: string; email: string
  udf1?: string; udf2?: string; udf3?: string; responseHash: string
}): boolean {
  const { key, salt, status, txnid, amount, productinfo, firstname, email, udf1 = "", udf2 = "", udf3 = "", responseHash } = params
  const hashString = [
    salt, status,
    "", "", "", "", "",  // 5 empty reversed padding fields
    "",                  // udf5
    "",                  // udf4
    udf3,                // userId
    udf2, udf1,
    email, firstname, productinfo, amount, txnid, key,
  ].join("|")
  const expected = crypto.createHash("sha512").update(hashString).digest("hex")
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(responseHash, "hex"))
  } catch {
    return false
  }
}

// ─── Subscription helpers ──────────────────────────────────────────────────────

/**
 * Get or create a user's subscription record.
 * New users always start on FREE; this is a fallback safety net.
 */
export async function getOrCreateSubscription(userId: string) {
  let sub = await prisma.subscription.findUnique({
    where: { userId },
    include: { plan: true },
  })

  if (!sub) {
    const freePlan = await prisma.plan.findUniqueOrThrow({ where: { name: "FREE" } })
    const now = new Date()
    sub = await prisma.subscription.create({
      data: {
        userId,
        planId: freePlan.id,
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()),
      },
      include: { plan: true },
    })
  }

  return sub
}

/**
 * Returns the effective plan limits for a user, accounting for active trials.
 * If a TRIALING subscription is expired, we fall back to FREE limits.
 */
export async function getUserPlanLimits(userId: string): Promise<{
  planName: PlanName
  limits: PlanLimits
  isTrialing: boolean
  trialEndsAt: Date | null
  subscriptionStatus: SubscriptionStatus
}> {
  const sub = await getOrCreateSubscription(userId)
  const planName = sub.plan.name as PlanName

  // If TRIALING and trial has expired, treat as FREE
  if (sub.status === "TRIALING" && sub.trialEndsAt && sub.trialEndsAt < new Date()) {
    // Lazily downgrade to FREE
    const freePlan = await prisma.plan.findUniqueOrThrow({ where: { name: "FREE" } })
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { planId: freePlan.id, status: "ACTIVE" },
    })
    return {
      planName: "FREE",
      limits: PLAN_LIMITS["FREE"],
      isTrialing: false,
      trialEndsAt: null,
      subscriptionStatus: "ACTIVE",
    }
  }

  return {
    planName,
    limits: PLAN_LIMITS[planName] ?? PLAN_LIMITS["FREE"],
    isTrialing: sub.status === "TRIALING",
    trialEndsAt: sub.trialEndsAt,
    subscriptionStatus: sub.status,
  }
}

/**
 * Provision a 14-day PRO trial for a brand-new user.
 * Called right after account creation.
 */
export async function createTrialSubscription(userId: string): Promise<void> {
  const proPlan = await prisma.plan.findUnique({ where: { name: "PRO" } })
  if (!proPlan) {
    // Plans not seeded yet — fall back to FREE
    const freePlan = await prisma.plan.findFirst({ where: { name: "FREE" } })
    if (!freePlan) return // Nothing to do if DB isn't seeded
    const now = new Date()
    await prisma.subscription.create({
      data: {
        userId,
        planId: freePlan.id,
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()),
      },
    })
    return
  }

  const now = new Date()
  const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

  await prisma.subscription.create({
    data: {
      userId,
      planId: proPlan.id,
      status: "TRIALING",
      trialEndsAt: trialEnd,
      currentPeriodStart: now,
      currentPeriodEnd: trialEnd,
    },
  })
}

// ─── PayU order creation ───────────────────────────────────────────────────────

export interface PayUOrderParams {
  key: string
  txnid: string
  amount: string        // INR decimal string e.g. "299.00"
  productinfo: string
  firstname: string
  email: string
  phone: string
  surl: string
  furl: string
  hash: string
  udf1: string          // planName
  udf2: string          // billingCycle
  udf3: string          // userId — used by the backend callback to identify the payer
  baseUrl: string
}

/**
 * Builds PayU Bolt payment params for the frontend to launch checkout.
 * No external API call needed — just hash computation.
 */
export async function createPaymentOrder(
  userId: string,
  planName: PlanName,
  billingCycle: "monthly" | "yearly",
  phone?: string,
): Promise<PayUOrderParams> {
  if (planName === "FREE") {
    throw new AppError(400, "Cannot create a payment order for the free plan")
  }
  if (planName === "ENTERPRISE") {
    throw new AppError(400, "Enterprise plan requires direct contact. Please email sales@genxqr.in")
  }

  const { key, salt, baseUrl } = getPayUConfig()

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true, email: true },
  })

  const prices      = PLAN_PRICES_INR[planName]
  const amountINR   = billingCycle === "yearly" ? prices.yearly : prices.monthly
  const amount      = amountINR.toFixed(2)     // PayU expects rupees as decimal string
  const txnid       = `nqr_${Date.now()}_${userId.slice(-8)}`
  const productinfo = `GenXQR ${planName} - ${billingCycle}`
  const firstname   = user.name.split(" ")[0] ?? user.name
  const email       = user.email
  const userPhone   = phone ?? "9999999999"
  const udf1        = planName
  const udf2        = billingCycle
  const udf3        = userId   // stored in hash; echoed back by PayU for callback user lookup

  // surl/furl must be reachable by the user's browser (PayU auto-submits a form via JS).
  // Use BACKEND_URL (port 3001 in dev, public domain in prod) to bypass the Vite proxy,
  // which can interfere with redirect chains and urlencoded POST body handling.
  const callbackBase = env.BACKEND_URL   // e.g. http://localhost:3001 or https://genxqr.in
  const hash = computePayUHash({ key, salt, txnid, amount, productinfo, firstname, email, udf1, udf2, udf3 })

  return {
    key, txnid, amount, productinfo, firstname, email, phone: userPhone,
    surl: `${callbackBase}/api/billing/payu-success`,
    furl: `${callbackBase}/api/billing/payu-failure`,
    hash, udf1, udf2, udf3, baseUrl,
  }
}

// ─── Payment verification ──────────────────────────────────────────────────────

/**
 * Verifies the PayU response hash, activates/upgrades subscription, creates invoice.
 * Called directly from the /payu-success callback route (no client-side auth required).
 */
export async function verifyAndActivateSubscription(
  userId: string,
  txnid: string,
  mihpayid: string,       // PayU's payment ID
  status: string,
  responseHash: string,
  amount: string,         // amount string from PayU response (e.g. "299.00")
  productinfo: string,
  firstname: string,
  email: string,
  udf1: string,           // planName
  udf2: string,           // billingCycle
  udf3?: string,          // userId (echoed by PayU; included for hash verification)
): Promise<void> {
  const { key, salt } = getPayUConfig()

  if (status !== "success") {
    throw new AppError(400, `Payment was not successful (status: ${status})`)
  }

  // 1. Verify reverse hash — prevents tampered callback payloads
  const valid = verifyPayUHash({ key, salt, status, txnid, amount, productinfo, firstname, email, udf1, udf2, udf3: udf3 ?? "", responseHash })
  if (!valid) {
    throw new AppError(400, "Payment signature verification failed")
  }

  const planName    = udf1 as PlanName
  const billingCycle = udf2 as "monthly" | "yearly"

  if (!["STARTER", "PRO", "BUSINESS"].includes(planName)) {
    throw new AppError(400, "Invalid plan in payment response")
  }

  // Idempotency + replay protection: a PayU txnid may be consumed exactly once.
  // The /payu-success callback is public and every field feeding the signature is
  // static for a completed payment, so a captured valid callback could otherwise be
  // replayed to renew a paid plan indefinitely. If an invoice already exists for this
  // txnid, the subscription was already activated — stop here.
  const alreadyProcessed = await prisma.invoice.findUnique({ where: { payuTxnId: txnid } })
  if (alreadyProcessed) {
    logger.warn("PayU callback replay ignored (txnid already processed)", { userId, txnid })
    return
  }

  // 2. Find target plan
  const plan = await prisma.plan.findUniqueOrThrow({ where: { name: planName } })

  // 3. Calculate subscription period
  const now = new Date()
  const periodEnd = billingCycle === "yearly"
    ? new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())
    : new Date(now.getFullYear(), now.getMonth() + 1, now.getDate())

  // 4 + 5. Activate the subscription and record the invoice atomically. The unique
  // constraint on Invoice.payuTxnId makes concurrent replays safe: if two callbacks
  // race past the check above, the second invoice insert throws P2002 and the entire
  // transaction — including the subscription renewal — rolls back.
  const amountPaise = PLAN_PRICES_INR[planName][billingCycle] * 100
  await prisma.$transaction(async (tx) => {
    const existingSub = await tx.subscription.findUnique({ where: { userId } })
    const sub = existingSub
      ? await tx.subscription.update({
          where: { userId },
          data: { planId: plan.id, status: "ACTIVE", trialEndsAt: null, currentPeriodStart: now, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false },
        })
      : await tx.subscription.create({
          data: { userId, planId: plan.id, status: "ACTIVE", currentPeriodStart: now, currentPeriodEnd: periodEnd },
        })

    await tx.invoice.create({
      data: {
        userId,
        subscriptionId: sub.id,
        payuPaymentId: mihpayid,
        payuTxnId: txnid,
        amount: amountPaise,
        currency: "INR",
        status: "paid",
        planName,
        billingCycle,
        periodStart: now,
        periodEnd,
      },
    })
  })

  logger.info("Subscription activated via PayU", { userId, planName, billingCycle, txnid })
  void deliverWebhookEvent(userId, "subscription.activated", { planName, billingCycle })
}

// ─── Subscription management ───────────────────────────────────────────────────

/** Cancel subscription at the end of the current period. */
export async function cancelSubscription(userId: string): Promise<void> {
  const sub = await prisma.subscription.findUnique({ where: { userId } })
  if (!sub) throw new AppError(404, "No active subscription found")

  await prisma.subscription.update({
    where: { userId },
    data: { cancelAtPeriodEnd: true },
  })
  void deliverWebhookEvent(userId, "subscription.cancelled", { cancelAtPeriodEnd: true })
}

/** Immediately downgrade to FREE (admin use / after period end). */
export async function downgradeToFree(userId: string): Promise<void> {
  const freePlan = await prisma.plan.findUniqueOrThrow({ where: { name: "FREE" } })
  const now = new Date()
  await prisma.subscription.update({
    where: { userId },
    data: {
      planId: freePlan.id,
      status: "ACTIVE",
      trialEndsAt: null,
      cancelAtPeriodEnd: false,
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()),
    },
  })
  // Deactivate all dynamic QR codes — FREE plan still works but QRs go dark
  await prisma.qRCode.updateMany({
    where: { userId, category: "DYNAMIC" },
    data: { isActive: false },
  })
  logger.info("Downgraded to FREE — all dynamic QRs deactivated", { userId })
}

/**
 * Handles PayU's server-to-server POST to /api/billing/payu-success.
 * Verifies the hash, resolves the user from udf3 (userId stored during order creation),
 * and activates their subscription.
 *
 * @returns The FRONTEND_URL to redirect the browser to after processing.
 */
export async function processPayUCallback(
  body: Record<string, string> | undefined,
): Promise<{ redirectUrl: string }> {
  const frontendBillingUrl = `${env.FRONTEND_URL}/app/billing`

  try {
    if (!body || typeof body !== "object") {
      logger.warn("PayU callback: empty or invalid body")
      return { redirectUrl: `${frontendBillingUrl}?payment=failure&reason=invalid_body` }
    }

    const { txnid, mihpayid, hash, amount, productinfo, firstname, email, udf1, udf2, udf3 } = body
    const status = (body.status ?? "").toLowerCase()

    logger.info("PayU callback payload", { txnid, status, udf1, udf2, udf3: udf3 ? "present" : "missing" })

    if (!status || !hash || !txnid) {
      logger.warn("PayU callback: missing required fields", { txnid, status, hasHash: !!hash })
      return { redirectUrl: `${frontendBillingUrl}?payment=failure&reason=missing_fields` }
    }

    if (status !== "success") {
      logger.warn("PayU callback: non-success status", { txnid, status })
      return { redirectUrl: `${frontendBillingUrl}?payment=failure` }
    }

    // udf3 holds the userId set during order creation
    const userId = udf3
    if (!userId) {
      logger.error("PayU callback: udf3 (userId) missing — cannot identify payer", { txnid, email })
      return { redirectUrl: `${frontendBillingUrl}?payment=failure&reason=missing_user` }
    }

    await verifyAndActivateSubscription(
      userId, txnid, mihpayid ?? "", status,
      hash, amount, productinfo, firstname, email, udf1, udf2, udf3,
    )
    logger.info("PayU callback: subscription activated", { txnid, userId, udf1, udf2 })
    return { redirectUrl: `${frontendBillingUrl}?payment=success` }

  } catch (err) {
    logger.error("PayU callback: unhandled error", {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      body: JSON.stringify(body),
    })
    return { redirectUrl: `${frontendBillingUrl}?payment=failure&reason=server_error` }
  }
}

/** Get paginated invoices for a user. */
export async function getUserInvoices(userId: string, limit = 20, offset = 0) {
  return prisma.invoice.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
    select: {
      id: true,
      payuPaymentId: true,
      payuTxnId: true,
      amount: true,
      currency: true,
      status: true,
      planName: true,
      billingCycle: true,
      periodStart: true,
      periodEnd: true,
      createdAt: true,
    },
  })
}

