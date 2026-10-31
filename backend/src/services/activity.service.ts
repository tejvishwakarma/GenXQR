/**
 * The customer-facing activity log (/app/activity), built on AuditLog
 * (decided 31 Oct 2026):
 *
 * - SECURITY history — every plan. The caller's OWN sign-ins, password and
 *   profile changes, API keys and webhooks: rows they wrote themselves
 *   (userId), in SECURITY_CATEGORIES.
 * - TEAM log — plans with PLAN_LIMITS.activityLog (Pro+), OWNER/ADMIN of the
 *   workspace. Everything anyone did to the workspace's codes, team and
 *   settings: rows whose ownerId is the workspace owner (set by the audit hook
 *   in db/prisma.ts), in TEAM_CATEGORIES. Sign-ins are never in it — one
 *   member's sessions are not another member's business.
 *
 * Admin and billing rows are in neither. What is SHOWN is narrower than what is
 * stored: IPs are masked (maskIp — full addresses are SUPER_ADMIN only), and an
 * action done by GenXQR staff while impersonating shows as "GenXQR support"
 * without saying which admin.
 */
import type { Prisma } from "@prisma/client"
import { prisma } from "../db/prisma.js"
import { maskIp } from "../utils/mask-ip.util.js"
import { csvCell } from "../utils/csv-cell.util.js"
import { parseUA } from "../utils/user-agent.util.js"

export type ActivityScope = "security" | "team"

export const SECURITY_CATEGORIES = ["auth", "apikey", "webhook"] as const
export const TEAM_CATEGORIES = ["qr", "team", "settings"] as const

const CATEGORIES: Record<ActivityScope, readonly string[]> = {
  security: SECURITY_CATEGORIES,
  team: TEAM_CATEGORIES,
}

/** Rows in one CSV export. Narrow the dates for more. */
export const ACTIVITY_EXPORT_LIMIT = 10_000

export interface ActivityFilters {
  category?: string
  actorId?: string
  from?: Date
  to?: Date
}

export type ActivityActor =
  | { kind: "user"; id: string; name: string | null; email: string }
  | { kind: "support" }
  | { kind: "deleted" }

export interface ActivityEntry {
  id: string
  createdAt: Date
  action: string
  category: string
  actor: ActivityActor
  entityType: string | null
  entityId: string | null
  metadata: Record<string, unknown> | null
  ip: string
  device: string | null
}

/**
 * `subjectId` is the caller for "security" and the workspace owner for "team".
 * A category outside the scope's list matches nothing rather than widening it.
 */
function whereFor(scope: ActivityScope, subjectId: string, f: ActivityFilters): Prisma.AuditLogWhereInput {
  const allowed = CATEGORIES[scope]
  const categories = f.category ? allowed.filter((c) => c === f.category) : [...allowed]
  return {
    ...(scope === "security" ? { userId: subjectId } : { ownerId: subjectId }),
    ...(scope === "team" && f.actorId ? { userId: f.actorId } : {}),
    category: { in: categories },
    ...((f.from || f.to) && { createdAt: { ...(f.from && { gte: f.from }), ...(f.to && { lte: f.to }) } }),
  }
}

const rowSelect = {
  id: true, createdAt: true, action: true, category: true, entityType: true, entityId: true,
  metadata: true, ip: true, userAgent: true, userId: true,
  user: { select: { id: true, name: true, email: true } },
} satisfies Prisma.AuditLogSelect

type Row = Prisma.AuditLogGetPayload<{ select: typeof rowSelect }>

function toEntry(row: Row): ActivityEntry {
  const raw = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
    ? { ...(row.metadata as Record<string, unknown>) }
    : null
  const bySupport = raw ? "impersonatedBy" in raw : false
  // Which admin it was is ours to know, not the customer's.
  if (raw) delete raw["impersonatedBy"]

  const actor: ActivityActor = bySupport
    ? { kind: "support" }
    : row.user
      ? { kind: "user", id: row.user.id, name: row.user.name, email: row.user.email }
      : { kind: "deleted" }

  const ua = row.userAgent ? parseUA(row.userAgent) : null
  const device = ua && (ua.browser || ua.os)
    ? [ua.browser, ua.os].filter(Boolean).join(" on ")
    : null

  return {
    id: row.id,
    createdAt: row.createdAt,
    action: row.action,
    category: row.category,
    actor,
    entityType: row.entityType,
    entityId: row.entityId,
    metadata: raw && Object.keys(raw).length > 0 ? raw : null,
    ip: maskIp(row.ip),
    device,
  }
}

export async function listActivity(
  scope: ActivityScope,
  subjectId: string,
  filters: ActivityFilters,
  page: number,
  limit: number,
): Promise<{ items: ActivityEntry[]; total: number; page: number; limit: number }> {
  const where = whereFor(scope, subjectId, filters)
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where, select: rowSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit, take: limit,
    }),
    prisma.auditLog.count({ where }),
  ])
  return { items: rows.map(toEntry), total, page, limit }
}

/** Everyone who has an entry in the owner's team log — for the "member" filter. */
export async function listActivityActors(ownerId: string): Promise<{ id: string; name: string | null; email: string }[]> {
  const groups = await prisma.auditLog.groupBy({
    by: ["userId"],
    where: { ownerId, category: { in: [...TEAM_CATEGORIES] }, userId: { not: null } },
  })
  const ids = groups.map((g) => g.userId).filter((id): id is string => id !== null)
  if (ids.length === 0) return []
  return prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, email: true },
    orderBy: { email: "asc" },
  })
}

function actorLabel(a: ActivityActor): string {
  if (a.kind === "support") return "GenXQR support"
  if (a.kind === "deleted") return "Deleted account"
  return a.name ? `${a.name} <${a.email}>` : a.email
}

/** CSV of the newest ACTIVITY_EXPORT_LIMIT matching entries; every cell through csvCell. */
export async function exportActivityCsv(scope: ActivityScope, subjectId: string, filters: ActivityFilters): Promise<string> {
  const rows = await prisma.auditLog.findMany({
    where: whereFor(scope, subjectId, filters),
    select: rowSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: ACTIVITY_EXPORT_LIMIT,
  })
  const header = "time,action,category,by,item,details,ip,device\n"
  const body = rows
    .map(toEntry)
    .map((e) =>
      [
        e.createdAt.toISOString(), e.action, e.category, actorLabel(e.actor),
        e.entityType && e.entityId ? `${e.entityType} ${e.entityId}` : "",
        e.metadata ? JSON.stringify(e.metadata) : "", e.ip, e.device ?? "",
      ].map(csvCell).join(","),
    )
    .join("\n")
  return header + body
}
