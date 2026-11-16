/**
 * Trial onboarding emails (built 16 Nov 2026). Before this, someone who started
 * the 14-day Pro trial heard nothing between the verification email and the
 * "trial ends in 7 days" reminder — whether or not they had made a code.
 *
 * Three emails, each in a window counted from the trial's start, so a late run
 * (worker down, email verified late) never sends one long after it fits:
 *
 *   welcome    days 0–3   what the trial includes, three steps, nothing charged
 *   first_code days 2–5   no code yet → where to start; codes but no scans →
 *                         test and print tips; already scanned → not sent
 *   explore    days 5–7   their numbers so far and what to try before it ends
 *
 * Day 7, 11 and 13 belong to the trial reminders (renewal-reminder.service →
 * buildTrialEndingEmail), so this sequence stops before day 7.
 *
 * Rules: verified address, USER role, not blocked, not a member of someone
 * else's team (they work in that owner's workspace), "Getting-started tips"
 * on, at most one of these emails per account per 20 hours. Dedupe is a
 * LimitAlert row per step (insert-as-lock, like the engagement emails); a failed
 * send deletes its row so the next run retries while the window is open.
 * Runs every 10 minutes from the subscription-expiry worker.
 */
import { prisma } from "../db/prisma.js"
import { env } from "../config/env.js"
import { logger } from "../logger/index.js"
import { readPrefs } from "../utils/notification-prefs.util.js"
import { isAccountBlocked } from "./blocklist.service.js"
import { PLAN_LIMITS, PLAN_PRICES_INR, UNLIMITED_SCANS } from "./billing.service.js"
import {
  buildOnboardingExploreEmail,
  buildOnboardingFirstCodeEmail,
  buildOnboardingWelcomeEmail,
  sendEmail,
} from "./email.service.js"

const DAY_MS = 24 * 60 * 60 * 1000
const LIMIT_TYPE = "onboarding"
/** Minimum gap between two onboarding emails to one account. */
const MIN_GAP_MS = 20 * 60 * 60 * 1000

export const ONBOARDING_STEPS = [
  { key: "welcome", threshold: 1, fromDay: 0, toDay: 3 },
  { key: "first_code", threshold: 2, fromDay: 2, toDay: 5 },
  { key: "explore", threshold: 3, fromDay: 5, toDay: 7 },
] as const
type StepKey = (typeof ONBOARDING_STEPS)[number]["key"]

/** "18 November" in India time — trial dates are shown to people in IST. */
export function istDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", timeZone: "Asia/Kolkata" })
}

export interface TrialUsage {
  codes: number
  uniqueScans: number
  /** Things this account uses that Starter does not include, in plain words. */
  starterLacks: string[]
  /** The cheapest plan that keeps everything the account uses today. */
  suggested: "STARTER" | "PRO"
  /** Unique scans per 30 days at the trial's rate so far; null before a full day. */
  monthlyScanPace: number | null
}

/**
 * What the account has used during its trial, and which plan keeps all of it.
 * Facts only: counts from the database and the limits in PLAN_LIMITS.
 */
export async function trialUsage(userId: string, trialStart: Date, now = new Date()): Promise<TrialUsage> {
  const [codes, uniqueScans, routing, abTests, teamMembers, apiKeys, webhooks, domains] = await Promise.all([
    prisma.qRCode.count({ where: { userId } }),
    prisma.qRScan.count({ where: { qrCode: { userId }, isUnique: true, scannedAt: { gte: trialStart } } }),
    prisma.smartRoutingRule.count({ where: { qrCode: { userId } } }),
    prisma.qRCode.count({ where: { userId, abTestEnabled: true } }),
    prisma.teamMember.count({ where: { team: { ownerId: userId }, userId: { not: userId } } }),
    prisma.apiKey.count({ where: { userId, isActive: true } }),
    prisma.webhook.count({ where: { userId, isActive: true } }),
    prisma.customDomain.count({ where: { userId } }),
  ])
  const starter = PLAN_LIMITS.STARTER
  const elapsedDays = (now.getTime() - trialStart.getTime()) / DAY_MS
  const monthlyScanPace = elapsedDays >= 1 ? Math.round((uniqueScans / elapsedDays) * 30) : null

  const starterLacks: string[] = []
  if (codes > starter.dynamicQRLimit) starterLacks.push(`more than ${starter.dynamicQRLimit} QR codes (you have ${codes})`)
  if (monthlyScanPace !== null && monthlyScanPace > starter.scanLimitPerMonth) {
    starterLacks.push(`more than ${starter.scanLimitPerMonth.toLocaleString("en-IN")} scans a month (you are at about ${monthlyScanPace.toLocaleString("en-IN")})`)
  }
  if (routing > 0 && !starter.smartRouting) starterLacks.push("smart routing")
  if (abTests > 0 && !starter.abTesting) starterLacks.push("A/B tests")
  if (teamMembers > 0 && starter.teamSeatsLimit <= 1) starterLacks.push("team members")
  if ((apiKeys > 0 || webhooks > 0) && !starter.apiAccess) starterLacks.push("the API and webhooks")
  if (domains > 0 && starter.customDomainsLimit === 0) starterLacks.push("your own domain")

  return { codes, uniqueScans, starterLacks, suggested: starterLacks.length ? "PRO" : "STARTER", monthlyScanPace }
}

