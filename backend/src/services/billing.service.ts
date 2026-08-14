/**
 * Billing Service — Cashfree payment integration + plan limit enforcement.
 *
 * Flow:
 *   1. Client calls POST /api/billing/create-order — we price the plan
 *      server-side, create a Cashfree order, and return its payment_session_id
 *   2. Frontend hands that session id to the Cashfree JS SDK, which takes over
 *   3. Payment is confirmed through TWO independent paths, either of which can
 *      arrive first:
 *        a. Cashfree's signed server-to-server webhook (authoritative; fires
 *           even if the user closes the tab mid-payment)
 *        b. The browser returning to /app/billing, which triggers a
 *           POST /api/billing/verify-payment that re-reads the order straight
 *           from Cashfree's API (fast feedback for the user)
 *      Both funnel into activateSubscriptionForOrder(), which is idempotent —
 *      whichever arrives second is a no-op.
 *
 * Nothing about the price or the plan is ever taken from the client: the amount
 * is derived from PLAN_PRICES_INR here, and the plan/cycle are read back out of
 * the server-set order_tags via Cashfree's authenticated API.
 */

import type { PlanName, SubscriptionStatus } from "@prisma/client"
import { prisma } from "../db/prisma.js"
import { env } from "../config/env.js"
import { AppError } from "../middleware/error.middleware.js"
import { logger } from "../logger/index.js"
import { deliverWebhookEvent } from "./webhook.service.js"
import { createOrder, getOrder, type CashfreeOrder } from "./cashfree.service.js"
import { normalizeEmail } from "../utils/normalize-email.util.js"

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

/** Length of the free evaluation period granted at signup. */
const TRIAL_DAYS = 14

/** Plans a user can actually buy through self-serve checkout. */
const PURCHASABLE_PLANS = ["STARTER", "PRO", "BUSINESS"] as const
type PurchasablePlan = (typeof PURCHASABLE_PLANS)[number]

function isPurchasablePlan(value: string): value is PurchasablePlan {
  return (PURCHASABLE_PLANS as readonly string[]).includes(value)
}

/** Cashfree requires exactly 10 digits; anything else is rejected at order creation. */
const PHONE_DIGITS = 10

/**
 * Coerces a supplied number into the 10-digit form Cashfree demands, stripping
 * spaces, punctuation, a +91 country code and a leading trunk 0. Returns null if
 * what remains is not a plausible Indian mobile number.
 *
 * Indian mobile numbers begin 6–9, which is checked: it rejects obvious junk
 * like 1234567890 that would otherwise sail through a pure length test and be
 * stored as a real customer contact.
 */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let digits = raw.replace(/\D/g, "")
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2)
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1)
  if (digits.length !== PHONE_DIGITS) return null
  if (!/^[6-9]/.test(digits)) return null
  return digits
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
 * Whether this user should get a free trial, or start on FREE.
 *
 * One trial per human, not per email address. `parth+1@gmail.com`,
 * `parth+2@gmail.com` and `p.a.r.t.h@gmail.com` are one inbox, so without this a
 * single person mints unlimited 14-day PRO trials by signing up again.
 *
 * Signup itself stays open — an alias is a legitimate way to file mail, and
 * refusing it would cost real customers. The alias simply does not earn a second
 * trial.
 *
 * Fails OPEN. If the address cannot be normalised, or the lookup errors, the
 * user gets their trial: wrongly denying a genuine new customer their evaluation
 * is a worse outcome than granting one extra trial to someone determined to
 * farm them.
 */
async function isEligibleForTrial(userId: string, email: string): Promise<boolean> {
  const normalized = normalizeEmail(email)
  if (!normalized) return true

  try {
    // Has any OTHER account on this inbox ever held a subscription? A trial that
    // has since lapsed to FREE still counts — the subscription row persists, so
    // the evaluation period was already used.
    const priorAccount = await prisma.user.findFirst({
      where: {
        normalizedEmail: normalized,
        id: { not: userId },
        subscription: { isNot: null },
      },
      select: { id: true },
    })

    if (priorAccount) {
      logger.info("Trial withheld: this inbox has already had one", {
        userId,
        normalizedEmail: normalized,
        priorAccountId: priorAccount.id,
      })
      return false
    }
    return true
  } catch (err) {
    logger.error("Trial eligibility check failed — granting the trial", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    })
    return true
  }
}

