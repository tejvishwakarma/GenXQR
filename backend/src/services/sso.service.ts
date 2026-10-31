/**
 * Single sign-on for a company domain (decided 31 Oct 2026; Business+).
 *
 * The account owner claims a domain and picks Google Workspace or Microsoft
 * Entra ID. A DNS TXT record proves the domain is theirs; for Microsoft the
 * owner also signs in once with a company account, which links that company's
 * directory (tenant). From then on anyone with an address at the domain can
 * "Sign in with SSO":
 * - Google: the ID token's hd (Workspace domain) must equal the domain.
 * - Microsoft: the token's tid must be the linked tenant.
 * and in both cases the address must be AT the domain. The browser never
 * supplies identity — oidc.service.ts verifies the provider's signed token.
 *
 * People without a GenXQR account get one and join the owner's team with the
 * connection's default role while a seat is free; existing people join too
 * (or just sign in when the team is full). The owner can REQUIRE SSO for the
 * domain — password, reset links and other Google sign-ins stop working for
 * its people — except for the owner (sso-policy.service.ts).
 */
import { randomBytes } from "node:crypto"
import { resolveTxt as dnsResolveTxt } from "node:dns/promises"
import type { SsoConnection, TeamRole } from "@prisma/client"
import { prisma } from "../db/prisma.js"
import { redis } from "../redis/client.js"
import { AppError } from "../middleware/error.middleware.js"
import { normalizeEmail } from "../utils/normalize-email.util.js"
import { logAudit } from "./audit.service.js"
import { getUserPlanLimits } from "./billing.service.js"
import { getOrCreateOwnedTeam } from "./team.service.js"
import { startVerifiedSession } from "./auth.service.js"
import { emailDomain, isConnectionReady } from "./sso-policy.service.js"
import {
  buildAuthorizationUrl,
  completeAuthorization,
  isProviderConfigured,
  type SsoIdentity,
  type SsoProvider,
} from "./oidc.service.js"

export const SSO_STATE_TTL_SECONDS = 600
export const SSO_JOIN_ROLES = ["EDITOR", "VIEWER"] as const satisfies readonly TeamRole[]
const TXT_PREFIX = "genxqr-verify="

// ─── DNS (replaceable in tests) ─────────────────────────────────────────────

let resolveTxt: (name: string) => Promise<string[][]> = dnsResolveTxt
export function _setTxtResolverForTests(fn: ((name: string) => Promise<string[][]>) | null): void {
  resolveTxt = fn ?? dnsResolveTxt
}

export function txtRecordName(domain: string): string {
  return `_genxqr.${domain}`
}

// ─── Domain ─────────────────────────────────────────────────────────────────

const DOMAIN_RE = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

