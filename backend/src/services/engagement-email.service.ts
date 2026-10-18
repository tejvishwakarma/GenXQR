/**
 * Opt-out engagement emails behind the Settings → Notifications toggles
 * (decided 18 Oct 2026; before that the toggles existed but nothing read them):
 *
 *   scanMilestoneAlerts   — per QR code, when its total scans (repeats included)
 *                           first reach 100, 1,000 and 10,000.
 *   weeklyAnalyticsDigest — Monday 9:00 am IST, covering the previous
 *                           Monday 00:00 – Sunday 24:00 IST. Skipped for a week
 *                           with no scans, so an idle account is not emailed.
 *
 * Dedupe uses the LimitAlert table's unique (userId, limitType, threshold,
 * periodKey) — the same row-insert-as-lock as the usage-limit emails — so a
 * retried job or a second worker process cannot send twice.
 */
import { prisma } from "../db/prisma.js"
import { env } from "../config/env.js"
import { logger } from "../logger/index.js"
import { readPrefs } from "../utils/notification-prefs.util.js"
import { buildScanMilestoneEmail, buildWeeklyDigestEmail, sendEmail } from "./email.service.js"

export const SCAN_MILESTONES = [100, 1_000, 10_000] as const

/** Inserts the dedupe row; false if this alert was already sent. */
async function claimAlert(userId: string, limitType: string, threshold: number, periodKey: string): Promise<boolean> {
  try {
    await prisma.limitAlert.create({ data: { userId, limitType, threshold, periodKey } })
    return true
  } catch {
    return false
  }
}

/**
 * Called by the scan worker after it increments a code's scanCount. Sends the
 * milestone email if this scan took the count across one.
 */
export async function maybeSendScanMilestone(qrId: string, newScanCount: number): Promise<void> {
  const milestone = SCAN_MILESTONES.find((m) => newScanCount >= m && newScanCount - 1 < m)
  if (!milestone) return

  const qr = await prisma.qRCode.findUnique({
    where: { id: qrId },
    select: { name: true, user: { select: { id: true, name: true, email: true, notificationPrefs: true } } },
  })
  if (!qr?.user) return
  if (!readPrefs(qr.user.notificationPrefs).scanMilestoneAlerts) return
  if (!(await claimAlert(qr.user.id, "scan_milestone", milestone, qrId))) return

  const { subject, html } = buildScanMilestoneEmail({
    name: qr.user.name,
    qrName: qr.name,
    milestone,
    analyticsUrl: `${env.FRONTEND_URL}/app/qr/${qrId}/analytics`,
    settingsUrl: `${env.FRONTEND_URL}/app/settings`,
  })
  try {
    await sendEmail({ to: qr.user.email, subject, html })
  } catch (err) {
    logger.error("Milestone email failed", { qrId, milestone, error: String(err) })
  }
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

/** The most recent Monday 00:00 IST at or before `now`, as a UTC instant. */
export function startOfIstWeek(now: Date): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS) // shift so UTC getters read IST
  const daysSinceMonday = (ist.getUTCDay() + 6) % 7
  const mondayIst = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - daysSinceMonday)
  return new Date(mondayIst - IST_OFFSET_MS)
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** Sends last week's digest to every opted-in owner who had scans. */
export async function sendWeeklyDigests(now = new Date()): Promise<void> {
  const weekEnd = startOfIstWeek(now)
  const weekStart = new Date(weekEnd.getTime() - WEEK_MS)
  const prevStart = new Date(weekStart.getTime() - WEEK_MS)
  const periodKey = new Date(weekStart.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
  const lastDay = new Date(weekEnd.getTime() - 1 + IST_OFFSET_MS)
  const fmtDay = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })
  const weekLabel = `${fmtDay(new Date(weekStart.getTime() + IST_OFFSET_MS))} – ${fmtDay(lastDay)}`

  // Owners with at least one scan last week.
  const active = await prisma.qRScan.groupBy({
    by: ["qrId"],
    where: { scannedAt: { gte: weekStart, lt: weekEnd } },
    _count: { _all: true },
  })
  if (active.length === 0) return
  const codes = await prisma.qRCode.findMany({
    where: { id: { in: active.map((a) => a.qrId) }, userId: { not: null } },
    select: { id: true, name: true, userId: true },
  })
  const byOwner = new Map<string, { id: string; name: string; scans: number }[]>()
  const scansByQr = new Map(active.map((a) => [a.qrId, a._count._all]))
  for (const c of codes) {
    const list = byOwner.get(c.userId!) ?? []
    list.push({ id: c.id, name: c.name, scans: scansByQr.get(c.id) ?? 0 })
    byOwner.set(c.userId!, list)
  }

  let sent = 0
  for (const [userId, ownerCodes] of byOwner) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true, notificationPrefs: true },
      })
      if (!user || !readPrefs(user.notificationPrefs).weeklyAnalyticsDigest) continue
      if (!(await claimAlert(userId, "weekly_digest", 0, periodKey))) continue

      const scanWhere = { qrCode: { userId }, scannedAt: { gte: weekStart, lt: weekEnd } }
      const [unique, previous, countries, devices] = await Promise.all([
        prisma.qRScan.count({ where: { ...scanWhere, isUnique: true } }),
        prisma.qRScan.count({ where: { qrCode: { userId }, scannedAt: { gte: prevStart, lt: weekStart } } }),
        prisma.qRScan.groupBy({ by: ["country"], where: scanWhere, _count: { _all: true } }),
        prisma.qRScan.groupBy({ by: ["deviceType"], where: scanWhere, _count: { _all: true } }),
      ])
      const total = ownerCodes.reduce((n, c) => n + c.scans, 0)
      const top = <T,>(rows: T[], n: (r: T) => number) => [...rows].sort((a, b) => n(b) - n(a)).slice(0, 5)

      const { subject, html } = buildWeeklyDigestEmail({
        name: user.name,
        weekLabel,
        totalScans: total,
        previousWeekScans: previous,
        uniqueScans: unique,
        topCodes: top(ownerCodes, (c) => c.scans).map((c) => ({ name: c.name, scans: c.scans })),
        topCountries: top(countries, (c) => c._count._all).map((c) => ({ country: c.country ?? "Unknown", scans: c._count._all })),
        devices: top(devices, (d) => d._count._all).map((d) => ({
          device: d.deviceType.charAt(0) + d.deviceType.slice(1).toLowerCase(),
          scans: d._count._all,
        })),
        dashboardUrl: `${env.FRONTEND_URL}/app/analytics`,
        settingsUrl: `${env.FRONTEND_URL}/app/settings`,
      })
      await sendEmail({ to: user.email, subject, html })
      sent++
    } catch (err) {
      logger.error("Weekly digest failed", { userId, error: String(err) })
    }
  }
  logger.info("Weekly digests sent", { sent, periodKey })
}
