/**
 * Is this account a client an agency manages? (agency.service.ts)
 *
 * Kept free of other service imports so billing.service.ts, which works out
 * every account's limits, can ask without an import cycle.
 */
import type { AgencyClient } from "@prisma/client"
import { prisma } from "../db/prisma.js"

export type ManagedClient = Pick<
  AgencyClient,
  "id" | "agencyId" | "userId" | "name" | "maxCodes" | "maxScansPerMonth" | "maxDomains" | "maxStorageGB" | "features" | "createdAt"
>

const select = {
  id: true, agencyId: true, userId: true, name: true, maxCodes: true, maxScansPerMonth: true,
  maxDomains: true, maxStorageGB: true, features: true, createdAt: true,
} as const

/** The client record when `userId` is a managed client's account, else null. */
export function getManagedClient(userId: string): Promise<ManagedClient | null> {
  return prisma.agencyClient.findUnique({ where: { userId }, select })
}

/**
 * Whether this client is within the agency plan's client count — the earliest
 * clients first, as with team seats. After a downgrade (Enterprise 50 → Agency
 * 15) the newest clients beyond the count lose service until there is room.
 */
export async function clientWithinCount(client: Pick<ManagedClient, "id" | "agencyId" | "createdAt">, clientsLimit: number): Promise<boolean> {
  if (clientsLimit <= 0) return false
  const ahead = await prisma.agencyClient.count({
    where: {
      agencyId: client.agencyId,
      OR: [{ createdAt: { lt: client.createdAt } }, { createdAt: client.createdAt, id: { lt: client.id } }],
    },
  })
  return ahead < clientsLimit
}

/** What an agency has handed out to its clients, summed. */
export async function allocatedToClients(agencyId: string): Promise<{ count: number; codes: number; scans: number; domains: number; storageGB: number }> {
  const agg = await prisma.agencyClient.aggregate({
    where: { agencyId },
    _count: true,
    _sum: { maxCodes: true, maxScansPerMonth: true, maxDomains: true, maxStorageGB: true },
  })
  return {
    count: agg._count,
    codes: agg._sum.maxCodes ?? 0,
    scans: agg._sum.maxScansPerMonth ?? 0,
    domains: agg._sum.maxDomains ?? 0,
    storageGB: agg._sum.maxStorageGB ?? 0,
  }
}

export interface ClientFeatures {
  abTesting: boolean
  smartRouting: boolean
  bulkGeneration: boolean
}

export function readClientFeatures(raw: unknown): ClientFeatures {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  // Anything not switched off explicitly is on.
  return {
    abTesting: o.abTesting !== false,
    smartRouting: o.smartRouting !== false,
    bulkGeneration: o.bulkGeneration !== false,
  }
}

/** Synthetic address for a managed account: `.invalid` can never receive mail (RFC 2606). */
export const MANAGED_EMAIL_DOMAIN = "clients.genxqr.invalid"
export function isManagedAddress(email: string): boolean {
  return email.toLowerCase().endsWith(`@${MANAGED_EMAIL_DOMAIN}`) || email.toLowerCase().endsWith(".invalid")
}
