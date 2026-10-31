import net from "node:net"
import { prisma } from "../db/prisma.js"
import { env } from "../config/env.js"
import { AppError } from "../middleware/error.middleware.js"
import { logger } from "../logger/index.js"
import { getUserPlanLimits, getPlanLimitsReadOnly } from "./billing.service.js"
import {
  createCustomHostname,
  deleteCustomHostname,
  getCustomHostname,
  isCloudflareSaasConfigured,
  type CloudflareCustomHostname,
} from "./cloudflare.service.js"

/**
 * Custom domains (decided 31 Oct 2026). A paying customer prints codes on their
 * own hostname (qr.brand.com/r/<slug>) instead of genxqr.com.
 *
 * - Cloudflare for SaaS issues and serves the hostname (cloudflare.service.ts):
 *   the customer adds ONE CNAME to CUSTOM_DOMAIN_TARGET, HTTPS is automatic and
 *   our origin stays behind Cloudflare.
 * - Caps per plan: PLAN_LIMITS.customDomainsLimit (Pro 1, Business 5, Enterprise 25).
 * - On a custom host ONLY that account's codes resolve (resolveScanHost +
 *   resolveQRScan's ownerId). Without that, anyone's code could be opened under
 *   another company's domain — a ready-made phishing link.
 * - genxqr.com keeps serving every code, and any of an owner's domains serves any
 *   of their codes, so moving a code between domains never breaks a print.
 * - If the owner's plan stops including custom domains, scans on their domain
 *   redirect to the same code on genxqr.com instead of failing.
 */

// ─── Hostnames ─────────────────────────────────────────────────────────────────

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/

