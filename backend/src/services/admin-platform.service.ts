import { prisma } from "../db/prisma.js"
import { AppError } from "../middleware/error.middleware.js"
import { redis } from "../redis/client.js"
import { env } from "../config/env.js"
import { scanQueue } from "./scan.service.js"
import { sendManualReminders } from "./renewal-reminder.service.js"

type AdminRole = "USER" | "ADMIN" | "SUPER_ADMIN"

export interface PaginationParams {
  page: number
  limit: number
  q?: string
}

const BYTES_PER_GB = 1_073_741_824
const MS_PER_DAY = 86_400_000
const MAX_TREND_DAYS = 365

function pageMeta(total: number, page: number, limit: number) {
  return { total, page, limit, pages: Math.ceil(total / limit) }
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────

export async function getDashboardMetrics() {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const [
    totalUsers,
    activeSubscriptions,
    totalQRCodes,
    scansToday,
    totalScans,
    revenueResult,
    storageResult,
  ] = await prisma.$transaction([
    prisma.user.count(),
    prisma.subscription.count({
      where: { status: { in: ["ACTIVE", "TRIALING"] } },
    }),
    prisma.qRCode.count(),
    prisma.qRScan.count({ where: { scannedAt: { gte: todayStart } } }),
    prisma.qRScan.count(),
    prisma.invoice.aggregate({
      _sum: { amount: true },
      where: {
        status: "paid",
        periodEnd: { gte: new Date() },
      },
    }),
    prisma.qRFile.aggregate({ _sum: { sizeBytes: true } }),
  ])

  // MRR in INR rupees (amounts stored in paise)
  const mrr = Math.round((revenueResult._sum.amount ?? 0) / 100)
  const storageBytes = Number(storageResult._sum.sizeBytes ?? 0)
  const storageGB = parseFloat((storageBytes / BYTES_PER_GB).toFixed(3))

  // Recent signups — last 5 users (for dashboard activity feed)
  const recentSignups = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true, name: true, email: true, createdAt: true,
      subscription: { select: { plan: { select: { name: true, displayName: true } } } },
    },
  })

  return { totalUsers, activeSubscriptions, totalQRCodes, scansToday, totalScans, mrr, storageGB, recentSignups }
}

// ─── System health ─────────────────────────────────────────────────────────────

/**
 * Bounds a probe so a hung/partitioned dependency reports "down" quickly instead
 * of leaving the whole request (and the dashboard UI) hanging on stale data.
 */
function withTimeout<T>(probe: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    probe,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("probe timed out")), ms)),
  ])
}

const HEALTH_PROBE_TIMEOUT_MS = 3000

export async function getSystemHealth(callerRole: AdminRole) {
  if (callerRole !== "SUPER_ADMIN") throw new AppError(403, "SUPER_ADMIN role required")

  // Database liveness + round-trip latency
  let database: { status: "up" | "down"; latencyMs: number | null } = { status: "down", latencyMs: null }
  try {
    const start = Date.now()
    await withTimeout(prisma.$queryRaw`SELECT 1`, HEALTH_PROBE_TIMEOUT_MS)
    database = { status: "up", latencyMs: Date.now() - start }
  } catch { /* leave as down */ }

  // Redis liveness + round-trip latency
  let redisHealth: { status: "up" | "down"; latencyMs: number | null } = { status: "down", latencyMs: null }
  try {
    const start = Date.now()
    const pong = await withTimeout(redis.ping(), HEALTH_PROBE_TIMEOUT_MS)
    redisHealth = { status: pong === "PONG" ? "up" : "down", latencyMs: Date.now() - start }
  } catch { /* leave as down */ }

  // Scan queue depth (BullMQ)
  let queue: { status: "up" | "down"; waiting: number; active: number; failed: number; delayed: number } = {
    status: "down", waiting: 0, active: 0, failed: 0, delayed: 0,
  }
  try {
    const counts = await withTimeout(
      scanQueue.getJobCounts("waiting", "active", "failed", "delayed"),
      HEALTH_PROBE_TIMEOUT_MS,
    )
    queue = {
      status: "up",
      waiting: counts["waiting"] ?? 0,
      active: counts["active"] ?? 0,
      failed: counts["failed"] ?? 0,
      delayed: counts["delayed"] ?? 0,
    }
  } catch { /* leave as down */ }

  const mem = process.memoryUsage()
  const toMB = (bytes: number): number => Math.round(bytes / 1_048_576)
  const processInfo = {
    uptimeSec: Math.round(process.uptime()),
    memoryMB: { rss: toMB(mem.rss), heapUsed: toMB(mem.heapUsed), heapTotal: toMB(mem.heapTotal) },
    nodeVersion: process.version,
    environment: env.NODE_ENV,
  }

  // Overall: the database is critical (down => down); any other failure => degraded.
  const overall: "healthy" | "degraded" | "down" =
    database.status === "down"
      ? "down"
      : redisHealth.status === "up" && queue.status === "up"
        ? "healthy"
        : "degraded"

  return { overall, database, redis: redisHealth, queue, process: processInfo, checkedAt: new Date().toISOString() }
}