export function normalizeDomain(input: string): string {
  const d = input.trim().toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^.*@/, "")
    .replace(/[/?#].*$/, "")
    .replace(/\.+$/, "")
  if (!DOMAIN_RE.test(d)) throw new AppError(422, "Enter your company's email domain, like acme.com.")
  if (d === "genxqr.com" || d.endsWith(".genxqr.com")) throw new AppError(422, "That domain can't be used for SSO.")
  return d
}

// ─── Settings (the owner's page) ────────────────────────────────────────────

export interface SsoSettingsView {
  domain: string
  provider: SsoProvider
  verified: boolean
  tenantLinked: boolean
  defaultRole: TeamRole
  enforced: boolean
  /** People can sign in with it now. */
  ready: boolean
  dns: { type: "TXT"; name: string; value: string }
}

async function view(c: SsoConnection): Promise<SsoSettingsView> {
  return {
    domain: c.domain,
    provider: c.provider as SsoProvider,
    verified: c.verifiedAt !== null,
    tenantLinked: c.tenantId !== null,
    defaultRole: c.defaultRole,
    enforced: c.enforced,
    ready: await isConnectionReady(c),
    dns: { type: "TXT", name: txtRecordName(c.domain), value: `${TXT_PREFIX}${c.verifyToken}` },
  }
}

export async function getSettings(ownerId: string) {
  const [c, { limits }] = await Promise.all([
    prisma.ssoConnection.findUnique({ where: { ownerId } }),
    getUserPlanLimits(ownerId),
  ])
  return {
    available: limits.sso,
    providers: { google: isProviderConfigured("google"), microsoft: isProviderConfigured("microsoft") },
    connection: c ? await view(c) : null,
  }
}

export async function saveConnection(
  ownerId: string,
  input: { domain: string; provider: SsoProvider; defaultRole: (typeof SSO_JOIN_ROLES)[number] },
): Promise<SsoSettingsView> {
  const domain = normalizeDomain(input.domain)
  if (!isProviderConfigured(input.provider)) {
    throw new AppError(503, `${input.provider === "google" ? "Google" : "Microsoft"} sign-in is not available yet. Please try again later.`)
  }
  const existing = await prisma.ssoConnection.findUnique({ where: { ownerId } })
  const domainChanged = existing?.domain !== domain
  const providerChanged = existing?.provider !== input.provider
  const c = await prisma.ssoConnection.upsert({
    where: { ownerId },
    create: { ownerId, domain, provider: input.provider, defaultRole: input.defaultRole, verifyToken: randomBytes(16).toString("hex") },
    update: {
      domain,
      provider: input.provider,
      defaultRole: input.defaultRole,
      // A new domain must be proved again; a new provider must be linked again.
      // Either way nobody is required to use SSO until it works.
      ...(domainChanged && { verifyToken: randomBytes(16).toString("hex"), verifiedAt: null }),
      ...((domainChanged || providerChanged) && { tenantId: null, enforced: false }),
    },
  })
  logAudit({ userId: ownerId, action: "sso.configure", category: "settings", entityType: "SsoConnection", entityId: c.id, metadata: { domain, provider: input.provider, defaultRole: input.defaultRole } })
  return view(c)
}

export async function verifyDomain(ownerId: string): Promise<SsoSettingsView> {
  const c = await prisma.ssoConnection.findUnique({ where: { ownerId } })
  if (!c) throw new AppError(404, "Set up SSO first.")
  if (c.verifiedAt) return view(c)

  let records: string[][]
  try {
    records = await resolveTxt(txtRecordName(c.domain))
  } catch {
    records = []
  }
  const expected = `${TXT_PREFIX}${c.verifyToken}`
  if (!records.some((chunks) => chunks.join("").trim() === expected)) {
    throw new AppError(422, `We couldn't find the TXT record yet. Add ${txtRecordName(c.domain)} with the value shown, wait a few minutes and try again.`)
  }
  try {
    const updated = await prisma.ssoConnection.update({ where: { id: c.id }, data: { verifiedAt: new Date() } })
    logAudit({ userId: ownerId, action: "sso.verify", category: "settings", entityType: "SsoConnection", entityId: c.id, metadata: { domain: c.domain } })
    return view(updated)
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      throw new AppError(409, "This domain is already connected to another GenXQR account.")
    }
    throw err
  }
}

export async function setEnforced(ownerId: string, enforced: boolean): Promise<{ settings: SsoSettingsView; sessionsEnded: number }> {
  const c = await prisma.ssoConnection.findUnique({ where: { ownerId } })
  if (!c) throw new AppError(404, "Set up SSO first.")
  if (enforced && !(await isConnectionReady(c))) throw new AppError(409, "Finish setting up SSO before requiring it.")
  const updated = await prisma.ssoConnection.update({ where: { id: c.id }, data: { enforced } })
  let sessionsEnded = 0
  if (enforced && !c.enforced) {
    // Sessions started with a password before this switch would otherwise last
    // up to 30 days. Everyone at the domain but the owner signs in again.
    const { count } = await prisma.refreshToken.updateMany({
      where: { revokedAt: null, user: { email: { endsWith: `@${c.domain}` }, id: { not: ownerId } } },
      data: { revokedAt: new Date() },
    })
    sessionsEnded = count
  }
  logAudit({ userId: ownerId, action: enforced ? "sso.enforce" : "sso.unenforce", category: "settings", entityType: "SsoConnection", entityId: c.id, metadata: { domain: c.domain, sessionsEnded } })
  return { settings: await view(updated), sessionsEnded }
}

