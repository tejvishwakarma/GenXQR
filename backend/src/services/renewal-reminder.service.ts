import { prisma } from "../db/prisma.js"
import { logger } from "../logger/index.js"
import { env } from "../config/env.js"
import { sendEmail, buildRenewalReminderEmail, buildExpiredNoticeEmail } from "./email.service.js"

type ReminderType = "7_days" | "3_days" | "1_day" | "expired" | "manual"

// Days-before thresholds for automated reminders
const AUTO_THRESHOLDS: { type: ReminderType; days: number }[] = [
  { type: "7_days", days: 7 },
  { type: "3_days", days: 3 },
  { type: "1_day",  days: 1 },
]

/** Returns YYYY-MM-DD string for a Date */
function toDateKey(date: Date): string {
  return date.toISOString().split("T")[0]!
}

/**
 * Core send function. Attempts dedup insert first, then sends email,
 * then updates the log row with result.
 * Returns true if sent, false if skipped (already sent) or failed.
 */
async function attemptSend(opts: {
  subscriptionId: string
  userId: string
  userEmail: string
  userName: string
  planName: string
  planDisplayName: string
  reminderType: ReminderType
  periodKey: string
  expiryDate: string
  daysLeft: number | null  // null = already expired
}): Promise<{ sent: boolean; skipped: boolean; error?: string }> {
  const paymentUrl = `${env.FRONTEND_URL}/app/billing`

  // Atomic dedup — if unique constraint fires, this subscription+type+period was already notified
  let reminderId: string
  try {
    const row = await prisma.renewalReminder.create({
      data: {
        subscriptionId: opts.subscriptionId,
        userId: opts.userId,
        reminderType: opts.reminderType,
        periodKey: opts.periodKey,
        status: "sent", // optimistic — will update to "failed" if email fails
      },
    })
    reminderId = row.id
  } catch {
    // Unique constraint violation = already sent for this period
    return { sent: false, skipped: true }
  }

  try {
    const html =
      opts.daysLeft === null
        ? buildExpiredNoticeEmail(opts.userName, opts.planDisplayName, paymentUrl)
        : buildRenewalReminderEmail(opts.userName, opts.daysLeft, opts.planDisplayName, opts.expiryDate, paymentUrl)

    const subject =
      opts.daysLeft === null
        ? `Your ${opts.planDisplayName} plan has expired — GenXQR`
        : `Your ${opts.planDisplayName} plan expires ${opts.daysLeft === 1 ? "today" : `in ${opts.daysLeft} days`} — GenXQR`

    await sendEmail({ to: opts.userEmail, subject, html })

    // Log to EmailLog
    await prisma.emailLog.create({
      data: {
        userId: opts.userId,
        to: opts.userEmail,
        subject,
        template: `renewal-${opts.reminderType}`,
        status: "sent",
        provider: env.RESEND_API_KEY ? "resend" : env.SMTP_HOST ? "smtp" : "console",
      },
    })

    return { sent: true, skipped: false }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    // Roll back optimistic status to "failed"
    await prisma.renewalReminder.update({
      where: { id: reminderId },
      data: { status: "failed", error: message },
    })

    await prisma.emailLog.create({
      data: {
        userId: opts.userId,
        to: opts.userEmail,
        subject: opts.daysLeft === null
          ? `Your ${opts.planDisplayName} plan has expired — GenXQR`
          : `Your ${opts.planDisplayName} plan expires soon — GenXQR`,
        template: `renewal-${opts.reminderType}`,
        status: "failed",
        error: message,
        provider: env.RESEND_API_KEY ? "resend" : env.SMTP_HOST ? "smtp" : "console",
      },
    })

    return { sent: false, skipped: false, error: message }
  }
}

/**
 * Runs daily: finds subscriptions expiring in 1/3/7 days and already-expired
 * subscriptions (still marked ACTIVE), sends reminder emails with deduplication.
 */