/** Starts a subscription on FREE, used when a trial is not granted. */
async function createFreeSubscription(userId: string, freePlanId: string): Promise<void> {
  const now = new Date()
  await prisma.subscription.create({
    data: {
      userId,
      planId: freePlanId,
      status: "ACTIVE",
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()),
    },
  })
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

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  })
  if (!user) return

  if (!(await isEligibleForTrial(userId, user.email))) {
    const freePlan = await prisma.plan.findUnique({ where: { name: "FREE" } })
    if (freePlan) await createFreeSubscription(userId, freePlan.id)
    return
  }

  const now = new Date()
  const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)

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

// ─── Cashfree order creation ──────────────────────────────────────────────────

/** Orders left unpaid this long can no longer be completed. */
const ORDER_EXPIRY_MINUTES = 30

/**
 * Prefix on every order id this app creates.
 *
 * Load-bearing when the Cashfree merchant account is SHARED with another site,
 * which is the normal situation: Cashfree issues one production key pair per
 * merchant account, and webhooks are registered per account — so every endpoint
 * on the account receives events for every order on the account, including other
 * products' orders.
 *
 * This prefix is how a foreign order is recognised and ignored, and it also keeps
 * our order ids from colliding with the other site's (Cashfree requires order_id
 * to be unique across the whole account, forever).
 */
export const ORDER_ID_PREFIX = "genxqr_"

/** True if this order was created by this app, rather than another site on the same account. */
export function isOwnOrderId(orderId: string): boolean {
  return orderId.startsWith(ORDER_ID_PREFIX)
}

/** Path Cashfree POSTs the payment result to. Kept here so order creation and the route agree. */
export const WEBHOOK_PATH = "/api/billing/cashfree-webhook"

/**
 * The per-order webhook URL to register with Cashfree, or null when one cannot
 * be used.
 *
 * Cashfree requires notify_url to be HTTPS and rejects the whole order if it is
 * not, so in local development — where BACKEND_URL is http://localhost:3001 —
 * it is omitted rather than sent. The consequence is real and worth knowing:
 * locally there is NO webhook, and a subscription only activates when the
 * browser returns and calls /verify-payment. To exercise the webhook path
 * locally, expose the backend over HTTPS (ngrok or similar) and point
 * BACKEND_URL at it.
 */
export function webhookUrl(): string | null {
  const base = env.BACKEND_URL.replace(/\/+$/, "")
  if (!base.startsWith("https://")) {
    return null
  }
  return `${base}${WEBHOOK_PATH}`
}

export interface CheckoutSession {
  /** Handed to the Cashfree JS SDK to open checkout. */
  paymentSessionId: string
  /** Our own order id — echoed back on return so we know what to verify. */
  orderId: string
  /** "sandbox" | "production" — the SDK must be initialised in the matching mode. */
  mode: "sandbox" | "production"
  amount: number
  currency: string
  planName: PlanName
  billingCycle: "monthly" | "yearly"
}

/**
 * Derives which SDK mode the frontend must use from the configured API base, so
 * the two can never drift apart. A sandbox session id is rejected by the
 * production SDK and vice versa, and the resulting error is opaque.
 */
function cashfreeMode(): "sandbox" | "production" {
  return env.CASHFREE_API_BASE.includes("sandbox") ? "sandbox" : "production"
}

/**
 * Prices the plan, creates a Cashfree order, and returns what the browser needs
 * to open checkout.
 *
 * The client sends only *which* plan and cycle it wants — the amount is looked
 * up here, so a tampered request can change what is being bought but never what
 * it costs. The plan and cycle are also written into order_tags, which Cashfree
 * stores and returns through its authenticated API; that is how activation
 * later learns what was purchased without trusting anything client-side.
 */
