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
import { createOrder, getOrder, terminateOrder, type CashfreeOrder } from "./cashfree.service.js"
import { expireSubscription, isLapsed, resumeCodesPausedForBilling } from "./subscription-expiry.service.js"
import { invalidateScanQuota } from "./scan-quota.service.js"
import { normalizeEmail } from "../utils/normalize-email.util.js"
import { inboxHash } from "../utils/inbox-hash.util.js"
import { quoteCoupon, recordRedemption, releaseCouponHold, MINIMUM_CHARGEABLE_PAISE, type CouponQuote } from "./coupon.service.js"
import { getCreditBalance, lockCredit, recordCreditSpend, releaseCreditHold, qualifyReferralInTx } from "./referral.service.js"

// ─── Plan constants (mirrors seed data) ───────────────────────────────────────

export interface PlanLimits {
  dynamicQRLimit: number
  scanLimitPerMonth: number
  fileStorageGB: number
  teamSeatsLimit: number
  apiCallsLimit: number
  bulkGeneration: boolean
  apiAccess: boolean
  customDomains: boolean
  whiteLabel: boolean
  prioritySupport: boolean
  abTesting: boolean
  smartRouting: boolean
  qrExpiry: boolean
  /** The QR frame library (shapes, premium, occasions) in the dashboard — any paid plan (decided 20 Oct 2026). */
  premiumFrames: boolean
  /** The account's logo at the top of the scan landing page — any paid plan (decided 23 Oct 2026). White-label (brand NAME replacing GenXQR) stays whiteLabel. */
  scanPageLogo: boolean
}

export const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  FREE: {
    dynamicQRLimit: 0,   // Post-trial: no QR creation without a paid subscription
    scanLimitPerMonth: 0,
    fileStorageGB: 0,
    teamSeatsLimit: 1,
    apiCallsLimit: 0,
    bulkGeneration: false,
    apiAccess: false,
    customDomains: false,
    whiteLabel: false,
    prioritySupport: false,
    abTesting: false,
    smartRouting: false,
    qrExpiry: false,
    premiumFrames: false,
    scanPageLogo: false,
  },
  STARTER: {
    dynamicQRLimit: 50,
    scanLimitPerMonth: 5000,
    fileStorageGB: 1,
    teamSeatsLimit: 1,
    apiCallsLimit: 0,
    bulkGeneration: false,
    apiAccess: false,
    customDomains: false,
    whiteLabel: false,
    prioritySupport: false,
    abTesting: false,
    smartRouting: false,
    qrExpiry: true,
    premiumFrames: true,
    scanPageLogo: true,
  },
  PRO: {
    dynamicQRLimit: 250,
    scanLimitPerMonth: 50000,
    fileStorageGB: 5,
    teamSeatsLimit: 5,
    apiCallsLimit: 10000,
    bulkGeneration: true,
    apiAccess: true,
    customDomains: true,
    whiteLabel: false,
    prioritySupport: false,
    abTesting: true,
    smartRouting: true,
    qrExpiry: true,
    premiumFrames: true,
    scanPageLogo: true,
  },
  BUSINESS: {
    dynamicQRLimit: 2000,
    scanLimitPerMonth: 500000,
    fileStorageGB: 50,
    teamSeatsLimit: 20,
    apiCallsLimit: 100000,
    bulkGeneration: true,
    apiAccess: true,
    customDomains: true,
    whiteLabel: true,
    prioritySupport: true,
    abTesting: true,
    smartRouting: true,
    qrExpiry: true,
    premiumFrames: true,
    scanPageLogo: true,
  },
  ENTERPRISE: {
    dynamicQRLimit: 999999,
    scanLimitPerMonth: 999999999,
    fileStorageGB: 1000,
    teamSeatsLimit: 999,
    apiCallsLimit: 999999999,
    bulkGeneration: true,
    apiAccess: true,
    customDomains: true,
    whiteLabel: true,
    prioritySupport: true,
    abTesting: true,
    smartRouting: true,
    qrExpiry: true,
    premiumFrames: true,
    scanPageLogo: true,
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
    // ON CONFLICT DO NOTHING: a trial or a payment may create the row at the
    // same moment, and theirs wins rather than this request failing on P2002.
    await prisma.subscription.createMany({
      data: [{
        userId,
        planId: freePlan.id,
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()),
      }],
      skipDuplicates: true,
    })
    sub = await prisma.subscription.findUniqueOrThrow({ where: { userId }, include: { plan: true } })
  }

  return sub
}

