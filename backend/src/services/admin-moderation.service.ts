import { prisma } from "../db/prisma.js"
import { AppError } from "../middleware/error.middleware.js"
import { sendEmail, buildBroadcastEmail } from "./email.service.js"

type AdminRole = "USER" | "ADMIN" | "SUPER_ADMIN"

export interface PaginationParams {
  page: number
  limit: number
  q?: string
}

function pageMeta(total: number, page: number, limit: number) {
  return { total, page, limit, pages: Math.ceil(total / limit) }
}

// ─── Abuse reports ─────────────────────────────────────────────────────────────

export async function listAbuseReports({ page, limit }: PaginationParams, resolvedParam?: unknown) {
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = {}
  if (resolvedParam !== undefined) where["isResolved"] = resolvedParam === "true"

  const [total, reports] = await prisma.$transaction([
    prisma.abuseReport.count({ where }),
    prisma.abuseReport.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true, reason: true, url: true, reportedBy: true,
        isResolved: true, adminNotes: true, resolvedAt: true, resolvedBy: true, createdAt: true,
        qrCode: { select: { id: true, name: true, slug: true, isActive: true, userId: true } },
      },
    }),
  ])

  // Enrich with reporter + QR-owner user data (no schema relation — batch lookup)
  const userIds = new Set<string>()
  reports.forEach((r) => {
    if (r.reportedBy) userIds.add(r.reportedBy)
    if (r.qrCode.userId) userIds.add(r.qrCode.userId)
    if (r.resolvedBy) userIds.add(r.resolvedBy)
  })
  const users = userIds.size
    ? await prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true, name: true, email: true },
    })
    : []
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]))

  const enriched = reports.map((r) => ({
    ...r,
    reporter: r.reportedBy ? (userMap[r.reportedBy] ?? null) : null,
    qrOwner: r.qrCode.userId ? (userMap[r.qrCode.userId] ?? null) : null,
    resolvedByUser: r.resolvedBy ? (userMap[r.resolvedBy] ?? null) : null,
  }))

  return { reports: enriched, meta: pageMeta(total, page, limit) }
}

export async function resolveAbuseReport(adminId: string, reportId: string, adminNotes?: string) {
  return prisma.abuseReport.update({
    where: { id: reportId },
    data: { isResolved: true, resolvedAt: new Date(), resolvedBy: adminId, adminNotes },
  })
}

// ─── Blocklist ─────────────────────────────────────────────────────────────────

export async function listBlocklist({ page, limit }: PaginationParams, type?: string) {
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = { isActive: true }
  if (type) where["type"] = type

  const [total, entries] = await prisma.$transaction([
    prisma.blocklist.count({ where }),
    prisma.blocklist.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" } }),
  ])

  return { entries, meta: pageMeta(total, page, limit) }
}

export async function addToBlocklist(
  adminId: string,
  type: "domain" | "ip" | "email" | "user",
  value: string,
  reason?: string,
) {
  return prisma.blocklist.upsert({
    where: { type_value: { type, value } },
    update: { isActive: true, reason, addedBy: adminId },
    create: { type, value, reason, addedBy: adminId, isActive: true },
  })
}

/**
 * Soft-unblocks an entry. Permanently banned entries (blockCount >= 3) can only
 * be lifted by a SUPER_ADMIN.
 */
export async function removeFromBlocklist(adminRole: AdminRole, entryId: string): Promise<void> {
  const entry = await prisma.blocklist.findUnique({
    where: { id: entryId },
    select: { isPermanent: true },
  })
  if (!entry) throw new AppError(404, "Entry not found")

  if (entry.isPermanent && adminRole !== "SUPER_ADMIN") {
    throw new AppError(403, "Permanent bans can only be lifted by a SUPER_ADMIN")
  }

  await prisma.blocklist.update({
    where: { id: entryId },
    data: { isActive: false, ...(entry.isPermanent ? { isPermanent: false } : {}) },
  })
}

// ─── Email logs & broadcast ────────────────────────────────────────────────────

export async function listEmailLogs({ page, limit, q }: PaginationParams, status?: string) {
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = {}
  if (status) where["status"] = status
  if (q) where["to"] = { contains: q, mode: "insensitive" }

  const [total, logs] = await prisma.$transaction([
    prisma.emailLog.count({ where }),
    prisma.emailLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { sentAt: "desc" },
      select: { id: true, to: true, subject: true, template: true, status: true, error: true, provider: true, sentAt: true },
    }),
  ])

  return { logs, meta: pageMeta(total, page, limit) }
}