export async function deleteConnection(ownerId: string): Promise<void> {
  const c = await prisma.ssoConnection.findUnique({ where: { ownerId } })
  if (!c) return
  await prisma.ssoConnection.delete({ where: { id: c.id } })
  logAudit({ userId: ownerId, action: "sso.remove", category: "settings", entityType: "SsoConnection", entityId: c.id, metadata: { domain: c.domain } })
}

// ─── Flows ──────────────────────────────────────────────────────────────────

interface StoredState {
  purpose: "login" | "link"
  provider: SsoProvider
  connectionId: string
  /** link: the owner who started it */
  ownerId?: string
  codeVerifier: string
  nonce: string
}

const stateKey = (state: string) => `sso:state:${state}`

async function begin(purpose: StoredState["purpose"], c: SsoConnection, extra: { ownerId?: string; loginHint?: string }) {
  const provider = c.provider as SsoProvider
  const state = randomBytes(32).toString("hex")
  const auth = buildAuthorizationUrl(provider, state, { loginHint: extra.loginHint, domain: c.domain })
  const stored: StoredState = { purpose, provider, connectionId: c.id, ownerId: extra.ownerId, codeVerifier: auth.codeVerifier, nonce: auth.nonce }
  await redis.setex(stateKey(state), SSO_STATE_TTL_SECONDS, JSON.stringify(stored))
  return { url: auth.url, state }
}

/** "Sign in with SSO": the provider page to send this person to. */
export async function startLogin(email: string) {
  const c = await prisma.ssoConnection.findFirst({ where: { domain: emailDomain(email), verifiedAt: { not: null } } })
  if (!c || !(await isConnectionReady(c))) throw new AppError(404, "SSO isn't set up for this email domain. Sign in with your password or Google instead.")
  return begin("login", c, { loginHint: email })
}

/** Microsoft: the owner signs in once with a company account to link the tenant. */
export async function startLink(ownerId: string) {
  const c = await prisma.ssoConnection.findUnique({ where: { ownerId } })
  if (!c) throw new AppError(404, "Set up SSO first.")
  if (c.provider !== "microsoft") throw new AppError(409, "Only Microsoft connections need linking.")
  if (!c.verifiedAt) throw new AppError(409, "Verify the domain first.")
  return begin("link", c, { ownerId })
}

export type CallbackResult =
  | { kind: "login"; accessToken: string; refreshToken: string; joinedTeam: boolean }
  | { kind: "link" }

/** Takes the state ONCE; null when unknown or expired. */
export async function takeState(state: string): Promise<StoredState | null> {
  // GET + DEL in one MULTI (GETDEL needs Redis 6.2).
  const res = await redis.multi().get(stateKey(state)).del(stateKey(state)).exec()
  const raw = res?.[0]?.[1]
  if (typeof raw !== "string") return null
  try {
    return JSON.parse(raw) as StoredState
  } catch {
    return null
  }
}

export async function completeCallback(provider: SsoProvider, code: string, stored: StoredState, ip: string): Promise<CallbackResult> {
  if (stored.provider !== provider) throw new AppError(400, "sso_state")
  const identity = await completeAuthorization(provider, code, stored.codeVerifier, stored.nonce)
  const c = await prisma.ssoConnection.findUnique({ where: { id: stored.connectionId } })
  if (!c || c.provider !== provider) throw new AppError(403, "sso_unavailable")

  if (stored.purpose === "link") return linkTenant(c, stored, identity)
  return signIn(c, identity, ip)
}

async function linkTenant(c: SsoConnection, stored: StoredState, identity: SsoIdentity): Promise<CallbackResult> {
  if (!stored.ownerId || stored.ownerId !== c.ownerId || !c.verifiedAt) throw new AppError(403, "sso_unavailable")
  // The directory being linked must hold accounts AT the verified domain.
  if (emailDomain(identity.email) !== c.domain || !identity.tenantId) throw new AppError(403, "sso_link_wrong_account")
  await prisma.ssoConnection.update({ where: { id: c.id }, data: { tenantId: identity.tenantId } })
  logAudit({ userId: c.ownerId, action: "sso.link", category: "settings", entityType: "SsoConnection", entityId: c.id, metadata: { domain: c.domain } })
  return { kind: "link" }
}