/**
 * Returns the effective plan limits for a user. A lapsed trial or paid period
 * is expired on the spot (see subscription-expiry.service.ts) and gets FREE.
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

  // A trial or paid period that has run out: expire it now (drop to FREE, pause
  // dynamic codes, email the owner) rather than waiting for the 10-minute sweep,
  // so the owner never sees paid limits they no longer have.
  if (isLapsed(sub)) {
    await expireSubscription(userId)
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
 * Plan limits for a user, WITHOUT creating or modifying anything.
 *
 * getUserPlanLimits above goes through getOrCreateSubscription and lazily writes
 * a downgrade when a trial has lapsed. That is right for an authenticated request
 * — the user is there, and the write is theirs. It is wrong for a public path:
 * /api/public/qr/:slug is unauthenticated and hit by every landing-page view, so
 * using it would let an anonymous visitor trigger subscription writes for the QR
 * code's owner simply by loading the page, as fast as they cared to.
 *
 * The trial-expiry rule is applied in memory instead, so the answer matches
 * getUserPlanLimits exactly; only the persistence is skipped. The real downgrade
 * still happens the next time the owner does anything authenticated.
 *
 * Not cached: it is one indexed lookup by userId, and caching would mean a plan
 * upgrade took time to show. Revisit if landing-page traffic ever makes it hurt.
 */
export async function getPlanLimitsReadOnly(userId: string): Promise<PlanLimits> {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: {
      status: true, trialEndsAt: true, currentPeriodEnd: true, codesPauseAt: true,
      plan: { select: { name: true } },
    },
  })

  // No subscription row yet — the same thing getOrCreateSubscription would have
  // decided before writing one.
  if (!sub) return PLAN_LIMITS["FREE"]

  if (isLapsed(sub)) return PLAN_LIMITS["FREE"]

  return PLAN_LIMITS[sub.plan.name as PlanName] ?? PLAN_LIMITS["FREE"]
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
    // An inbox that already had a trial — including on an account since
    // deleted, which the account check below cannot see.
    if (await prisma.trialUsage.findUnique({ where: { emailHash: inboxHash(email) }, select: { emailHash: true } })) {
      logger.info("Trial withheld: this inbox has had one before", { userId })
      return false
    }

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
  // Remember the inbox, not the account: it outlives deletion.
  await prisma.trialUsage
    .upsert({ where: { emailHash: inboxHash(user.email) }, create: { emailHash: inboxHash(user.email) }, update: {} })
    .catch((err) => logger.warn("Could not record trial usage", { userId, error: String(err) }))
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

/**
 * What checkout returns: a Cashfree session to pay, or — when a coupon leaves
 * nothing to pay — confirmation that the plan was granted outright.
 */
export type CheckoutResult = CheckoutSession | FreeCheckout

export interface FreeCheckout {
  free: true
  /** The synthetic order id the grant was recorded under (invoice, redemption). */
  orderId: string
  planName: PlanName
  billingCycle: "monthly" | "yearly"
  amount: 0
  currency: "INR"
}