export async function checkAndSendRenewalReminders(): Promise<void> {
  const now = new Date()
  logger.info("Running renewal reminder check...")

  let totalSent = 0
  let totalSkipped = 0
  let totalFailed = 0

  // ── 1. Upcoming expiry reminders ─────────────────────────────────────────────
  for (const { type, days } of AUTO_THRESHOLDS) {
    // Window: subscriptions whose currentPeriodEnd falls within [targetDate - 12h, targetDate + 12h]
    const targetMs = now.getTime() + days * 24 * 60 * 60 * 1000
    const windowStart = new Date(targetMs - 12 * 60 * 60 * 1000)
    const windowEnd   = new Date(targetMs + 12 * 60 * 60 * 1000)

    const subs = await prisma.subscription.findMany({
      where: {
        status: { in: ["ACTIVE", "TRIALING"] },
        currentPeriodEnd: { gte: windowStart, lte: windowEnd },
        plan: { name: { not: "FREE" } },
      },
      select: {
        id: true,
        currentPeriodEnd: true,
        plan: { select: { name: true, displayName: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    })

    for (const sub of subs) {
      const result = await attemptSend({
        subscriptionId: sub.id,
        userId: sub.user.id,
        userEmail: sub.user.email,
        userName: sub.user.name,
        planName: sub.plan.name,
        planDisplayName: sub.plan.displayName,
        reminderType: type,
        periodKey: toDateKey(sub.currentPeriodEnd),
        expiryDate: sub.currentPeriodEnd.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
        daysLeft: days,
      })

      if (result.sent)    totalSent++
      else if (result.skipped) totalSkipped++
      else totalFailed++
    }
  }

  // ── 2. Already-expired reminders ──────────────────────────────────────────────
  // Subscriptions that passed their period end but are still ACTIVE (lazy downgrade pattern)
  // Only look back up to 3 days to avoid spamming very old expirations
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)

  const expiredSubs = await prisma.subscription.findMany({
    where: {
      status: { in: ["ACTIVE", "TRIALING"] },
      currentPeriodEnd: { gte: threeDaysAgo, lt: now },
      plan: { name: { not: "FREE" } },
    },
    select: {
      id: true,
      currentPeriodEnd: true,
      plan: { select: { name: true, displayName: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  })

  for (const sub of expiredSubs) {
    const result = await attemptSend({
      subscriptionId: sub.id,
      userId: sub.user.id,
      userEmail: sub.user.email,
      userName: sub.user.name,
      planName: sub.plan.name,
      planDisplayName: sub.plan.displayName,
      reminderType: "expired",
      periodKey: toDateKey(sub.currentPeriodEnd),
      expiryDate: sub.currentPeriodEnd.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
      daysLeft: null,
    })

    if (result.sent)    totalSent++
    else if (result.skipped) totalSkipped++
    else totalFailed++
  }

  logger.info(`Renewal reminder check complete — sent: ${totalSent}, skipped: ${totalSkipped}, failed: ${totalFailed}`)
}

/**
 * Admin-triggered manual reminder send.
 * Sends a renewal reminder to each of the provided subscription IDs.
 * Uses today's date as periodKey so at most one manual send per subscription per day.
 */
export async function sendManualReminders(
  subscriptionIds: string[],
): Promise<{ sent: number; skipped: number; failed: number; results: { subscriptionId: string; status: string; error?: string }[] }> {
  const todayKey = toDateKey(new Date())
  const results: { subscriptionId: string; status: string; error?: string }[] = []

  const subs = await prisma.subscription.findMany({
    where: { id: { in: subscriptionIds } },
    select: {
      id: true,
      currentPeriodEnd: true,
      plan: { select: { name: true, displayName: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  })

  let sent = 0, skipped = 0, failed = 0

  for (const sub of subs) {
    const now = new Date()
    const daysLeft = Math.ceil((sub.currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    const result = await attemptSend({
      subscriptionId: sub.id,
      userId: sub.user.id,
      userEmail: sub.user.email,
      userName: sub.user.name,
      planName: sub.plan.name,
      planDisplayName: sub.plan.displayName,
      reminderType: "manual",
      periodKey: todayKey,
      expiryDate: sub.currentPeriodEnd.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
      daysLeft: daysLeft > 0 ? daysLeft : null,
    })

    if (result.sent)         { sent++;    results.push({ subscriptionId: sub.id, status: "sent" }) }
    else if (result.skipped) { skipped++; results.push({ subscriptionId: sub.id, status: "skipped" }) }
    else                     { failed++;  results.push({ subscriptionId: sub.id, status: "failed", error: result.error }) }
  }

  return { sent, skipped, failed, results }
}