/** The identity must come from THIS connection's company, for an address at its domain. */
function belongsToConnection(c: SsoConnection, identity: SsoIdentity): boolean {
  if (emailDomain(identity.email) !== c.domain) return false
  if (c.provider === "google") return identity.hostedDomain === c.domain
  return identity.tenantId !== null && identity.tenantId === c.tenantId
}

async function signIn(c: SsoConnection, identity: SsoIdentity, ip: string): Promise<CallbackResult> {
  if (!(await isConnectionReady(c))) throw new AppError(403, "sso_unavailable")
  if (!belongsToConnection(c, identity)) throw new AppError(403, "sso_wrong_account")

  const blocked = await prisma.blocklist.findFirst({ where: { type: "email", value: identity.email }, select: { isActive: true, isPermanent: true } })
  if (blocked?.isPermanent) throw new AppError(403, "account_permanently_banned")
  if (blocked?.isActive) throw new AppError(403, "account_deleted")

  const team = await getOrCreateOwnedTeam(c.ownerId)
  const { limits } = await getUserPlanLimits(c.ownerId)

  const result = await prisma.$transaction(async (tx) => {
    // Seats are counted and taken under one lock per team, so two people
    // signing in together cannot both take the last seat.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`team:${c.ownerId}`}))`

    let user = await tx.user.findUnique({ where: { email: identity.email } })
    const isMember = user
      ? user.id === c.ownerId || (await tx.teamMember.count({ where: { teamId: team.id, userId: user.id } })) > 0
      : false

    let joinRole: TeamRole | null = null
    let inviteId: string | null = null
    if (!isMember) {
      const invite = await tx.teamInvite.findFirst({
        where: { teamId: team.id, email: identity.email, acceptedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        select: { id: true, role: true },
      })
      if (invite) {
        // Its seat is already counted.
        joinRole = invite.role === "OWNER" ? "ADMIN" : invite.role
        inviteId = invite.id
      } else {
        const [members, pending] = await Promise.all([
          tx.teamMember.count({ where: { teamId: team.id } }),
          tx.teamInvite.count({ where: { teamId: team.id, acceptedAt: null } }),
        ])
        if (1 + members + pending < limits.teamSeatsLimit) joinRole = c.defaultRole
        // No seat and no account: nothing to sign in to — ask for a seat.
        else if (!user) throw new AppError(403, "sso_no_seat")
      }
    }

    let created = false
    if (!user) {
      created = true
      user = await tx.user.create({
        data: {
          email: identity.email,
          normalizedEmail: normalizeEmail(identity.email),
          name: identity.name ?? identity.email.slice(0, identity.email.indexOf("@")),
          emailVerified: true,
        },
      })
    } else if (!user.emailVerified) {
      // As with Google sign-in: the company just proved this inbox is its
      // person's. Whoever registered the address without proving it does not
      // keep a password, sessions or pending links on it (auth.service).
      const now = new Date()
      await tx.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } })
      await tx.emailVerificationToken.deleteMany({ where: { userId: user.id } })
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id } })
      user = await tx.user.update({ where: { id: user.id }, data: { passwordHash: null, emailVerified: true } })
    }

    if (joinRole) {
      await tx.teamMember.create({ data: { teamId: team.id, userId: user.id, role: joinRole } })
      if (inviteId) await tx.teamInvite.update({ where: { id: inviteId }, data: { acceptedAt: new Date() } })
    }
    return { user, created, joinRole }
  })

  const { user, created, joinRole } = result
  const session = await startVerifiedSession(user, ip, created)
  logAudit({ userId: user.id, action: "auth.login.sso", category: "auth", entityType: "User", entityId: user.id, metadata: { provider: c.provider, domain: c.domain }, ip })
  if (joinRole) {
    logAudit({ userId: user.id, ownerId: c.ownerId, action: "team.member.join_sso", category: "team", entityType: "TeamMember", metadata: { email: user.email, role: joinRole }, ip })
  }
  return { kind: "login", ...session, joinedTeam: joinRole !== null }
}