/** Plan facts for email copy, read from the same tables that price checkout. */
export function planFacts() {
  const s = PLAN_LIMITS.STARTER
  const p = PLAN_LIMITS.PRO
  return {
    starter: {
      monthly: PLAN_PRICES_INR.STARTER.monthly,
      yearly: PLAN_PRICES_INR.STARTER.yearly,
      codes: s.dynamicQRLimit,
      scans: s.scanLimitPerMonth,
    },
    pro: {
      monthly: PLAN_PRICES_INR.PRO.monthly,
      yearly: PLAN_PRICES_INR.PRO.yearly,
      codes: p.dynamicQRLimit,
      unlimitedScans: p.scanLimitPerMonth === UNLIMITED_SCANS,
      teamSeats: p.teamSeatsLimit,
    },
  }
}

async function claim(userId: string, threshold: number, periodKey: string): Promise<string | null> {
  try {
    const row = await prisma.limitAlert.create({ data: { userId, limitType: LIMIT_TYPE, threshold, periodKey } })
    return row.id
  } catch {
    return null
  }
}

/** Sends whichever onboarding email is due for each trialing account. */
export async function sendOnboardingEmails(now = new Date()): Promise<{ sent: number }> {
  const earliestStart = new Date(now.getTime() - 7 * DAY_MS)
  const subs = await prisma.subscription.findMany({
    where: {
      status: "TRIALING",
      currentPeriodEnd: { gt: now },
      currentPeriodStart: { gte: earliestStart, lte: now },
      user: { role: "USER", emailVerified: true },
    },
    select: {
      currentPeriodStart: true,
      currentPeriodEnd: true,
      user: { select: { id: true, name: true, email: true, notificationPrefs: true } },
    },
  })

  let sent = 0
  for (const sub of subs) {
    const { user } = sub
    try {
      if (!readPrefs(user.notificationPrefs).gettingStartedTips) continue
      const ageDays = (now.getTime() - sub.currentPeriodStart.getTime()) / DAY_MS
      const due = ONBOARDING_STEPS.filter((s) => ageDays >= s.fromDay && ageDays < s.toDay)
      if (due.length === 0) continue

      const periodKey = sub.currentPeriodStart.toISOString().slice(0, 10)
      const previous = await prisma.limitAlert.findMany({
        where: { userId: user.id, limitType: LIMIT_TYPE, periodKey },
        select: { threshold: true, sentAt: true },
      })
      if (previous.some((p) => now.getTime() - p.sentAt.getTime() < MIN_GAP_MS)) continue
      const step = due.find((s) => !previous.some((p) => p.threshold === s.threshold))
      if (!step) continue

      // Checked late: these need queries, and most accounts stop above.
      const inOthersTeam = await prisma.teamMember.count({ where: { userId: user.id, team: { ownerId: { not: user.id } } } })
      if (inOthersTeam > 0) continue
      if (await isAccountBlocked(user.id, user.email)) continue

      const email = await composeStep(step.key, user, sub.currentPeriodStart, sub.currentPeriodEnd, now)
      if (!email) continue // e.g. first_code for an account whose code is already being scanned

      const claimId = await claim(user.id, step.threshold, periodKey)
      if (!claimId) continue
      try {
        await sendEmail({ to: user.email, subject: email.subject, html: email.html })
      } catch (err) {
        await prisma.limitAlert.delete({ where: { id: claimId } }).catch(() => {})
        throw err
      }
      await prisma.emailLog
        .create({
          data: {
            userId: user.id,
            to: user.email,
            subject: email.subject,
            template: `onboarding-${step.key}`,
            status: "sent",
            provider: env.RESEND_API_KEY ? "resend" : env.SMTP_HOST ? "smtp" : "console",
          },
        })
        .catch(() => {})
      sent++
    } catch (err) {
      logger.error("Onboarding email failed", { userId: user.id, error: String(err) })
    }
  }
  if (sent) logger.info("Onboarding emails sent", { sent })
  return { sent }
}

async function composeStep(
  key: StepKey,
  user: { id: string; name: string },
  trialStart: Date,
  trialEnd: Date,
  now: Date,
): Promise<{ subject: string; html: string } | null> {
  const app = `${env.FRONTEND_URL}/app`
  const settingsUrl = `${app}/settings`
  const trialEndsOn = istDate(trialEnd)

  if (key === "welcome") {
    return buildOnboardingWelcomeEmail({
      name: user.name,
      trialEndsOn,
      proCodes: PLAN_LIMITS.PRO.dynamicQRLimit,
      createUrl: `${app}/create`,
      settingsUrl,
    })
  }

  const usage = await trialUsage(user.id, trialStart, now)

  if (key === "first_code") {
    if (usage.codes > 0 && usage.uniqueScans > 0) return null
    return buildOnboardingFirstCodeEmail({
      name: user.name,
      variant: usage.codes === 0 ? "no_codes" : "no_scans",
      createUrl: (type: string) => `${app}/create?type=${type}`,
      codesUrl: `${app}/qr-codes`,
      printGuideUrl: `${env.FRONTEND_URL}/blog/qr-codes-that-scan-print-checklist`,
      settingsUrl,
    })
  }

  return buildOnboardingExploreEmail({
    name: user.name,
    trialEndsOn,
    codes: usage.codes,
    uniqueScans: usage.uniqueScans,
    plans: planFacts(),
    urls: {
      create: `${app}/create`,
      codes: `${app}/qr-codes`,
      analytics: `${app}/analytics`,
      places: `${app}/places`,
      pricing: `${env.FRONTEND_URL}/pricing`,
      billing: `${app}/billing`,
    },
    settingsUrl,
  })
}