export interface CheckoutSession {
  free?: false
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
 * What a purchase costs, in one place: list price, then the coupon, then the
 * buyer's GenXQR credit (referral rewards), then the free check. Used for the
 * checkout preview (POST /api/billing/quote) and to price the real order, so
 * what is shown is what is charged.
 *
 * Coupon before credit: credit then covers what the coupon left. Anything
 * under MINIMUM_CHARGEABLE_PAISE left to pay makes the purchase free.
 */
export interface CheckoutPricing {
  listPaise: number
  coupon: CouponQuote | null
  /** Spendable credit before this purchase, in paise (never negative here). */
  creditAvailablePaise: number
  /** Credit this purchase uses, in paise. */
  creditAppliedPaise: number
  /** What the buyer pays, in paise. 0 = free (no payment order). */
  finalPaise: number
  isFree: boolean
}

export async function priceCheckout(params: {
  userId: string
  planName: PurchasablePlan
  billingCycle: "monthly" | "yearly"
  couponCode?: string
  /**
   * Preview only: price as if these unpaid orders' holds were already released
   * — which a new checkout does first (settleOwnOpenHolds). Real orders are
   * priced without it, after the release has actually happened.
   */
  assumeReleased?: string[]
}): Promise<CheckoutPricing> {
  const prices = PLAN_PRICES_INR[params.planName]
  const listPaise = Math.round((params.billingCycle === "yearly" ? prices.yearly : prices.monthly) * 100)
  const coupon = params.couponCode
    ? await quoteCoupon({
        code: params.couponCode, userId: params.userId, planName: params.planName, billingCycle: params.billingCycle,
        ignoreOrderIds: params.assumeReleased,
      })
    : null
  const afterCoupon = coupon ? coupon.finalPaise : listPaise

  const { availablePaise } = await getCreditBalance(params.userId)
  const heldBack = params.assumeReleased?.length
    ? -((await prisma.creditEntry.aggregate({
        where: { userId: params.userId, kind: "REDEMPTION", voidedAt: null, orderId: { in: params.assumeReleased } },
        _sum: { amountPaise: true },
      }))._sum.amountPaise ?? 0)
    : 0
  const creditAvailablePaise = Math.max(0, availablePaise + heldBack)
  const creditAppliedPaise = Math.min(creditAvailablePaise, afterCoupon)
  let finalPaise = afterCoupon - creditAppliedPaise
  if (finalPaise < MINIMUM_CHARGEABLE_PAISE) finalPaise = 0

  return { listPaise, coupon, creditAvailablePaise, creditAppliedPaise, finalPaise, isFree: finalPaise === 0 }
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
  couponCode?: string,
): Promise<CheckoutResult> {
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

  // A coupon use or credit held by this user's earlier unpaid checkout is
  // released first if Cashfree confirms that order can no longer be paid —
  // otherwise starting again after closing the payment page would find them
  // "already used".
  await settleOwnOpenHolds(userId)

  // The client sends only a CODE. What it is worth — and how much credit is
  // spent — is decided here, never taken from the request.
  const pricing = await priceCheckout({ userId, planName, billingCycle, couponCode })
  const quote = pricing.coupon

  // Nothing to pay: grant the plan without a payment order. Before the phone
  // check on purpose — the number is only needed by Cashfree.
  if (pricing.isFree) return grantFreePeriod(userId, planName, billingCycle, pricing)

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

  const chargePaise = pricing.finalPaise
  const amountINR = chargePaise / 100

  // Order ids must be unique per merchant account forever — a collision makes
  // Cashfree reject the order. Timestamp + random suffix, and it doubles as our
  // idempotency key on Invoice.cashfreeOrderId. The prefix also marks the order
  // as ours on a shared merchant account (see ORDER_ID_PREFIX).
  const orderId = `${ORDER_ID_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

  // Hold the coupon use and credit NOW, not when the order is paid. Holding
  // them only at payment let one single-use coupon, or one credit balance, be
  // priced into any number of open orders, each of which could then be paid.
  await holdCheckout(userId, orderId, planName, billingCycle, pricing)

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

  let order: Awaited<ReturnType<typeof createOrder>>
  try {
    order = await createOrder({
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
        // What we intend to collect. Activation verifies the payment against THIS
        // rather than the list price, which is what makes a discounted order
        // acceptable without loosening the amount check. Bounded on the way back
        // in: it must not exceed the list price.
        expectedPaise: String(chargePaise),
        ...(quote ? { couponCode: quote.code, couponId: quote.couponId } : {}),
        // Credit to spend when this order is paid (recorded at activation).
        ...(pricing.creditAppliedPaise > 0 ? { creditPaise: String(pricing.creditAppliedPaise) } : {}),
      },
      expiryMinutes: ORDER_EXPIRY_MINUTES,
    })
  } catch (err) {
    await releaseCheckoutHold(orderId)
    throw err
  }

  if (!order.payment_session_id) {
    logger.error("Cashfree created an order without a payment_session_id", { orderId, status: order.order_status })
    // The session is unusable, so the order cannot be paid: stop it and free the hold.
    await terminateOrder(orderId).catch(() => undefined)
    await releaseCheckoutHold(orderId)
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

// ─── Checkout holds ───────────────────────────────────────────────────────────
//
// A paid order's coupon use (a CouponRedemption row) and credit (a REDEMPTION
// CreditEntry) are written when the order is CREATED, under the same strict
// checks as a free grant, and confirmed when it is paid (recordRedemption /
// recordCreditSpend find the held rows). An order that is never paid has no
// Invoice; its hold is released once Cashfree confirms the order is expired or
// terminated — by the user's next checkout (settleOwnOpenHolds) or by the
// sweep (releaseStaleCheckoutHolds). A hold is never released on a guess: if
// Cashfree cannot be asked, it stays.

async function holdCheckout(
  userId: string,
  orderId: string,
  planName: PurchasablePlan,
  billingCycle: "monthly" | "yearly",
  pricing: CheckoutPricing,
): Promise<void> {
  if (!pricing.coupon && pricing.creditAppliedPaise <= 0) return
  await prisma.$transaction(async (tx) => {
    if (pricing.creditAppliedPaise > 0) {
      await lockCredit(tx, userId)
      const { availablePaise } = await getCreditBalance(userId, tx)
      if (availablePaise < pricing.creditAppliedPaise) {
        throw new AppError(409, "Your credit balance changed. Please review the total and try again.")
      }
      await recordCreditSpend(tx, userId, orderId, pricing.creditAppliedPaise)
    }
    if (pricing.coupon) {
      await recordRedemption(
        tx,
        {
          couponId: pricing.coupon.couponId,
          userId,
          cashfreeOrderId: orderId,
          originalPaise: pricing.listPaise,
          discountPaise: pricing.listPaise - pricing.finalPaise - pricing.creditAppliedPaise,
          finalPaise: pricing.finalPaise,
          planName,
          billingCycle,
        },
        { strict: true },
      )
    }
  })
}

async function releaseCheckoutHold(orderId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await releaseCouponHold(tx, orderId)
    await releaseCreditHold(tx, orderId)
  })
}

/** Unpaid orders (no invoice) still holding a coupon use or credit, oldest first. */
async function openHolds(where: { userId?: string; heldBefore?: Date }): Promise<Array<{ orderId: string; heldAt: Date }>> {
  const userId = where.userId ?? null
  const before = where.heldBefore ?? new Date("9999-12-31T00:00:00Z")
  return prisma.$queryRaw<Array<{ orderId: string; heldAt: Date }>>`
    SELECT h."orderId", MIN(h."heldAt") AS "heldAt" FROM (
      SELECT ce."orderId" AS "orderId", ce."createdAt" AS "heldAt"
        FROM credit_entries ce
       WHERE ce.kind = 'REDEMPTION' AND ce."voidedAt" IS NULL AND ce."orderId" IS NOT NULL
         AND (${userId}::text IS NULL OR ce."userId" = ${userId})
      UNION ALL
      SELECT cr."cashfreeOrderId", cr."redeemedAt"
        FROM coupon_redemptions cr
       WHERE (${userId}::text IS NULL OR cr."userId" = ${userId})
    ) h
    WHERE NOT EXISTS (SELECT 1 FROM invoices i WHERE i."cashfreeOrderId" = h."orderId")
    GROUP BY h."orderId"
    HAVING MIN(h."heldAt") < ${before}
    ORDER BY 2
    LIMIT 200`
}

/**
 * Asks Cashfree about one held order and acts on the answer: released if the
 * order can no longer be paid, activated if it was paid (a missed webhook),
 * kept otherwise. `terminate` first asks Cashfree to stop the order — used when
 * the same user starts a new checkout, i.e. has abandoned this one.
 */
async function settleHold(orderId: string, heldAt: Date, opts: { terminate: boolean }): Promise<void> {
  let status: string
  try {
    status = (opts.terminate ? await terminateOrder(orderId) : await getOrder(orderId)).order_status
  } catch (err) {
    // Cashfree unreachable, or no such order. An order that was never created
    // (the process died between the hold and createOrder) can never be paid:
    // after a day, release it; until then, keep the hold.
    if (Date.now() - heldAt.getTime() > 24 * 60 * 60 * 1000) {
      logger.warn("Releasing a day-old checkout hold Cashfree could not report on", { orderId, error: String(err) })
      await releaseCheckoutHold(orderId)
    }
    return
  }
  if (status === "EXPIRED" || status === "TERMINATED") {
    await releaseCheckoutHold(orderId)
    logger.info("Released checkout hold", { orderId, status })
  } else if (status === "PAID") {
    await activateSubscriptionForOrder(orderId).catch((err) =>
      logger.error("Activating a paid order found by the hold sweep failed", { orderId, error: String(err) }),
    )
  }
  // ACTIVE / TERMINATION_REQUESTED: still payable or settling — keep the hold.
}

/** Releases this user's holds on orders they have abandoned (see createPaymentOrder). */
async function settleOwnOpenHolds(userId: string): Promise<void> {
  for (const hold of await openHolds({ userId })) {
    if (hold.orderId.startsWith(`${ORDER_ID_PREFIX}free_`)) continue
    await settleHold(hold.orderId, hold.heldAt, { terminate: true })
  }
}

/** Order ids whose holds a new checkout by this user would try to release (price previews). */
export async function ownReleasableHoldIds(userId: string): Promise<string[]> {
  return (await openHolds({ userId })).map((h) => h.orderId).filter((id) => !id.startsWith(`${ORDER_ID_PREFIX}free_`))
}

/**
 * Sweep (subscription-expiry worker, every 10 minutes): settles holds on orders
 * old enough to have expired at Cashfree, so an abandoned checkout returns its
 * coupon use and credit even if the user never comes back.
 */
export async function releaseStaleCheckoutHolds(now = new Date()): Promise<void> {
  const heldBefore = new Date(now.getTime() - (ORDER_EXPIRY_MINUTES + 5) * 60 * 1000)
  for (const hold of await openHolds({ heldBefore })) {
    if (hold.orderId.startsWith(`${ORDER_ID_PREFIX}free_`)) continue
    await settleHold(hold.orderId, hold.heldAt, { terminate: false })
  }
}

/**
 * Grants a plan when a coupon and/or credit leave nothing to pay (see
 * priceCheckout). No Cashfree order exists, so the grant is recorded under a
 * synthetic id with the same prefix as real orders — a ₹0 invoice, the coupon
 * redemption, the credit spent — through the same applyPurchasedPeriod as a
 * paid activation. With no payment to honour, coupon limits and the credit
 * balance are both re-checked strictly inside the transaction.
 */
async function grantFreePeriod(
  userId: string,
  planName: PurchasablePlan,
  billingCycle: "monthly" | "yearly",
  pricing: CheckoutPricing,
): Promise<FreeCheckout> {
  const orderId = `${ORDER_ID_PREFIX}free_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  await applyPurchasedPeriod({
    userId,
    planName,
    billingCycle,
    orderId,
    paymentId: null,
    amountPaise: 0,
    currency: "INR",
    listPaise: pricing.listPaise,
    coupon: pricing.coupon ? { couponId: pricing.coupon.couponId, couponCode: pricing.coupon.code } : null,
    strictCoupon: true,
    creditPaise: pricing.creditAppliedPaise,
    strictCredit: true,
  })
  return { free: true, orderId, planName, billingCycle, amount: 0, currency: "INR" }
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
  //
  // With coupons the expected amount is no longer simply the list price, so the
  // order carries the amount we intended to collect. That tag is server-set and
  // only readable through Cashfree's authenticated API — the same trust level as
  // planName and billingCycle above — but it is still BOUNDED here rather than
  // believed: it may never exceed the list price, and never fall below the
  // minimum chargeable amount. So the worst a bad tag could do is charge the
  // customer correctly and discount nothing; it can never grant a plan for free.
  const listPaise = Math.round(PLAN_PRICES_INR[planName][billingCycle] * 100)

  let expectedPaise = listPaise
  const taggedExpected = tags["expectedPaise"]
  if (taggedExpected !== undefined) {
    const parsed = Number.parseInt(taggedExpected, 10)
    if (!Number.isFinite(parsed) || parsed > listPaise || parsed < MINIMUM_CHARGEABLE_PAISE) {
      logger.error("Cashfree order carries an out-of-range expected amount", {
        orderId, planName, billingCycle, taggedExpected, listPaise,
      })
      throw new AppError(422, "This payment could not be verified. Please contact support.")
    }
    expectedPaise = parsed
  }

  const paidPaise = Math.round(order.order_amount * 100)
  if (paidPaise !== expectedPaise) {
    logger.error("Cashfree order amount does not match what was expected", {
      orderId, planName, billingCycle, expectedPaise, listPaise, paidPaise,
    })
    throw new AppError(422, "The amount paid does not match the plan price. Please contact support.")
  }

  // Only present when a coupon was applied at checkout.
  const couponId = tags["couponId"] ?? null
  const couponCode = tags["couponCode"] ?? null

  // Credit to spend, set by us at order creation. Bounded like expectedPaise:
  // never negative, and never more than the list price.
  let creditPaise = 0
  if (tags["creditPaise"] !== undefined) {
    const parsed = Number.parseInt(tags["creditPaise"], 10)
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > listPaise) {
      logger.error("Cashfree order carries an out-of-range credit amount", { orderId, creditPaise: tags["creditPaise"], listPaise })
      throw new AppError(422, "This payment could not be verified. Please contact support.")
    }
    creditPaise = parsed
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

  return applyPurchasedPeriod({
    userId,
    planName,
    billingCycle,
    orderId,
    paymentId: order.cf_order_id ?? null,
    amountPaise: expectedPaise,
    currency: paidCurrency,
    listPaise,
    coupon: couponId ? { couponId, couponCode } : null,
    creditPaise,
  })
}

/**
 * Grants one billing period of a plan and records what paid for it: the
 * subscription change, the invoice, and the coupon redemption if any, in one
 * transaction keyed on `orderId`; then the after-effects (webhook, scan quota,
 * resuming codes the lapse paused).
 *
 * The single place a plan is granted for a purchase — a Cashfree payment
 * (activateSubscriptionForOrder) or a coupon that makes it free
 * (grantFreePeriodWithCoupon) — so the period rules cannot drift between them.
 */
async function applyPurchasedPeriod(p: {
  userId: string
  planName: PurchasablePlan
  billingCycle: "monthly" | "yearly"
  /** Idempotency key: Invoice.cashfreeOrderId and CouponRedemption.cashfreeOrderId. */
  orderId: string
  /** Cashfree's own id for the order; null when no payment was taken. */
  paymentId: string | null
  /** What was collected, in paise (0 for a free coupon). */
  amountPaise: number
  currency: string
  listPaise: number
  coupon: { couponId: string; couponCode: string | null } | null
  /** Enforce coupon limits inside the transaction — for free grants (see recordRedemption). */
  strictCoupon?: boolean
  /** GenXQR credit this purchase spends, in paise. */
  creditPaise?: number
  /**
   * Free grants: re-check the balance under a per-user lock and refuse if it
   * no longer covers creditPaise. Paid orders skip this — the customer has
   * already paid the reduced amount, so the spend is honoured even if a
   * concurrent checkout used the same credit (the balance then goes negative).
   */
  strictCredit?: boolean
}): Promise<ActivationResult> {
  const { userId, planName, billingCycle, orderId } = p
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
      // One purchase per user at a time. Two different orders for the same user
      // activating together (webhook + browser return, or two payments) used to
      // both read the same currentPeriodEnd — two payments, one extension — and
      // both see "first purchase", doubling the referral rewards.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`purchase:${userId}`}))`
      const creditPaise = p.creditPaise ?? 0
      if (creditPaise > 0) {
        if (p.strictCredit) {
          await lockCredit(tx, userId)
          const { availablePaise } = await getCreditBalance(userId, tx)
          if (availablePaise < creditPaise) {
            throw new AppError(409, "Your credit balance changed. Please review the total and try again.")
          }
        }
        await recordCreditSpend(tx, userId, orderId, creditPaise)
      }

      // A subscription row can also be created OUTSIDE this lock: a new account's
      // trial starts in the background at sign-up, and getOrCreateSubscription
      // runs on ordinary requests. Reading "none" and then creating raced them —
      // the create hit P2002, the handler below took that for "already
      // processed", and the payment was acknowledged but never applied.
      // createMany + skipDuplicates is INSERT … ON CONFLICT DO NOTHING: it waits
      // for such a row instead of failing, and the period is then worked out
      // from whichever row is there. The placeholder's period ends now, so it
      // never counts as a renewal.
      if (!(await tx.subscription.findUnique({ where: { userId }, select: { id: true } }))) {
        await tx.subscription.createMany({
          data: [{ userId, planId: plan.id, status: "ACTIVE", currentPeriodStart: now, currentPeriodEnd: now }],
          skipDuplicates: true,
        })
      }
      const existingSub = await tx.subscription.findUniqueOrThrow({
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
        existingSub.status === "ACTIVE" &&
        existingSub.plan.name === planName &&
        existingSub.currentPeriodEnd > now

      const periodStart = isRenewalOfSamePlan ? existingSub.currentPeriodEnd : now
      const periodEnd = addPeriod(periodStart)

      const sub = await tx.subscription.update({
        where: { userId },
        data: {
          planId: plan.id, status: "ACTIVE", trialEndsAt: null,
          // currentPeriodStart stays put on a renewal so the running period
          // is extended rather than restarted.
          currentPeriodStart: isRenewalOfSamePlan ? existingSub.currentPeriodStart : now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
          codesPauseAt: null,
          lapsedAt: null,
        },
      })

      await tx.invoice.create({
        data: {
          userId,
          subscriptionId: sub.id,
          cashfreePaymentId: p.paymentId,
          cashfreeOrderId: orderId,
          amount: p.amountPaise,
          currency: p.currency,
          status: "paid",
          planName,
          billingCycle,
          // The invoice records what THIS payment bought, which on a renewal is
          // the newly appended period, not the whole extended span.
          periodStart,
          periodEnd,
        },
      })

      // Recorded in the SAME transaction as the invoice, so a redemption can
      // never exist without the payment that earned it — and the unique
      // constraint on cashfreeOrderId means a replayed webhook cannot count the
      // same redemption twice against the coupon's limit.
      if (p.coupon) {
        await recordRedemption(
          tx,
          {
            couponId: p.coupon.couponId,
            userId,
            cashfreeOrderId: orderId,
            originalPaise: p.listPaise,
            // Credit is recorded separately (CreditEntry), so the coupon's own
            // discount is what is left between list price and credit + payment.
            discountPaise: p.listPaise - p.amountPaise - (p.creditPaise ?? 0),
            finalPaise: p.amountPaise,
            planName,
            billingCycle,
          },
          { strict: p.strictCoupon },
        )
      }

      // The buyer's first paid purchase qualifies their referral, if they were
      // referred: both rewards are created, held for REFERRAL_HOLD_DAYS.
      await qualifyReferralInTx(tx, { userId, orderId, amountPaise: p.amountPaise, now })
    })
  } catch (err) {
    // P2002 on cashfreeOrderId: the other path won the race and already
    // activated this order — a success, not a failure. But only if that order's
    // invoice really exists: any OTHER unique violation used to be taken for this
    // too, so a payment that failed to apply was acknowledged as processed and
    // Cashfree never retried it. Rethrown, the webhook answers 500 and it retries.
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
      const processed = await prisma.invoice.findUnique({ where: { cashfreeOrderId: orderId }, select: { id: true } })
      if (processed) {
        logger.info("Activation lost the race — already processed", { orderId, userId })
        return { status: "already_processed" }
      }
      logger.error("Activation hit a unique constraint, but the order was not processed", {
        orderId, userId, target: (err as { meta?: { target?: unknown } }).meta?.target,
      })
    }
    throw err
  }

  logger.info(p.paymentId ? "Subscription activated via Cashfree" : "Subscription granted by a free coupon", {
    userId, planName, billingCycle, orderId, couponCode: p.coupon?.couponCode ?? null, discountPaise: p.listPaise - p.amountPaise,
  })
  void deliverWebhookEvent(userId, "subscription.activated", { planName, billingCycle })

  // Switch back on the codes that lapsing paused. Best-effort: the payment is
  // already recorded, and if this fails the expiry sweep resumes them within
  // 10 minutes (it resumes codes for every account entitled again).
  await invalidateScanQuota(userId)
  await resumeCodesPausedForBilling(userId).catch((err) =>
    logger.error("Failed to resume paused codes after payment", { userId, orderId, error: String(err) }),
  )

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
  // Only our own orders, and only with an owner tag that is this user. On a
  // shared merchant account any order id could be looked up through here
  // (two Cashfree API calls each, and the foreign order's status leaked back).
  if (!isOwnOrderId(orderId)) throw new AppError(404, "Order not found")
  const order = await getOrder(orderId)
  const ownerId = order.order_tags?.["userId"]

  if (ownerId !== userId) {
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