/** Lower-cases and trims a user-entered domain; null when it can't be one we accept. */
export function normalizeHostname(input: string): string | null {
  let h = input.trim().toLowerCase()
  h = h.replace(/^https?:\/\//, "").replace(/[/?#].*$/, "").replace(/\.$/, "")
  if (!h || h.length > 253 || h.includes(":") || net.isIP(h)) return null
  const labels = h.split(".")
  // A subdomain (qr.brand.com): an apex domain cannot carry a CNAME record.
  if (labels.length < 3 || !labels.every((l) => LABEL.test(l))) return null
  if (/^[0-9]+$/.test(labels[labels.length - 1]!)) return null
  return h
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null
  try { return new URL(url).hostname.toLowerCase() } catch { return null }
}

/** genxqr.com and every other host that is ours, never a customer's. */
function canonicalHosts(): Set<string> {
  const hosts = new Set<string>(["localhost"])
  for (const u of [env.FRONTEND_URL, env.BACKEND_URL, process.env["APP_URL"]]) {
    const h = hostOf(u)
    if (h) { hosts.add(h); hosts.add(h.startsWith("www.") ? h.slice(4) : `www.${h}`) }
  }
  return hosts
}

/**
 * True for our own domain or any subdomain of it — a customer can never claim
 * those. genxqr.com is listed outright so the rule holds whatever FRONTEND_URL
 * says (it is localhost in dev and tests), and the CNAME target's parent too.
 */
function isOurDomain(hostname: string): boolean {
  const roots = new Set<string>(["genxqr.com"])
  for (const h of canonicalHosts()) if (h !== "localhost") roots.add(h.replace(/^www\./, ""))
  const target = env.CUSTOM_DOMAIN_TARGET?.toLowerCase()
  if (target) roots.add(target.split(".").slice(-2).join("."))
  for (const root of roots) {
    if (hostname === root || hostname.endsWith(`.${root}`)) return true
  }
  return false
}

// ─── Status from Cloudflare ────────────────────────────────────────────────────

const FAILED_HOSTNAME = new Set(["blocked", "moved", "deleted"])
const FAILED_SSL = new Set(["validation_timed_out", "issuance_timed_out", "deleted", "expired"])

function statusFrom(cf: CloudflareCustomHostname): { status: string; sslStatus: string | null; errors: string[] } {
  const ssl = cf.ssl?.status ?? null
  const errors = [
    ...(cf.verification_errors ?? []),
    ...(cf.ssl?.validation_errors ?? []).map((e) => e.message ?? "").filter(Boolean),
  ]
  if (FAILED_HOSTNAME.has(cf.status) || (ssl && FAILED_SSL.has(ssl))) return { status: "failed", sslStatus: ssl, errors }
  if (cf.status === "active" && ssl === "active") return { status: "active", sslStatus: ssl, errors: [] }
  return { status: "pending", sslStatus: ssl, errors }
}

// ─── Account API ───────────────────────────────────────────────────────────────

const domainSelect = {
  id: true, hostname: true, status: true, sslStatus: true, verificationErrors: true,
  isDefault: true, createdAt: true, activatedAt: true, lastCheckedAt: true,
  _count: { select: { qrCodes: true } },
} as const

export async function listDomains(ownerId: string) {
  const [rows, { limits }] = await Promise.all([
    prisma.customDomain.findMany({ where: { userId: ownerId }, select: domainSelect, orderBy: { createdAt: "asc" } }),
    getUserPlanLimits(ownerId),
  ])
  return {
    domains: rows.map(({ _count, ...d }) => ({ ...d, codeCount: _count.qrCodes })),
    limit: limits.customDomains ? limits.customDomainsLimit : 0,
    target: env.CUSTOM_DOMAIN_TARGET ?? null,
    available: isCloudflareSaasConfigured(),
  }
}

export async function addDomain(ownerId: string, input: string) {
  const hostname = normalizeHostname(input)
  if (!hostname) {
    throw new AppError(422, "Enter a subdomain such as qr.yourbrand.com — not a full URL, an IP address or a bare domain.")
  }
  if (isOurDomain(hostname)) throw new AppError(422, "That domain belongs to GenXQR. Use a domain you own.")

  const { limits, planName } = await getUserPlanLimits(ownerId)
  if (!limits.customDomains || limits.customDomainsLimit <= 0) {
    throw new AppError(403, "Custom domains are available on the Pro plan and above.")
  }
  if (!isCloudflareSaasConfigured()) throw new AppError(503, "Custom domains are not available yet. Please try again later.")

  // Cap + uniqueness checked under a per-owner lock, so two parallel adds can't
  // both pass a count of limit - 1. The Cloudflare call happens inside it too:
  // a failed registration must not leave a row behind.
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`customdomain:${ownerId}`}))`
    const taken = await tx.customDomain.findUnique({ where: { hostname }, select: { userId: true } })
    if (taken) {
      throw new AppError(409, taken.userId === ownerId ? "You have already added this domain." : "This domain is already in use by another GenXQR account.")
    }
    const count = await tx.customDomain.count({ where: { userId: ownerId } })
    if (count >= limits.customDomainsLimit) {
      throw new AppError(403, `Your ${planName} plan allows ${limits.customDomainsLimit} custom domain${limits.customDomainsLimit === 1 ? "" : "s"}. Remove one or upgrade to add more.`)
    }
    const cf = await createCustomHostname(hostname)
    const s = statusFrom(cf)
    const row = await tx.customDomain.create({
      data: {
        userId: ownerId, hostname, cfHostnameId: cf.id, status: s.status, sslStatus: s.sslStatus,
        verificationErrors: s.errors.length ? s.errors : undefined,
        isDefault: count === 0,
        lastCheckedAt: new Date(), activatedAt: s.status === "active" ? new Date() : null,
      },
      select: domainSelect,
    }).catch(async (err) => {
      // Cloudflare has it but we couldn't record it: give it back, or it is
      // registered to nobody and blocks the customer from adding it again.
      await deleteCustomHostname(cf.id).catch(() => logger.error("Orphaned Cloudflare custom hostname", { hostname, cfId: cf.id }))
      throw err
    })
    logger.info("Custom domain added", { ownerId, hostname, status: s.status })
    const { _count, ...d } = row
    return { ...d, codeCount: _count.qrCodes }
  }, { timeout: 30_000 })
}

/** Re-reads one domain from Cloudflare and stores what it says. */
async function refreshRow(row: { id: string; hostname: string; cfHostnameId: string | null; status: string }) {
  const now = new Date()
  const cf = row.cfHostnameId ? await getCustomHostname(row.cfHostnameId) : null
  if (!cf) {
    await prisma.customDomain.update({
      where: { id: row.id },
      data: { status: "failed", lastCheckedAt: now, verificationErrors: ["Not registered with our domain provider. Remove the domain and add it again."] },
    })
    forgetHost(row.hostname)
    return
  }
  const s = statusFrom(cf)
  await prisma.customDomain.update({
    where: { id: row.id },
    data: {
      status: s.status, sslStatus: s.sslStatus, lastCheckedAt: now,
      verificationErrors: s.errors.length ? s.errors : [],
      ...(s.status === "active" && row.status !== "active" && { activatedAt: now }),
    },
  })
  if (s.status !== row.status) {
    logger.info("Custom domain status changed", { hostname: row.hostname, from: row.status, to: s.status })
    forgetHost(row.hostname)
  }
}

export async function checkDomain(ownerId: string, id: string) {
  const row = await prisma.customDomain.findFirst({ where: { id, userId: ownerId } })
  if (!row) throw new AppError(404, "Domain not found")
  await refreshRow(row)
  return (await listDomains(ownerId)).domains.find((d) => d.id === id)!
}

export async function setDefaultDomain(ownerId: string, id: string | null) {
  if (id) {
    const row = await prisma.customDomain.findFirst({ where: { id, userId: ownerId }, select: { status: true } })
    if (!row) throw new AppError(404, "Domain not found")
    if (row.status !== "active") throw new AppError(409, "Only a verified domain can be the default.")
  }
  await prisma.$transaction([
    prisma.customDomain.updateMany({ where: { userId: ownerId }, data: { isDefault: false } }),
    ...(id ? [prisma.customDomain.update({ where: { id }, data: { isDefault: true } })] : []),
  ])
}

/** Removes the domain everywhere. Codes printed with it stop working on that host; genxqr.com still serves them. */
export async function deleteDomain(ownerId: string, id: string): Promise<{ codesMoved: number }> {
  const row = await prisma.customDomain.findFirst({
    where: { id, userId: ownerId },
    select: { id: true, hostname: true, cfHostnameId: true, _count: { select: { qrCodes: true } } },
  })
  if (!row) throw new AppError(404, "Domain not found")
  if (row.cfHostnameId) await deleteCustomHostname(row.cfHostnameId)
  await prisma.customDomain.delete({ where: { id } }) // codes fall back to genxqr.com (SetNull)
  forgetHost(row.hostname)
  logger.info("Custom domain removed", { ownerId, hostname: row.hostname, codes: row._count.qrCodes })
  return { codesMoved: row._count.qrCodes }
}

/** Account deletion: drop the account's hostnames from Cloudflare. Best-effort; rows cascade with the user. */
export async function releaseAccountDomains(ownerId: string): Promise<void> {
  const rows = await prisma.customDomain.findMany({ where: { userId: ownerId }, select: { hostname: true, cfHostnameId: true } })
  for (const r of rows) {
    if (r.cfHostnameId) {
      await deleteCustomHostname(r.cfHostnameId).catch((err) =>
        logger.warn("Releasing a custom domain from Cloudflare failed", { hostname: r.hostname, error: String(err) }))
    }
    forgetHost(r.hostname)
  }
}

/** Expiry worker: re-check domains still waiting on DNS / HTTPS, oldest check first. */
export async function refreshPendingDomains(batch = 20): Promise<number> {
  if (!isCloudflareSaasConfigured()) return 0
  const rows = await prisma.customDomain.findMany({
    where: { status: "pending" },
    orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } },
    take: batch,
  })
  for (const row of rows) {
    await refreshRow(row).catch((err) =>
      logger.warn("Checking a custom domain failed", { hostname: row.hostname, error: err instanceof Error ? err.message : String(err) }))
  }
  return rows.length
}

/** The domain a code may print with: the owner's, and verified. Null clears it. */
export async function assertDomainForCode(ownerId: string, customDomainId: string | null | undefined): Promise<string | null | undefined> {
  if (customDomainId === undefined || customDomainId === null) return customDomainId
  const row = await prisma.customDomain.findFirst({ where: { id: customDomainId, userId: ownerId }, select: { status: true } })
  if (!row) throw new AppError(422, "That custom domain is not on this account.")
  if (row.status !== "active") throw new AppError(422, "That custom domain is not verified yet.")
  return customDomainId
}

/** The account default for a new code, when the caller didn't choose one. */
export async function defaultDomainId(ownerId: string): Promise<string | null> {
  const row = await prisma.customDomain.findFirst({ where: { userId: ownerId, isDefault: true, status: "active" }, select: { id: true } })
  return row?.id ?? null
}

// ─── Scan URLs ─────────────────────────────────────────────────────────────────

/** THE scan URL of a code. Every QR image and export goes through this. */
export function scanUrlFor(qr: { slug: string; customDomain?: { hostname: string; status: string } | null }): string {
  if (qr.customDomain && qr.customDomain.status === "active") return `https://${qr.customDomain.hostname}/r/${qr.slug}`
  return `${env.FRONTEND_URL.replace(/\/$/, "")}/r/${qr.slug}`
}

