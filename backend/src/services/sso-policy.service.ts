/**
 * Which connection covers an email, and whether that person must use it.
 * Kept apart from sso.service.ts so auth.service.ts can ask without an import
 * cycle (sso.service issues sessions through auth.service).
 */
import type { SsoConnection } from "@prisma/client"
import { prisma } from "../db/prisma.js"
import { getUserPlanLimits } from "./billing.service.js"

export function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1).trim().toLowerCase()
}

/** Verified, linked (Microsoft) and on a plan that includes SSO. */
export async function isConnectionReady(c: Pick<SsoConnection, "ownerId" | "provider" | "verifiedAt" | "tenantId">): Promise<boolean> {
  if (!c.verifiedAt) return false
  if (c.provider === "microsoft" && !c.tenantId) return false
  const { limits } = await getUserPlanLimits(c.ownerId)
  return limits.sso
}

/** The usable connection for this email's domain, if any. */
export async function readyConnectionForEmail(email: string): Promise<SsoConnection | null> {
  const c = await prisma.ssoConnection.findFirst({ where: { domain: emailDomain(email), verifiedAt: { not: null } } })
  return c && (await isConnectionReady(c)) ? c : null
}

/**
 * The connection this person is REQUIRED to sign in through, or null. The
 * connection's owner is never bound by it — their password is the way back in
 * if the provider or the link breaks (decided 31 Oct 2026).
 */
export async function requiredSsoFor(email: string, userId: string | null): Promise<SsoConnection | null> {
  const c = await readyConnectionForEmail(email)
  if (!c || !c.enforced || c.ownerId === userId) return null
  return c
}
