/**
 * Agency plan: an agency manages its clients' QR codes (decided 1 Nov 2026).
 *
 * - Only the agency logs in. Each client is a managed account (a User with no
 *   password and a placeholder address, managed-account.service.ts) that the
 *   agency's people switch into like a team workspace (workspace.service.ts).
 *   So a client's codes, custom domains, scan quota and scan-page branding are
 *   that account's, and every existing per-owner rule applies unchanged —
 *   including "on a client's domain only that client's codes open".
 * - The plan is a POOL (codes, scans/month, domains, storage). The agency gives
 *   each client caps out of it; the agency's own limits are what is left
 *   (billing.service.ts clientLimits / withClientAllocations).
 * - Scan pages show the CLIENT's brand (its brandName/brandLogoUrl). The client
 *   sees the AGENCY's brand on the share-report link (/l/report/<token>).
 * - The clients follow the agency's subscription: a lapse or a downgrade below
 *   the client count pauses their codes, renewal resumes them (syncAgencyClients).
 */
import { randomBytes } from "node:crypto"
import { z } from "zod"
import type { PlanName } from "@prisma/client"
import { prisma } from "../db/prisma.js"
import { redis } from "../redis/client.js"
import { logger } from "../logger/index.js"
import { AppError } from "../middleware/error.middleware.js"
import { PLAN_LIMITS, getPlanLimitsReadOnly, getUserPlanLimits, hasScanCap } from "./billing.service.js"
import { brandingSchema } from "./branding.service.js"
import { logAudit } from "./audit.service.js"
import { getGlobalAnalytics } from "./analytics.service.js"
import { getScanUsage, invalidateScanQuota } from "./scan-quota.service.js"
import { pauseCodesForBilling, resumeCodesPausedForBilling } from "./subscription-expiry.service.js"
import { deleteUserAndData } from "./account-erasure.service.js"
import {
  MANAGED_EMAIL_DOMAIN,
  clientWithinCount,
  readClientFeatures,
  type ClientFeatures,
} from "./managed-account.service.js"

// ─── Input ──────────────────────────────────────────────────────────────────

const capsSchema = {
  maxCodes: z.number().int().min(1).max(1_000_000),
  // At least 1: a scan limit of 0 means "not enforced" (scan-quota.service).
  maxScansPerMonth: z.number().int().min(1).max(1_000_000_000),
  maxDomains: z.number().int().min(0).max(1000),
  maxStorageGB: z.number().int().min(0).max(10_000),
}
const featuresSchema = z.object({
  abTesting: z.boolean(),
  smartRouting: z.boolean(),
  bulkGeneration: z.boolean(),
}).partial()

export const createClientSchema = z.object({
  name: z.string().trim().min(1).max(80),
  ...capsSchema,
  features: featuresSchema.optional(),
})

export const updateClientSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  maxCodes: capsSchema.maxCodes.optional(),
  maxScansPerMonth: capsSchema.maxScansPerMonth.optional(),
  maxDomains: capsSchema.maxDomains.optional(),
  maxStorageGB: capsSchema.maxStorageGB.optional(),
  features: featuresSchema.optional(),
  /** The client's brand on its scan pages (stored on the client's account). */
  brandName: brandingSchema.shape.brandName,
  brandLogoUrl: brandingSchema.shape.brandLogoUrl,
})

type Caps = { maxCodes: number; maxScansPerMonth: number; maxDomains: number; maxStorageGB: number }

// ─── Pool ───────────────────────────────────────────────────────────────────

/**
 * The agency's plan pool — the plan's own figures, not what is left of them —
 * or a 403 when the plan has no clients at all.
 */
async function agencyPool(agencyId: string) {
  const { planName } = await getUserPlanLimits(agencyId)
  const pool = PLAN_LIMITS[planName as PlanName]
  if (!pool || pool.agencyClientsLimit <= 0) {
    throw new AppError(403, "Managing clients is part of the Agency plan. Upgrade to add clients.")
  }
  return pool
}

/**
 * Throws unless the caps fit: what the other clients hold plus this one stays
 * within the pool, leaving room for what the agency itself already uses.
 */
