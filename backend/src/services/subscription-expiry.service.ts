/**
 * Subscription expiry: what happens when a paid period or trial ends.
 *
 * Until this existed, nothing did. Payments are one-time Cashfree orders with no
 * auto-debit, so "renewing" means paying again — and a customer who paid for
 * one month kept that plan indefinitely, because no code ever acted on
 * currentPeriodEnd. Trials were downgraded to FREE, but their codes kept working.
 *
 * The rule (decided 17 Oct 2026):
 *   - No grace period. The moment the paid period or trial ends, the account
 *     drops to FREE and its active dynamic QR codes are PAUSED: scanners see the
 *     "deactivated" page, or the code's fallback URL if it has one.
 *   - Paying again switches back on exactly the codes this paused
 *     (`pausedForBilling`), never ones the owner had turned off themselves.
 *   - Accounts that had already lapsed when this shipped got 7 days' notice
 *     (Subscription.codesPauseAt, set by the 20261017130000 migration).
 *
 * Two triggers, one implementation: getUserPlanLimits() expires an account the
 * moment its owner makes a request, and the subscription-expiry worker sweeps
 * every 10 minutes so codes pause on time even if the owner never logs in.
 * Both call expireSubscription(), which is idempotent.
 */
import type { PlanName, SubscriptionStatus } from "@prisma/client"
import { prisma } from "../db/prisma.js"
import { env } from "../config/env.js"
import { logger } from "../logger/index.js"
import { invalidateQRCache } from "./scan.service.js"
import { invalidateScanQuota } from "./scan-quota.service.js"
import { buildCodesPauseNoticeEmail, buildExpiredNoticeEmail, sendEmail } from "./email.service.js"

/** The subscription fields that decide whether an account has lapsed. */
export interface LapseCheckable {
  status: SubscriptionStatus
  trialEndsAt: Date | null
  currentPeriodEnd: Date
  codesPauseAt: Date | null
  plan: { name: PlanName | string }
}

/** When the paid-for (or trial) time ends. A trial ends at trialEndsAt. */
function entitlementEnd(sub: LapseCheckable): Date {
  return sub.status === "TRIALING" && sub.trialEndsAt ? sub.trialEndsAt : sub.currentPeriodEnd
}

/**
 * True when a non-FREE plan's time is up and no notice period is still running.
 * Pure — safe to call on unauthenticated paths (see getPlanLimitsReadOnly).
 */
export function isLapsed(sub: LapseCheckable, now = new Date()): boolean {
  if (sub.plan.name === "FREE") return false
  if (sub.status !== "ACTIVE" && sub.status !== "TRIALING") return false
  if (sub.codesPauseAt && sub.codesPauseAt > now) return false
  return entitlementEnd(sub) < now
}

/**
 * Immediately drops an account to FREE and pauses its stored codes — used when
 * an admin refunds a payment and chooses to also pull access (refund.service).
 * Unconditional (unlike expireSubscription, which only acts on a lapsed plan):
 * a refund can revoke a still-running paid period. Idempotent on FREE.
 */
export async function revokeToFreeForRefund(userId: string): Promise<void> {
  const sub = await prisma.subscription.findUnique({ where: { userId }, include: { plan: true } })
  if (!sub || sub.plan.name === "FREE") return
  const freePlan = await prisma.plan.findUniqueOrThrow({ where: { name: "FREE" } })
  const now = new Date()
  await prisma.subscription.update({
    where: { userId },
    data: {
      planId: freePlan.id, status: "ACTIVE", trialEndsAt: null, cancelAtPeriodEnd: false,
      codesPauseAt: null, lapsedAt: now, currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()),
    },
  })
  await invalidateScanQuota(userId)
  const paused = await pauseCodesForBilling(userId)
  logger.info("Access revoked to FREE after a refund", { userId, pausedCodes: paused })
}

/**
 * Switches off the owner's active codes and marks them as paused by us.
 * Returns how many were paused.
 *
 * Every category, STATIC included. A stored code's printed image always
 * encodes /r/<slug> (frontend lib/qrDownload.ts), whatever its category, so a
 * "STATIC" code is redirected — and editable — exactly like a DYNAMIC one.
 * Exempting it let anyone create codes as STATIC through the API during a
 * trial and keep live, editable codes forever after the plan lapsed. Truly
 * static codes (/api/static/generate) are never stored, so they are untouched.
 */