// ─── Scan-time host resolution ─────────────────────────────────────────────────

export type ScanHost =
  | { kind: "canonical"; base: string }
  /** A verified customer domain whose owner's plan includes custom domains. */
  | { kind: "custom"; base: string; ownerId: string }
  /** A verified customer domain whose owner's plan no longer includes them: send scanners to genxqr.com. */
  | { kind: "lapsed"; base: string }
  /** Not ours and not a verified customer domain. */
  | { kind: "unknown" }

const HOST_CACHE_MS = 60_000
const hostCache = new Map<string, { at: number; value: { id: string; userId: string } | null }>()

function forgetHost(hostname: string): void {
  hostCache.delete(hostname)
}

async function activeDomainByHost(hostname: string): Promise<{ id: string; userId: string } | null> {
  const hit = hostCache.get(hostname)
  if (hit && Date.now() - hit.at < HOST_CACHE_MS) return hit.value
  const row = await prisma.customDomain.findUnique({ where: { hostname }, select: { id: true, userId: true, status: true } })
  const value = row && row.status === "active" ? { id: row.id, userId: row.userId } : null
  hostCache.set(hostname, { at: Date.now(), value })
  if (hostCache.size > 5_000) hostCache.delete(hostCache.keys().next().value!)
  return value
}

/**
 * Which kind of host a scan request arrived on. IP literals and our own hosts
 * are canonical (dev LAN testing scans through an IP).
 */
export async function resolveScanHost(rawHost: string | undefined): Promise<ScanHost> {
  const canonicalBase = env.FRONTEND_URL.replace(/\/$/, "")
  const host = (rawHost ?? "").toLowerCase().replace(/\.$/, "")
  if (!host || net.isIP(host) || canonicalHosts().has(host)) return { kind: "canonical", base: canonicalBase }
  const domain = await activeDomainByHost(host)
  if (!domain) return { kind: "unknown" }
  const limits = await getPlanLimitsReadOnly(domain.userId).catch(() => null)
  if (!limits?.customDomains) return { kind: "lapsed", base: canonicalBase }
  return { kind: "custom", base: `https://${host}`, ownerId: domain.userId }
}

/** Test hook. */
export function _clearHostCache(): void {
  hostCache.clear()
}