async function assertCapsFit(agencyId: string, caps: Caps, excludeClientId?: string) {
  const pool = await agencyPool(agencyId)
  const where = { agencyId, ...(excludeClientId && { id: { not: excludeClientId } }) }
  const [others, ownCodes, ownDomains] = await Promise.all([
    prisma.agencyClient.aggregate({
      where,
      _sum: { maxCodes: true, maxScansPerMonth: true, maxDomains: true, maxStorageGB: true },
    }),
    prisma.qRCode.count({ where: { userId: agencyId } }),
    prisma.customDomain.count({ where: { userId: agencyId } }),
  ])
  const s = others._sum
  const fits = (label: string, wanted: number, given: number, pool: number, own = 0, unit = "") => {
    const free = Math.max(0, pool - given - own)
    if (wanted > free) {
      const ownNote = own > 0 ? `, and you use ${own.toLocaleString("en-US")} yourself` : ""
      throw new AppError(422, `Not enough ${label} left in your plan: ${free.toLocaleString("en-US")}${unit} free (${pool.toLocaleString("en-US")}${unit} in total, ${given.toLocaleString("en-US")}${unit} given to other clients${ownNote}).`)
    }
  }
  fits("QR codes", caps.maxCodes, s.maxCodes ?? 0, pool.dynamicQRLimit, ownCodes)
  // Unlimited scans (every agency plan since 9 Nov 2026): nothing to share out.
  if (hasScanCap(pool.scanLimitPerMonth)) fits("monthly scans", caps.maxScansPerMonth, s.maxScansPerMonth ?? 0, pool.scanLimitPerMonth)
  fits("custom domains", caps.maxDomains, s.maxDomains ?? 0, pool.customDomainsLimit, ownDomains)
  fits("storage", caps.maxStorageGB, s.maxStorageGB ?? 0, pool.fileStorageGB, 0, " GB")
  return pool
}