export async function pauseCodesForBilling(userId: string): Promise<number> {
  const codes = await prisma.qRCode.findMany({
    where: { userId, isActive: true },
    select: { id: true, slug: true },
  })
  if (codes.length === 0) return 0

  await prisma.qRCode.updateMany({
    where: { id: { in: codes.map((c) => c.id) } },
    data: { isActive: false, pausedForBilling: true },
  })
  // The scan path caches each code for 10 minutes; without this a paused code
  // would keep redirecting until its cache entry expired.
  await Promise.all(codes.map((c) => invalidateQRCache(c.slug)))
  logger.info("Paused dynamic QR codes for lapsed plan", { userId, count: codes.length })
  return codes.length
}

/** Switches back on only the codes pauseCodesForBilling switched off. */
export async function resumeCodesPausedForBilling(userId: string): Promise<number> {
  const codes = await prisma.qRCode.findMany({
    where: { userId, pausedForBilling: true },
    select: { id: true, slug: true, disabledByAdminAt: true },
  })
  if (codes.length === 0) return 0

  // A code an admin took down stays off; it is only no longer "paused for billing".
  await prisma.qRCode.updateMany({
    where: { id: { in: codes.filter((c) => !c.disabledByAdminAt).map((c) => c.id) } },
    data: { isActive: true, pausedForBilling: false },
  })
  await prisma.qRCode.updateMany({
    where: { id: { in: codes.filter((c) => c.disabledByAdminAt).map((c) => c.id) } },
    data: { pausedForBilling: false },
  })
  await Promise.all(codes.map((c) => invalidateQRCache(c.slug)))
  logger.info("Resumed QR codes paused for billing", { userId, count: codes.length })
  return codes.length
}

/** How many of this owner's codes are paused for billing — shown in the dashboard. */
export function countCodesPausedForBilling(userId: string): Promise<number> {
  return prisma.qRCode.count({ where: { userId, pausedForBilling: true } })
}

const toDateKey = (d: Date) => d.toISOString().slice(0, 10)
/**
 * Scan history is kept while a plan is live and for this many months after the
 * account drops to FREE, then purged (pass 5 below). Decided 18 Oct 2026.
 */
export const SCAN_HISTORY_MONTHS_AFTER_LAPSE = 3

/** lapsedAt + 3 calendar months (UTC), clamped to month end. */
export function historyDeletionDate(lapsedAt: Date): Date {
  const y = lapsedAt.getUTCFullYear()
  const m = lapsedAt.getUTCMonth() + SCAN_HISTORY_MONTHS_AFTER_LAPSE
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m, Math.min(lapsedAt.getUTCDate(), lastDay),
    lapsedAt.getUTCHours(), lapsedAt.getUTCMinutes(), lapsedAt.getUTCSeconds()))
}

/**
 * Deletes an owner's scan history: raw scans, daily rollups, and the per-code
 * counters derived from them. The QR codes themselves stay (paused) so the
 * owner can renew and carry on with the same printed codes.
 */
export async function purgeScanHistory(userId: string): Promise<number> {
  const codes = await prisma.qRCode.findMany({ where: { userId }, select: { id: true, slug: true } })
  if (codes.length === 0) return 0
  const qrIds = codes.map((c) => c.id)
  const [scans] = await prisma.$transaction([
    prisma.qRScan.deleteMany({ where: { qrId: { in: qrIds } } }),
    prisma.qRScanDaily.deleteMany({ where: { qrId: { in: qrIds } } }),
    prisma.aBTestVariant.updateMany({ where: { qrId: { in: qrIds } }, data: { scanCount: 0 } }),
    prisma.qRCode.updateMany({
      where: { id: { in: qrIds } },
      data: { scanCount: 0, uniqueScanCount: 0, lastScannedAt: null },
    }),
  ])
  // The scan path caches scanCount; drop it so the per-code counter restarts at 0.
  await Promise.all(codes.map((c) => invalidateQRCache(c.slug)))
  logger.info("Purged scan history 3 months after lapse", { userId, scans: scans.count })
  return scans.count
}

const toDisplayDate = (d: Date) =>
  d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })

/**
 * Sends a billing email at most once per (subscription, type, periodKey), using
 * the RenewalReminder table's unique key as the lock — the same dedupe the
 * renewal reminders use, so a webhook race or a second worker cannot double-send.
 */