// ─── QR codes ──────────────────────────────────────────────────────────────────

export async function listQRCodes({ page, limit, q }: PaginationParams) {
  const skip = (page - 1) * limit

  const where = q
    ? {
      OR: [
        { name: { contains: q, mode: "insensitive" as const } },
        { slug: { contains: q, mode: "insensitive" as const } },
      ],
    }
    : {}

  const [total, codes] = await prisma.$transaction([
    prisma.qRCode.count({ where }),
    prisma.qRCode.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, slug: true, type: true, category: true,
        isActive: true, scanCount: true, createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
  ])

  return { codes, meta: pageMeta(total, page, limit) }
}

export async function deactivateQRCode(adminId: string, qrId: string): Promise<void> {
  const qr = await prisma.qRCode.findUnique({ where: { id: qrId }, select: { id: true } })
  if (!qr) throw new AppError(404, "QR code not found")

  await prisma.qRCode.update({ where: { id: qrId }, data: { isActive: false } })

  await prisma.auditLog.create({
    data: {
      userId: adminId,
      action: "admin.qr.deactivate",
      category: "admin",
      entityId: qrId,
      entityType: "QRCode",
    },
  })
}

export async function deleteQRCode(adminId: string, qrId: string): Promise<void> {
  const qr = await prisma.qRCode.findUnique({ where: { id: qrId }, select: { id: true } })
  if (!qr) throw new AppError(404, "QR code not found")

  await prisma.qRCode.delete({ where: { id: qrId } })

  await prisma.auditLog.create({
    data: {
      userId: adminId,
      action: "admin.qr.delete",
      category: "admin",
      entityId: qrId,
      entityType: "QRCode",
    },
  })
}

// ─── Analytics ─────────────────────────────────────────────────────────────────

function sinceDaysAgo(rawDays: unknown, fallbackDays: number): { days: number; since: Date } {
  const days = Math.min(Number(rawDays ?? fallbackDays), MAX_TREND_DAYS)
  return { days, since: new Date(Date.now() - days * MS_PER_DAY) }
}

export async function getSignupTrend(rawDays: unknown) {
  const { since } = sinceDaysAgo(rawDays, 30)

  const rows = await prisma.user.groupBy({
    by: ["createdAt"],
    where: { createdAt: { gte: since } },
    _count: { id: true },
    orderBy: { createdAt: "asc" },
  })

  // Bucket into calendar dates
  const buckets: Record<string, number> = {}
  for (const row of rows) {
    const date = row.createdAt.toISOString().slice(0, 10)
    buckets[date] = (buckets[date] ?? 0) + row._count.id
  }

  return Object.entries(buckets).map(([date, count]) => ({ date, count }))
}

export async function getScanTrend(rawDays: unknown) {
  const { since } = sinceDaysAgo(rawDays, 30)

  const rows = await prisma.qRScanDaily.groupBy({
    by: ["date"],
    where: { date: { gte: since } },
    _sum: { count: true },
    orderBy: { date: "asc" },
  })

  return rows.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    count: r._sum.count ?? 0,
  }))
}