const lock = (tx: { $executeRaw: (q: TemplateStringsArray, ...v: unknown[]) => Promise<number> }, agencyId: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`agency:${agencyId}`}))`

// ─── Clients ────────────────────────────────────────────────────────────────

export interface ClientView {
  id: string
  /** The client's workspace id (X-Workspace-Id). */
  workspaceId: string
  name: string
  caps: Caps
  features: ClientFeatures
  brandName: string | null
  brandLogoUrl: string | null
  usage: { codes: number; domains: number; scansThisMonth: number }
  /** False when the agency's plan no longer covers this client (its codes are paused). */
  active: boolean
  reportToken: string | null
  createdAt: Date
}

export async function listClients(agencyId: string): Promise<{
  clients: ClientView[]
  pool: { clients: number; codes: number; scansPerMonth: number; domains: number; storageGB: number } | null
}> {
  const [rows, { planName }] = await Promise.all([
    prisma.agencyClient.findMany({
      where: { agencyId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: { user: { select: { brandName: true, brandLogoUrl: true } } },
    }),
    getUserPlanLimits(agencyId),
  ])
  const pool = PLAN_LIMITS[planName as PlanName]
  const clients = await Promise.all(rows.map(async (c, i) => {
    const [codes, domains, scansThisMonth] = await Promise.all([
      prisma.qRCode.count({ where: { userId: c.userId } }),
      prisma.customDomain.count({ where: { userId: c.userId } }),
      getScanUsage(c.userId).catch(() => 0),
    ])
    return {
      id: c.id,
      workspaceId: c.userId,
      name: c.name,
      caps: { maxCodes: c.maxCodes, maxScansPerMonth: c.maxScansPerMonth, maxDomains: c.maxDomains, maxStorageGB: c.maxStorageGB },
      features: readClientFeatures(c.features),
      brandName: c.user.brandName,
      brandLogoUrl: c.user.brandLogoUrl,
      usage: { codes, domains, scansThisMonth },
      active: i < (pool?.agencyClientsLimit ?? 0),
      reportToken: c.reportToken,
      createdAt: c.createdAt,
    }
  }))
  return {
    clients,
    pool: pool && pool.agencyClientsLimit > 0
      ? { clients: pool.agencyClientsLimit, codes: pool.dynamicQRLimit, scansPerMonth: pool.scanLimitPerMonth, domains: pool.customDomainsLimit, storageGB: pool.fileStorageGB }
      : null,
  }
}

async function findClient(agencyId: string, clientId: string) {
  const c = await prisma.agencyClient.findFirst({ where: { id: clientId, agencyId } })
  // Same answer for "not yours" and "does not exist".
  if (!c) throw new AppError(404, "Client not found.")
  return c
}

export async function createClient(agencyId: string, actorId: string, input: z.infer<typeof createClientSchema>) {
  const caps = { maxCodes: input.maxCodes, maxScansPerMonth: input.maxScansPerMonth, maxDomains: input.maxDomains, maxStorageGB: input.maxStorageGB }
  const created = await prisma.$transaction(async (tx) => {
    await lock(tx, agencyId)
    const pool = await assertCapsFit(agencyId, caps)
    const count = await tx.agencyClient.count({ where: { agencyId } })
    if (count >= pool.agencyClientsLimit) {
      throw new AppError(403, `Your plan includes ${pool.agencyClientsLimit} clients. Remove one or upgrade to add more.`)
    }
    // The client's own account: no password, an address that can never get
    // mail, and its brand name defaulting to the client's name.
    const user = await tx.user.create({
      data: {
        email: `client-${randomBytes(9).toString("hex")}@${MANAGED_EMAIL_DOMAIN}`,
        name: input.name,
        brandName: input.name,
        emailVerified: false,
      },
      select: { id: true },
    })
    return tx.agencyClient.create({
      data: { agencyId, userId: user.id, name: input.name, ...caps, features: { ...readClientFeatures({}), ...input.features } },
    })
  }, { timeout: 15_000 })
  await invalidateScanQuota(agencyId)
  logAudit({ userId: actorId, ownerId: agencyId, action: "agency.client.create", category: "team", entityType: "AgencyClient", entityId: created.id, metadata: { name: created.name, ...caps } })
  return created
}

export async function updateClient(agencyId: string, actorId: string, clientId: string, input: z.infer<typeof updateClientSchema>) {
  const updated = await prisma.$transaction(async (tx) => {
    await lock(tx, agencyId)
    const c = await findClient(agencyId, clientId)
    const caps = {
      maxCodes: input.maxCodes ?? c.maxCodes,
      maxScansPerMonth: input.maxScansPerMonth ?? c.maxScansPerMonth,
      maxDomains: input.maxDomains ?? c.maxDomains,
      maxStorageGB: input.maxStorageGB ?? c.maxStorageGB,
    }
    const capsChanged = caps.maxCodes !== c.maxCodes || caps.maxScansPerMonth !== c.maxScansPerMonth
      || caps.maxDomains !== c.maxDomains || caps.maxStorageGB !== c.maxStorageGB
    if (capsChanged) await assertCapsFit(agencyId, caps, c.id)
    if (input.brandName !== undefined || input.brandLogoUrl !== undefined) {
      await tx.user.update({
        where: { id: c.userId },
        data: {
          ...(input.brandName !== undefined && { brandName: input.brandName }),
          ...(input.brandLogoUrl !== undefined && { brandLogoUrl: input.brandLogoUrl }),
        },
      })
    }
    return tx.agencyClient.update({
      where: { id: c.id },
      data: {
        ...caps,
        ...(input.name !== undefined && { name: input.name }),
        ...(input.features && { features: { ...readClientFeatures(c.features), ...input.features } }),
      },
    })
  }, { timeout: 15_000 })
  await Promise.all([invalidateScanQuota(agencyId), invalidateScanQuota(updated.userId)])
  logAudit({ userId: actorId, ownerId: agencyId, action: "agency.client.update", category: "team", entityType: "AgencyClient", entityId: updated.id, metadata: { name: updated.name, changed: Object.keys(input) } })
  return updated
}

/** Deletes the client and everything in it: codes, scans, files, domains. */
export async function deleteClient(agencyId: string, actorId: string, clientId: string): Promise<void> {
  const c = await findClient(agencyId, clientId)
  await deleteUserAndData(c.userId)
  await invalidateScanQuota(agencyId)
  logAudit({ userId: actorId, ownerId: agencyId, action: "agency.client.delete", category: "team", entityType: "AgencyClient", entityId: c.id, metadata: { name: c.name } })
}

/** Turns the client's share-report link on (a new link each time) or off. */
export async function setReportLink(agencyId: string, actorId: string, clientId: string, enabled: boolean): Promise<string | null> {
  const c = await findClient(agencyId, clientId)
  const reportToken = enabled ? randomBytes(24).toString("base64url") : null
  await prisma.agencyClient.update({ where: { id: c.id }, data: { reportToken } })
  logAudit({ userId: actorId, ownerId: agencyId, action: enabled ? "agency.report.link" : "agency.report.unlink", category: "team", entityType: "AgencyClient", entityId: c.id, metadata: { name: c.name } })
  return reportToken
}

// ─── Share report ───────────────────────────────────────────────────────────

const REPORT_CACHE_SECONDS = 300
export const REPORT_DAYS = [7, 30, 90] as const

export interface ClientReport {
  /** Whose brand the page carries: the agency's, never GenXQR's. */
  agency: { name: string; logoUrl: string | null }
  client: { name: string; logoUrl: string | null }
  days: number
  generatedAt: string
  totals: { scans: number; uniqueScans: number; codes: number; activeCodes: number }
  timeline: Array<{ date: string; scans: number }>
  topCodes: Array<{ name: string; scans: number }>
  countries: Array<{ country: string; scans: number }>
  devices: Array<{ device: string; scans: number }>
}

/**
 * The public report behind a share link. Aggregates only — no scanner IPs or
 * per-scan rows. 404 for an unknown or switched-off link, or a client the
 * agency's plan no longer covers. Cached briefly: the link is public.
 */
export async function getClientReport(token: string, days: number): Promise<ClientReport> {
  const cacheKey = `agency:report:${token}:${days}`
  const cached = await redis.get(cacheKey).catch(() => null)
  if (cached) return JSON.parse(cached) as ClientReport

  const c = await prisma.agencyClient.findUnique({
    where: { reportToken: token },
    include: {
      user: { select: { brandName: true, brandLogoUrl: true } },
      agency: { select: { name: true, brandName: true, brandLogoUrl: true } },
    },
  })
  if (!c) throw new AppError(404, "Report not found.")
  const agencyLimits = await getPlanLimitsReadOnly(c.agencyId)
  if (!(await clientWithinCount(c, agencyLimits.agencyClientsLimit))) throw new AppError(404, "Report not found.")

  const a = await getGlobalAnalytics(c.userId, days)
  const report: ClientReport = {
    agency: { name: c.agency.brandName || c.agency.name, logoUrl: c.agency.brandLogoUrl },
    client: { name: c.user.brandName || c.name, logoUrl: c.user.brandLogoUrl },
    days,
    generatedAt: new Date().toISOString(),
    totals: {
      // Scans in the chosen period (the timeline covers exactly that range).
      scans: a.timeline.reduce((n, p) => n + p.count, 0),
      uniqueScans: a.uniqueScans,
      codes: a.totalQRs,
      activeCodes: a.activeQRs,
    },
    timeline: a.timeline.map((p) => ({ date: p.date, scans: p.count })),
    topCodes: a.topQRs.slice(0, 10).map((q) => ({ name: q.name, scans: q.scanCount })),
    countries: a.byCountry.slice(0, 10).map((g) => ({ country: g.country, scans: g.count })),
    devices: a.byDevice.map((d) => ({ device: d.deviceType, scans: d.count })),
  }
  await redis.set(cacheKey, JSON.stringify(report), "EX", REPORT_CACHE_SECONDS).catch(() => undefined)
  return report
}

// ─── Billing follow-through ─────────────────────────────────────────────────

/**
 * Pauses the codes of clients the agency's plan no longer covers (lapse,
 * downgrade below the client count) and resumes them once it does again.
 * Runs in the 10-minute expiry worker, after expiry itself; `agencyId` limits
 * it to one agency (called right after a payment).
 */
export async function syncAgencyClients(agencyId?: string): Promise<{ paused: number; resumed: number }> {
  const clients = await prisma.agencyClient.findMany({
    where: agencyId ? { agencyId } : {},
    select: { id: true, agencyId: true, userId: true, createdAt: true },
  })
  const limitsByAgency = new Map<string, number>()
  let paused = 0
  let resumed = 0
  for (const c of clients) {
    try {
      if (!limitsByAgency.has(c.agencyId)) {
        limitsByAgency.set(c.agencyId, (await getPlanLimitsReadOnly(c.agencyId)).agencyClientsLimit)
      }
      if (await clientWithinCount(c, limitsByAgency.get(c.agencyId)!)) resumed += await resumeCodesPausedForBilling(c.userId)
      else paused += await pauseCodesForBilling(c.userId)
    } catch (err) {
      logger.error("Failed to sync agency client", { clientId: c.id, error: String(err) })
    }
  }
  if (paused || resumed) logger.info("Synced agency clients with their agencies' plans", { paused, resumed })
  return { paused, resumed }
}