async function sendOnce(opts: {
  subscriptionId: string
  userId: string
  to: string
  reminderType: "expired" | "pause_notice"
  periodKey: string
  subject: string
  html: string
}): Promise<void> {
  try {
    await prisma.renewalReminder.create({
      data: {
        subscriptionId: opts.subscriptionId,
        userId: opts.userId,
        reminderType: opts.reminderType,
        periodKey: opts.periodKey,
        status: "sent",
      },
    })
  } catch {
    return // already sent for this period
  }

  const provider = env.RESEND_API_KEY ? "resend" : env.SMTP_HOST ? "smtp" : "console"
  try {
    await sendEmail({ to: opts.to, subject: opts.subject, html: opts.html })
    await prisma.emailLog.create({
      data: { userId: opts.userId, to: opts.to, subject: opts.subject, template: `renewal-${opts.reminderType}`, status: "sent", provider },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error("Billing email failed", { userId: opts.userId, type: opts.reminderType, error: message })
    await prisma.renewalReminder.updateMany({
      where: { subscriptionId: opts.subscriptionId, reminderType: opts.reminderType, periodKey: opts.periodKey },
      data: { status: "failed", error: message },
    })
    await prisma.emailLog.create({
      data: { userId: opts.userId, to: opts.to, subject: opts.subject, template: `renewal-${opts.reminderType}`, status: "failed", provider, error: message },
    })
  }
}

/**
 * Drops a lapsed subscription to FREE, pauses its codes and emails the owner.
 *
 * Idempotent and race-safe: the downgrade is a conditional update matched on the
 * exact plan and period that lapsed, so if the request path and the worker both
 * get here, only one of them does anything. Returns false if this call did not
 * perform the expiry (not lapsed, or someone else already did).
 */
export async function expireSubscription(userId: string): Promise<boolean> {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    include: { plan: true, user: { select: { email: true, name: true } } },
  })
  if (!sub || !isLapsed(sub)) return false

  const freePlan = await prisma.plan.findUniqueOrThrow({ where: { name: "FREE" } })
  const now = new Date()
  const wasTrial = sub.status === "TRIALING"
  const endedAt = entitlementEnd(sub)

  const { count } = await prisma.subscription.updateMany({
    where: { id: sub.id, planId: sub.planId, currentPeriodEnd: sub.currentPeriodEnd, status: sub.status },
    data: {
      planId: freePlan.id,
      status: "ACTIVE",
      trialEndsAt: null,
      cancelAtPeriodEnd: false,
      codesPauseAt: null,
      lapsedAt: now,
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()),
    },
  })
  if (count === 0) return false // lost the race; the winner pauses and emails
  await invalidateScanQuota(userId)

  const paused = await pauseCodesForBilling(userId)
  logger.info("Subscription expired", { userId, plan: sub.plan.name, wasTrial, pausedCodes: paused })

  await sendOnce({
    subscriptionId: sub.id,
    userId,
    to: sub.user.email,
    reminderType: "expired",
    periodKey: toDateKey(endedAt),
    subject: wasTrial
      ? `Your ${sub.plan.displayName} trial has ended — GenXQR`
      : `Your ${sub.plan.displayName} plan has expired — GenXQR`,
    html: buildExpiredNoticeEmail(sub.user.name, sub.plan.displayName, `${env.FRONTEND_URL}/app/billing`, {
      wasTrial,
      pausedCodes: paused,
      historyKeptUntil: toDisplayDate(historyDeletionDate(now)),
    }),
  })
  return true
}

/**
 * The 10-minute sweep. Four passes:
 *   1. Notice emails for accounts in their one-time 7-day notice period.
 *   2. Expire every lapsed paid plan or trial.
 *   3. Pause codes on FREE accounts whose notice has run out (trials that ended
 *      before enforcement shipped — their plan is already FREE, so pass 2 does
 *      not see them).
 *   4. Resume paused codes on accounts that have a live paid plan again.
 *   5. Purge scan history 3 months after an account dropped to FREE.
 */