export interface BroadcastInput {
  subject: string
  body: string
  segment: "all" | "free" | "paid" | "trialing" | "past_due"
  testEmail?: string | undefined
  bodyFormat: "text" | "html"
}

export async function sendBroadcast(callerRole: AdminRole, input: BroadcastInput) {
  if (callerRole !== "SUPER_ADMIN") throw new AppError(403, "SUPER_ADMIN role required")

  const { subject, body, segment, testEmail, bodyFormat } = input
  const html = buildBroadcastEmail(subject, body, bodyFormat === "html")

  // If testEmail is provided, send to a single address as a preview
  if (testEmail) {
    let status = "sent"
    let error: string | null = null
    try {
      await sendEmail({ to: testEmail, subject, html })
    } catch (e) {
      status = "failed"
      error = e instanceof Error ? e.message : "Send failed"
    }
    await prisma.emailLog.create({
      data: { to: testEmail, subject, template: "broadcast", status, provider: "admin-broadcast", error },
    })
    return { sent: status === "sent" ? 1 : 0, preview: true as const }
  }

  // Collect recipients based on segment
  const subWhere =
    segment === "all" ? undefined :
      segment === "free" ? { is: null } :
        segment === "trialing" ? { is: { status: "TRIALING" } } :
          segment === "past_due" ? { is: { status: "PAST_DUE" } } :
    /* paid */               { is: { status: "ACTIVE" } }

  const users = await prisma.user.findMany({
    where: { subscription: subWhere as never },
    select: { email: true },
  })

  // Send emails and track results
  const results = await Promise.allSettled(
    users.map((u) => sendEmail({ to: u.email, subject, html })),
  )

  await prisma.emailLog.createMany({
    data: users.map((u, i) => ({
      to: u.email,
      subject,
      template: "broadcast",
      status: results[i].status === "fulfilled" ? "sent" : "failed",
      error: results[i].status === "rejected"
        ? ((results[i] as PromiseRejectedResult).reason as Error)?.message ?? "Send failed"
        : null,
      provider: "admin-broadcast",
    })),
    skipDuplicates: true,
  })

  const sent = results.filter((r) => r.status === "fulfilled").length
  return { sent, total: users.length }
}

// ─── Platform settings ─────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: Record<string, string> = {
  maintenance_mode: "false",
  signup_enabled: "true",
  static_qr_enabled: "true",
  max_qr_per_user: "50",
  free_scan_limit: "1000",
  support_email: "support@genxqr.com",
  changelog_sections: JSON.stringify([
    {
      version: "v1.9.0",
      date: "March 2026",
      title: "Marketing page refresh",
      items: [
        "Redesigned Features, About, and Use Cases pages",
        "Added Cookie Policy, GDPR, Careers, and Changelog routes",
        "Improved route scroll-to-top behavior",
      ],
      icon: "sparkles",
    },
  ]),
  careers_sections: JSON.stringify([
    {
      title: "Senior Frontend Engineer",
      type: "Full-time · Remote",
      desc: "Build polished, performant product experiences across dashboard and marketing surfaces.",
    },
    {
      title: "Backend Platform Engineer",
      type: "Full-time · Remote",
      desc: "Scale core services for analytics, routing, and campaign reliability.",
    },
    {
      title: "Product Designer",
      type: "Full-time · Hybrid",
      desc: "Shape user journeys from first impression to daily usage with strong UX craft.",
    },
  ]),
}

async function readAllSettings(): Promise<Record<string, string>> {
  const rows = await prisma.platformSetting.findMany()
  const settings: Record<string, string> = { ...DEFAULT_SETTINGS }
  for (const row of rows) settings[row.key] = row.value
  return settings
}

export async function getSettings(): Promise<Record<string, string>> {
  return readAllSettings()
}

export async function updateSettings(
  callerRole: AdminRole,
  updates: Record<string, string>,
): Promise<Record<string, string>> {
  if (callerRole !== "SUPER_ADMIN") throw new AppError(403, "SUPER_ADMIN role required")

  const allowedKeys = new Set(Object.keys(DEFAULT_SETTINGS))

  await prisma.$transaction(
    Object.entries(updates)
      .filter(([k]) => allowedKeys.has(k))
      .map(([key, value]) =>
        prisma.platformSetting.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        }),
      ),
  )

  return readAllSettings()
}