export async function getStaticQRAnalytics(rawDays: unknown) {
  const { days, since } = sinceDaysAgo(rawDays, 30)

  const rows = await prisma.staticQRGeneration.groupBy({
    by: ["type"],
    where: { createdAt: { gte: since } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  })

  const totalGenerations = await prisma.staticQRGeneration.count({
    where: { createdAt: { gte: since } },
  })

  const series = rows.map((r) => ({
    type: r.type,
    count: (r._count as { id: number }).id,
  }))

  return { series, total: totalGenerations, days }
}

export async function getRevenueTrend(rawDays: unknown) {
  const { since } = sinceDaysAgo(rawDays, 90)

  const rows = await prisma.invoice.findMany({
    where: { status: "paid", createdAt: { gte: since } },
    select: { createdAt: true, amount: true },
    orderBy: { createdAt: "asc" },
  })

  // Bucket into calendar dates
  const buckets: Record<string, number> = {}
  for (const row of rows) {
    const date = row.createdAt.toISOString().slice(0, 10)
    buckets[date] = (buckets[date] ?? 0) + Math.round(row.amount / 100)
  }

  return Object.entries(buckets).map(([date, amount]) => ({ date, amount }))
}

export async function getPlanBreakdown() {
  const rows = await prisma.subscription.groupBy({
    by: ["planId"],
    where: { status: { in: ["ACTIVE", "TRIALING"] } },
    _count: { userId: true },
  })

  // Resolve plan names
  const planIds = rows.map((r) => r.planId)
  const plans = await prisma.plan.findMany({
    where: { id: { in: planIds } },
    select: { id: true, name: true, displayName: true },
  })
  const planMap = Object.fromEntries(plans.map((p) => [p.id, p]))

  return rows.map((r) => ({
    planName: planMap[r.planId]?.name ?? "UNKNOWN",
    displayName: planMap[r.planId]?.displayName ?? r.planId,
    count: (r._count as { userId: number }).userId,
  }))
}

// ─── Revenue ───────────────────────────────────────────────────────────────────

export async function getRevenue({ page, limit }: PaginationParams) {
  const skip = (page - 1) * limit

  const [mrrResult, arrResult, total, invoices] = await prisma.$transaction([
    // MRR = sum of active subscriptions' current-period amounts (normalised to monthly)
    prisma.invoice.aggregate({
      _sum: { amount: true },
      where: {
        status: "paid",
        periodEnd: { gte: new Date() },
        billingCycle: "monthly",
      },
    }),
    prisma.invoice.aggregate({
      _sum: { amount: true },
      where: {
        status: "paid",
        periodEnd: { gte: new Date() },
        billingCycle: "yearly",
      },
    }),
    prisma.invoice.count(),
    prisma.invoice.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true, amount: true, currency: true, status: true,
        planName: true, billingCycle: true, createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
  ])

  const mrr = Math.round((mrrResult._sum.amount ?? 0) / 100) +
    Math.round((arrResult._sum.amount ?? 0) / 100 / 12)
  const arr = mrr * 12

  return { data: { mrr, arr, invoices }, meta: pageMeta(total, page, limit) }
}

// ─── Storage ───────────────────────────────────────────────────────────────────

export async function getStorageUsage() {
  const [totalResult, byType, topUsers] = await prisma.$transaction([
    prisma.qRFile.aggregate({ _sum: { sizeBytes: true } }),
    prisma.qRFile.groupBy({
      by: ["fileType"],
      _sum: { sizeBytes: true },
      _count: { id: true },
      orderBy: { _sum: { sizeBytes: "desc" } },
    }),
    prisma.qRFile.groupBy({
      by: ["qrId"],
      _sum: { sizeBytes: true },
      orderBy: { _sum: { sizeBytes: "desc" } },
      take: 10,
    }),
  ])

  const totalBytes = Number(totalResult._sum.sizeBytes ?? 0)

  const byTypeFormatted = byType.map((row) => ({
    type: row.fileType,
    count: (row._count as { id?: number })?.id ?? 0,
    bytes: Number((row._sum as { sizeBytes?: bigint | null })?.sizeBytes ?? 0),
  }))

  return {
    totalBytes,
    totalGB: parseFloat((totalBytes / BYTES_PER_GB).toFixed(3)),
    byType: byTypeFormatted,
    topQRsByStorage: topUsers.map((r) => ({
      qrId: r.qrId,
      bytes: Number((r._sum as { sizeBytes?: bigint | null })?.sizeBytes ?? 0),
    })),
  }
}

export async function cleanupOrphanedFiles(adminId: string, adminRole: AdminRole) {
  if (adminRole !== "SUPER_ADMIN") throw new AppError(403, "Only SUPER_ADMINs can run storage cleanup")

  // Cascade deletion means true orphans are rare, but we use a raw query
  // to find any QRFile rows whose parent QR has been hard-deleted externally.
  const orphanRows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT f.id FROM qr_files f
    LEFT JOIN qr_codes qr ON qr.id = f.qr_id
    WHERE qr.id IS NULL
  `

  const ids = orphanRows.map((o) => o.id)

  if (ids.length === 0) return { deleted: 0 }

  await prisma.qRFile.deleteMany({ where: { id: { in: ids } } })

  await prisma.auditLog.create({
    data: {
      userId: adminId,
      action: "admin.storage.cleanup",
      category: "admin",
      metadata: { deletedCount: ids.length },
    },
  })

  return { deleted: ids.length }
}

// ─── Audit log ─────────────────────────────────────────────────────────────────

export interface AuditLogFilters {
  page: number
  limit: number
  q?: string | undefined
  category?: string | undefined
  userId?: string | undefined
  userEmail?: string | undefined
  dateFrom?: string | undefined
  dateTo?: string | undefined
  ip?: string | undefined
}

export async function getAuditLog(filters: AuditLogFilters) {
  const { page, limit, q, category, userId, userEmail, dateFrom, dateTo, ip } = filters
  const skip = (page - 1) * limit

  // Build dynamic where clause
  const where: Record<string, unknown> = {}
  if (q) where["action"] = { contains: q, mode: "insensitive" }
  if (userId) where["userId"] = userId
  if (ip) where["ip"] = { contains: ip }

  // Category filter: match explicit category field OR legacy "system" rows whose
  // action starts with the category prefix (e.g. "admin." for category "admin").
  // This handles rows written before the category column was enforced.
  if (category) {
    where["OR"] = [
      { category },
      { category: "system", action: { startsWith: `${category}.`, mode: "insensitive" } },
    ]
  }

  // Date range
  if (dateFrom || dateTo) {
    where["createdAt"] = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(new Date(dateTo).setHours(23, 59, 59, 999)) } : {}),
    }
  }

  // Filter by user email (requires join-style where)
  if (userEmail) {
    where["user"] = { email: { contains: userEmail, mode: "insensitive" } }
  }

  const [total, logs] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true, action: true, category: true, entityId: true, entityType: true,
        metadata: true, ip: true, userAgent: true, createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
  ])

  return { logs, meta: pageMeta(total, page, limit) }
}

// ─── Subscriptions ─────────────────────────────────────────────────────────────

export async function listSubscriptions(
  { page, limit }: PaginationParams,
  status?: string,
  plan?: string,
) {
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = {}
  if (status) where["status"] = status
  if (plan) where["plan"] = { name: plan }

  const [total, subs] = await prisma.$transaction([
    prisma.subscription.count({ where }),
    prisma.subscription.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true, status: true, trialEndsAt: true,
        currentPeriodStart: true, currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        createdAt: true, updatedAt: true,
        plan: { select: { name: true, displayName: true, priceMonthlyINR: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    }),
  ])

  // Attach last reminder sent for each subscription
  const subIds = subs.map((s) => s.id)
  const lastReminders = await prisma.renewalReminder.findMany({
    where: { subscriptionId: { in: subIds } },
    orderBy: { sentAt: "desc" },
    select: { subscriptionId: true, reminderType: true, sentAt: true, status: true },
  })

  // Keep only the most-recent reminder per subscription
  const lastReminderMap = new Map<string, { reminderType: string; sentAt: Date; status: string }>()
  for (const r of lastReminders) {
    if (!lastReminderMap.has(r.subscriptionId)) {
      lastReminderMap.set(r.subscriptionId, { reminderType: r.reminderType, sentAt: r.sentAt, status: r.status })
    }
  }

  const data = subs.map((s) => ({
    ...s,
    lastReminder: lastReminderMap.get(s.id) ?? null,
  }))

  return { data, meta: pageMeta(total, page, limit) }
}

export async function sendSubscriptionReminders(callerRole: AdminRole, subscriptionIds: string[]) {
  if (callerRole !== "SUPER_ADMIN") throw new AppError(403, "SUPER_ADMIN role required")
  return sendManualReminders(subscriptionIds)
}

// ─── Payments ──────────────────────────────────────────────────────────────────

export async function listPayments({ page, limit }: PaginationParams, status?: string) {
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = {}
  if (status) where["status"] = status

  const [total, invoices] = await prisma.$transaction([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true, amount: true, currency: true, status: true,
        planName: true, billingCycle: true, periodStart: true,
        periodEnd: true, createdAt: true,
        cashfreePaymentId: true, cashfreeOrderId: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
  ])

  return { invoices, meta: pageMeta(total, page, limit) }
}