export async function enforceSubscriptionExpiry(): Promise<void> {
  const now = new Date()
  const billingUrl = `${env.FRONTEND_URL}/app/billing`

  // ── 1. Notice period ──────────────────────────────────────────────────────
  const noticed = await prisma.subscription.findMany({
    where: { codesPauseAt: { gt: now } },
    select: { id: true, userId: true, codesPauseAt: true, lapsedAt: true, user: { select: { email: true, name: true } } },
  })
  for (const sub of noticed) {
    const activeCodes = await prisma.qRCode.count({
      where: { userId: sub.userId, isActive: true },
    })
    if (activeCodes === 0) continue // nothing will pause; no reason to email
    await sendOnce({
      subscriptionId: sub.id,
      userId: sub.userId,
      to: sub.user.email,
      reminderType: "pause_notice",
      periodKey: toDateKey(sub.codesPauseAt!),
      subject: `Your GenXQR QR codes will pause on ${toDisplayDate(sub.codesPauseAt!)}`,
      html: buildCodesPauseNoticeEmail(
        sub.user.name,
        toDisplayDate(sub.codesPauseAt!),
        activeCodes,
        billingUrl,
        // Already-FREE accounts started their 3 months at deploy (lapsedAt, set by
        // the migration); paid accounts lapse — and start theirs — at the pause date.
        toDisplayDate(historyDeletionDate(sub.lapsedAt ?? sub.codesPauseAt!)),
      ),
    })
  }

  // ── 2. Lapsed paid plans and trials ──────────────────────────────────────
  const candidates = await prisma.subscription.findMany({
    where: {
      status: { in: ["ACTIVE", "TRIALING"] },
      plan: { name: { not: "FREE" } },
      OR: [{ currentPeriodEnd: { lt: now } }, { trialEndsAt: { lt: now } }],
    },
    select: { userId: true, status: true, trialEndsAt: true, currentPeriodEnd: true, codesPauseAt: true, plan: { select: { name: true } } },
  })
  let expired = 0
  for (const sub of candidates) {
    if (!isLapsed(sub, now)) continue
    try {
      if (await expireSubscription(sub.userId)) expired++
    } catch (err) {
      logger.error("Failed to expire subscription", { userId: sub.userId, error: String(err) })
    }
  }

  // ── 3. FREE accounts past their notice date ──────────────────────────────
  const freeDue = await prisma.subscription.findMany({
    where: { plan: { name: "FREE" }, codesPauseAt: { lte: now } },
    select: { id: true, userId: true },
  })
  for (const sub of freeDue) {
    try {
      await pauseCodesForBilling(sub.userId)
      await prisma.subscription.update({ where: { id: sub.id }, data: { codesPauseAt: null } })
    } catch (err) {
      logger.error("Failed to pause codes after notice", { userId: sub.userId, error: String(err) })
    }
  }

  // ── 4. Accounts entitled again ───────────────────────────────────────────
  // Codes we paused, on an account that now has a live paid plan: resume them.
  // Payment resumes inline, so this is the safety net for that failing, and the
  // path by which an admin-granted plan switches codes back on.
  const pausedOwners = await prisma.qRCode.findMany({
    where: { pausedForBilling: true, userId: { not: null } },
    distinct: ["userId"],
    select: { userId: true },
  })
  let resumed = 0
  for (const { userId } of pausedOwners) {
    const sub = await prisma.subscription.findUnique({
      where: { userId: userId! },
      select: { status: true, trialEndsAt: true, currentPeriodEnd: true, codesPauseAt: true, plan: { select: { name: true } } },
    })
    if (!sub || sub.plan.name === "FREE" || isLapsed(sub, now)) continue
    try {
      resumed += await resumeCodesPausedForBilling(userId!)
    } catch (err) {
      logger.error("Failed to resume codes for entitled account", { userId, error: String(err) })
    }
  }

  // ── 5. Scan history past its 3 months ────────────────────────────────────
  // Only accounts that still have something to delete, so already-purged
  // accounts drop out of this query (purging resets scanCount to 0).
  const purgeDue = await prisma.subscription.findMany({
    where: {
      plan: { name: "FREE" },
      lapsedAt: { not: null },
      user: { qrCodes: { some: { scanCount: { gt: 0 } } } },
    },
    select: { userId: true, lapsedAt: true },
    take: 100, // bounded per sweep; the next sweep picks up the rest
  })
  let purged = 0
  for (const sub of purgeDue) {
    if (historyDeletionDate(sub.lapsedAt!) > now) continue
    try {
      await purgeScanHistory(sub.userId)
      purged++
    } catch (err) {
      logger.error("Failed to purge scan history", { userId: sub.userId, error: String(err) })
    }
  }

  if (expired || freeDue.length || resumed || purged) {
    logger.info("Subscription expiry sweep", {
      expired, pausedAfterNotice: freeDue.length, resumedCodes: resumed, purgedAccounts: purged,
    })
  }
}