export async function createPaymentOrder(
  userId: string,
  planName: PlanName,
  billingCycle: "monthly" | "yearly",
  phone?: string,
): Promise<CheckoutSession> {
  if (planName === "FREE") {
    throw new AppError(400, "Cannot create a payment order for the free plan")
  }
  if (planName === "ENTERPRISE") {
    throw new AppError(400, "Enterprise plan requires direct contact. Please email support@genxqr.com")
  }
  if (!isPurchasablePlan(planName)) {
    throw new AppError(400, "That plan cannot be purchased online")
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true, email: true, phone: true },
  })

  // Cashfree requires a 10-digit mobile on every order. Prefer one supplied now,
  // otherwise reuse what the user gave last time. A placeholder is NOT
  // acceptable: it is shown to the customer on the checkout page, it may receive
  // their payment notifications, and every order sharing one number is exactly
  // the pattern gateway risk systems flag.
  const suppliedPhone = normalisePhone(phone)
  const customerPhone = suppliedPhone ?? normalisePhone(user.phone)
  if (!customerPhone) {
    throw new AppError(422, "A valid 10-digit mobile number is required to continue to payment.")
  }

  // Remember it so a returning customer is not asked again.
  if (suppliedPhone && suppliedPhone !== user.phone) {
    await prisma.user.update({ where: { id: userId }, data: { phone: suppliedPhone } })
  }

  const prices = PLAN_PRICES_INR[planName]
  const amountINR = billingCycle === "yearly" ? prices.yearly : prices.monthly

  // Order ids must be unique per merchant account forever — a collision makes
  // Cashfree reject the order. Timestamp + random suffix, and it doubles as our
  // idempotency key on Invoice.cashfreeOrderId. The prefix also marks the order
  // as ours on a shared merchant account (see ORDER_ID_PREFIX).
  const orderId = `${ORDER_ID_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

  const notifyUrl = webhookUrl()
  if (!notifyUrl) {
    // Not fatal — the browser-return verification still activates the plan — but
    // it means a user who closes the tab mid-payment will not be upgraded until
    // they come back, so it must not pass unnoticed.
    logger.warn(
      "Cashfree order created WITHOUT a webhook: BACKEND_URL is not HTTPS, and Cashfree requires HTTPS for notify_url. " +
        "Payment will only be confirmed if the browser returns to the site.",
      { orderId, backendUrl: env.BACKEND_URL },
    )
  }

  const order = await createOrder({
    orderId,
    amount: amountINR,
    currency: "INR",
    customer: {
      // Cashfree requires an alphanumeric customer id; cuids qualify.
      id: userId,
      name: user.name || user.email.split("@")[0] || "Customer",
      email: user.email,
      phone: customerPhone,
    },
    // The browser lands back here; the SPA reads cf_order_id and asks the
    // backend to verify it. Carries no proof of payment by itself.
    returnUrl: `${env.FRONTEND_URL}/app/billing?cf_order_id=${orderId}`,
    // Registered per order rather than as a fixed dashboard endpoint, which is
    // what lets several sites share one Cashfree merchant account without their
    // webhooks crossing over. Null in local dev (see webhookUrl()).
    ...(notifyUrl ? { notifyUrl } : {}),
    tags: {
      userId,
      planName,
      billingCycle,
    },
    expiryMinutes: ORDER_EXPIRY_MINUTES,
  })

  if (!order.payment_session_id) {
    logger.error("Cashfree created an order without a payment_session_id", { orderId, status: order.order_status })
    throw new AppError(502, "The payment gateway did not return a usable checkout session.")
  }

  logger.info("Cashfree order created", { userId, orderId, planName, billingCycle, amountINR })

  return {
    paymentSessionId: order.payment_session_id,
    orderId,
    mode: cashfreeMode(),
    amount: amountINR,
    currency: "INR",
    planName,
    billingCycle,
  }
}

// ─── Payment verification ──────────────────────────────────────────────────────

/** Outcome of trying to activate a subscription from a paid order. */
export type ActivationResult =
  | { status: "activated"; planName: PurchasablePlan; billingCycle: "monthly" | "yearly" }
  | { status: "already_processed" }
  | { status: "not_paid"; orderStatus: string }

/**
 * Activates a subscription from a Cashfree order that Cashfree itself says is PAID.
 *
 * This is the single activation path — both the webhook and the browser-return
 * verification call it, so the rules below cannot drift between them:
 *
 *   - The order is ALWAYS re-fetched from Cashfree's authenticated API. Neither
 *     caller may pass in an order it merely believes is paid. A signed webhook
 *     proves Cashfree sent the message, not that it says what we think.
 *   - Plan, cycle and user come from server-set order_tags, never from a request.
 *   - The amount is recomputed from PLAN_PRICES_INR and checked against what was
 *     actually collected, so a tampered or mispriced order cannot grant a plan.
 *   - Idempotent on Invoice.cashfreeOrderId, so a replayed webhook, a refreshed
 *     return page, or the two racing each other all settle on one activation.
 */
export async function activateSubscriptionForOrder(orderId: string): Promise<ActivationResult> {
  // Cheap pre-check. The unique constraint below is what actually guarantees
  // correctness under a race; this just avoids the API call in the common case.
  const existing = await prisma.invoice.findUnique({ where: { cashfreeOrderId: orderId } })
  if (existing) {
    logger.info("Cashfree order already processed — activation skipped", { orderId })
    return { status: "already_processed" }
  }

  const order: CashfreeOrder = await getOrder(orderId)

  if (order.order_status !== "PAID") {
    logger.warn("Cashfree order is not PAID — refusing to activate", { orderId, orderStatus: order.order_status })
    return { status: "not_paid", orderStatus: order.order_status }
  }

  // order_tags were set by us at creation and are only readable through an
  // authenticated call, so they are trustworthy in a way the request is not.
  const tags = order.order_tags ?? {}
  const userId = tags["userId"]
  const planName = tags["planName"]
  const billingCycle = tags["billingCycle"]

  if (!userId || !planName || !billingCycle) {
    logger.error("Cashfree order is missing the tags needed to activate", { orderId, tags })
    throw new AppError(422, "This payment cannot be matched to a subscription. Please contact support.")
  }
  if (!isPurchasablePlan(planName)) {
    logger.error("Cashfree order carries an unrecognised plan", { orderId, planName })
    throw new AppError(422, "This payment refers to a plan that no longer exists. Please contact support.")
  }
  if (billingCycle !== "monthly" && billingCycle !== "yearly") {
    logger.error("Cashfree order carries an unrecognised billing cycle", { orderId, billingCycle })
    throw new AppError(422, "This payment has an invalid billing period. Please contact support.")
  }

  // Guard against activating a plan that was not actually paid for. Compared as
  // integer paise because the gateway returns a float.
  const expectedINR = PLAN_PRICES_INR[planName][billingCycle]
  const expectedPaise = Math.round(expectedINR * 100)
  const paidPaise = Math.round(order.order_amount * 100)
  if (paidPaise !== expectedPaise) {
    logger.error("Cashfree order amount does not match the plan price", {
      orderId, planName, billingCycle, expectedPaise, paidPaise,
    })
    throw new AppError(422, "The amount paid does not match the plan price. Please contact support.")
  }

  // All prices are quoted in INR, so a payment collected in anything else has
  // not paid for this plan whatever the numeric total says. Cannot happen while
  // we create every order ourselves with order_currency INR — this is here so a
  // future multi-currency change cannot silently grant plans for the wrong money.
  const paidCurrency = (order.order_currency || "INR").toUpperCase()
  if (paidCurrency !== "INR") {
    logger.error("Cashfree order was paid in an unexpected currency", { orderId, paidCurrency })
    throw new AppError(422, "This payment was made in an unsupported currency. Please contact support.")
  }

  const plan = await prisma.plan.findUniqueOrThrow({ where: { name: planName } })

  const now = new Date()

  /** Adds one billing period to a starting instant. */
  const addPeriod = (from: Date): Date =>
    billingCycle === "yearly"
      ? new Date(from.getFullYear() + 1, from.getMonth(), from.getDate())
      : new Date(from.getFullYear(), from.getMonth() + 1, from.getDate())

  // Subscription change and invoice are written together. The unique constraint
  // on cashfreeOrderId is the real concurrency guard: if the webhook and the
  // return-trip verification both get past the pre-check, the second insert
  // raises P2002 and rolls the whole transaction back — including the period
  // extension, so the user cannot be granted two periods for one payment.
  try {
    await prisma.$transaction(async (tx) => {
      const existingSub = await tx.subscription.findUnique({
        where: { userId },
        include: { plan: true },
      })

      // Renewing EARLY must extend the paid period, not replace it. Computing
      // the end date from `now` unconditionally silently destroyed whatever the
      // customer had already paid for — renew with 20 days left and those 20
      // days vanished.
      //
      // Only a true renewal extends: same plan, same cycle, period still running,
      // and not a trial (trial days were never paid for). A plan CHANGE starts a
      // fresh period from now, because carrying a cheaper plan's remaining days
      // onto a more expensive one would hand out unpaid time.
      const isRenewalOfSamePlan =
        existingSub !== null &&
        existingSub.status === "ACTIVE" &&
        existingSub.plan.name === planName &&
        existingSub.currentPeriodEnd > now

      const periodStart = isRenewalOfSamePlan ? existingSub.currentPeriodEnd : now
      const periodEnd = addPeriod(periodStart)

      const sub = existingSub
        ? await tx.subscription.update({
            where: { userId },
            data: {
              planId: plan.id, status: "ACTIVE", trialEndsAt: null,
              // currentPeriodStart stays put on a renewal so the running period
              // is extended rather than restarted.
              currentPeriodStart: isRenewalOfSamePlan ? existingSub.currentPeriodStart : now,
              currentPeriodEnd: periodEnd,
              cancelAtPeriodEnd: false,
            },
          })
        : await tx.subscription.create({
            data: { userId, planId: plan.id, status: "ACTIVE", currentPeriodStart: now, currentPeriodEnd: periodEnd },
          })

      await tx.invoice.create({
        data: {
          userId,
          subscriptionId: sub.id,
          cashfreePaymentId: order.cf_order_id,
          cashfreeOrderId: orderId,
          amount: expectedPaise,
          currency: paidCurrency,
          status: "paid",
          planName,
          billingCycle,
          // The invoice records what THIS payment bought, which on a renewal is
          // the newly appended period, not the whole extended span.
          periodStart,
          periodEnd,
        },
      })
    })
  } catch (err) {
    // P2002 = unique violation on cashfreeOrderId: the other path won the race
    // and already activated this order. That is a success, not a failure.
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
      logger.info("Cashfree activation lost the race — already processed", { orderId, userId })
      return { status: "already_processed" }
    }
    throw err
  }

  logger.info("Subscription activated via Cashfree", { userId, planName, billingCycle, orderId })
  void deliverWebhookEvent(userId, "subscription.activated", { planName, billingCycle })

  return { status: "activated", planName, billingCycle }
}

/**
 * Verifies an order on behalf of a signed-in user returning from checkout.
 *
 * Ownership matters here: without it any authenticated user could POST someone
 * else's order id and have that person's payment applied to their own account.
 * The order's userId tag is therefore checked against the caller before the
 * order is activated.
 */
export async function verifyPaymentForUser(
  userId: string,
  orderId: string,
): Promise<ActivationResult> {
  const order = await getOrder(orderId)
  const ownerId = order.order_tags?.["userId"]

  if (ownerId && ownerId !== userId) {
    logger.warn("User attempted to verify an order belonging to someone else", { userId, ownerId, orderId })
    throw new AppError(403, "This payment belongs to a different account.")
  }

  return activateSubscriptionForOrder(orderId)
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

/** Cashfree event types this app acts on. Everything else is acknowledged and ignored. */
const PAYMENT_SUCCESS_EVENT = "PAYMENT_SUCCESS_WEBHOOK"

interface CashfreeWebhookPayload {
  type?: string
  data?: {
    order?: { order_id?: string }
  }
}

/**
 * Processes a Cashfree webhook whose signature has ALREADY been verified by the
 * route. This function does not re-check authenticity — keeping verification at
 * the edge means an unsigned payload can never reach this code path at all.
 *
 * Note what it deliberately does not do: trust the payload's contents. It reads
 * only the order id, then re-fetches that order from Cashfree. A valid signature
 * proves the message came from Cashfree; re-reading proves what it says is still
 * true right now.
 */
export async function processCashfreeWebhook(
  payload: CashfreeWebhookPayload,
): Promise<{ handled: boolean; reason?: string }> {
  const eventType = payload.type

  if (eventType !== PAYMENT_SUCCESS_EVENT) {
    // Refunds, failures, disputes and so on are acknowledged so Cashfree stops
    // retrying, but only a successful payment grants a plan.
    logger.info("Cashfree webhook ignored (not a payment success)", { eventType })
    return { handled: false, reason: "unhandled_event" }
  }

  const orderId = payload.data?.order?.order_id
  if (!orderId) {
    logger.warn("Cashfree payment-success webhook had no order_id", { eventType })
    return { handled: false, reason: "missing_order_id" }
  }

  // The Cashfree merchant account may be shared with another site. Webhooks are
  // account-scoped, so this endpoint legitimately receives that site's payments.
  // They are ignored here — before any API call — because looking them up would
  // waste a request and then fail validation, which Cashfree would read as an
  // error worth retrying forever.
  if (!isOwnOrderId(orderId)) {
    logger.info("Cashfree webhook ignored (order belongs to another site on this account)", { orderId })
    return { handled: false, reason: "foreign_order" }
  }

  const result = await activateSubscriptionForOrder(orderId)
  logger.info("Cashfree webhook processed", { orderId, result: result.status })
  return { handled: result.status === "activated", reason: result.status }
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
      cashfreePaymentId: true,
      cashfreeOrderId: true,
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

