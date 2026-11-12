import { randomBytes } from "node:crypto"
import type { Response } from "express"
import { Prisma } from "@prisma/client"
import type { OAuthServerProvider, AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js"
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js"
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js"
import type { OAuthClientInformationFull, OAuthTokenRevocationRequest, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js"
import {
  InvalidClientMetadataError, InvalidGrantError, InvalidRequestError, InvalidTargetError, InvalidTokenError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js"
import { prisma } from "../db/prisma.js"
import { redis } from "../redis/client.js"
import { env } from "../config/env.js"
import { AppError } from "../middleware/error.middleware.js"
import { hashToken } from "../utils/crypto.js"
import { getPlanLimitsReadOnly } from "./billing.service.js"
import { isAccountBlocked } from "./blocklist.service.js"

/**
 * OAuth 2.1 for the MCP server (built 8 Nov 2026), so AI apps that connect
 * with a sign-in — claude.ai and ChatGPT connectors — can use GenXQR without
 * an API key. The MCP SDK's handlers do the protocol (metadata, dynamic client
 * registration, PKCE, token endpoint); this is the provider behind them.
 *
 * - Anyone may register a client (RFC 7591). Nothing about a client is
 *   trusted: a signed-in person approves each connection on /app/oauth/authorize,
 *   and the code is bound to that client, its redirect URI and PKCE challenge.
 * - Codes live 10 minutes in Redis and are used once. Access tokens last an
 *   hour, refresh tokens 30 days; refreshing rotates the pair, and replaying a
 *   rotated refresh token later than 30 s ends the whole connection (a copy was
 *   stolen). Tokens are stored as sha256, like sessions.
 * - A token is for the MCP server only (its `resource`), acts as the person who
 *   approved it on their own account, and needs API access on their plan at
 *   every use (like an API key).
 */

export const ACCESS_TOKEN_PREFIX = "gxqr_oat_"
const REFRESH_TOKEN_PREFIX = "gxqr_ort_"
const ACCESS_TTL_S = 3600
const REFRESH_TTL_S = 30 * 86_400
const CODE_TTL_S = 600
const REQUEST_TTL_S = 600
/** A rotated refresh token reused within this is two requests racing, not theft. */
const REUSE_GRACE_MS = 30_000
export const SCOPE = "mcp"

const origin = () => new URL(env.FRONTEND_URL).origin
/** The one resource tokens are for: the MCP endpoint. */
export const mcpResourceUrl = () => new URL("/v1/mcp", origin())
export const issuerUrl = () => new URL(origin())

const newToken = (prefix: string) => prefix + randomBytes(32).toString("base64url")

interface PendingRequest {
  clientId: string
  redirectUri: string
  codeChallenge: string
  state?: string
  scopes: string[]
  resource: string
}
interface IssuedCode extends PendingRequest {
  userId: string
}

/**
 * Redirect URIs a client may register: https, or http only on the loopback
 * address (RFC 8252 native apps), or an app's own scheme (cursor://…). Never a
 * scheme a browser would run or read locally.
 */
function allowedRedirect(uri: string): boolean {
  let u: URL
  try { u = new URL(uri) } catch { return false }
  if (u.hash) return false
  if (u.protocol === "https:") return true
  if (u.protocol === "http:") return ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
  return /^[a-z][a-z0-9+.-]*:$/.test(u.protocol) && !REFUSED_SCHEMES.test(u.protocol)
}

/**
 * Schemes that are never an app's own callback: ones a browser runs or reads
 * locally, and ones the operating system hands to a built-in program (mail,
 * phone, file shares, Windows search and settings…). A redirect to those from
 * genxqr.com would open that program with attacker-chosen input.
 */
const REFUSED_SCHEMES = /^(javascript|data|file|vbscript|blob|about|view-source|chrome|chrome-extension|edge|resource|jar|ftp|ftps|sftp|ws|wss|mailto|tel|sms|facetime|callto|smb|nfs|ssh|telnet|ldap|ldaps|intent|market|itms|itms-apps|itms-services|search-ms|shell|ms-[a-z0-9+.-]*):$/

/**
 * Names anyone might borrow to look trustworthy, and the only web addresses
 * that really belong to them. Registration is public, so an app CAN call
 * itself "Claude"; the consent page says so when it does not return there.
 */
const KNOWN_APPS: { name: string; pattern: RegExp; domains: string[] }[] = [
  { name: "Claude", pattern: /claude|anthropic/i, domains: ["claude.ai", "claude.com", "anthropic.com"] },
  { name: "ChatGPT", pattern: /chat\s*gpt|open\s*ai/i, domains: ["chatgpt.com", "openai.com"] },
  { name: "Google", pattern: /gemini|google/i, domains: ["google.com"] },
  { name: "Microsoft", pattern: /copilot|microsoft/i, domains: ["microsoft.com", "github.com"] },
  { name: "Cursor", pattern: /cursor/i, domains: ["cursor.com", "cursor.sh"] },
  { name: "GenXQR", pattern: /gen\s*x\s*qr/i, domains: [] },
]

const onDomain = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`)

/** Letters that hide or reorder text (bidi overrides, zero-width, control) never belong in a name. */
const cleanName = (name: string) => name.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, "").replace(/\s+/g, " ").trim().slice(0, 100)

/**
 * Where an approval is sent, for the consent page. A web address is shown in
 * full; "this device" is a loopback address or an installed app's own scheme,
 * which only reaches a program on the person's own machine.
 */
export function describeRedirect(clientName: string, redirectUri: string): { returnsTo: string; onThisDevice: boolean; impersonates: string | null } {
  let u: URL
  try { u = new URL(redirectUri) } catch { return { returnsTo: redirectUri, onThisDevice: false, impersonates: null } }
  if (u.protocol !== "https:") {
    return { returnsTo: u.protocol === "http:" ? u.host : `${u.protocol}//`, onThisDevice: true, impersonates: null }
  }
  const host = u.hostname.toLowerCase()
  const ours = issuerUrl().hostname.toLowerCase()
  const borrowed = KNOWN_APPS.find((app) => app.pattern.test(clientName) && !(app.name === "GenXQR" ? onDomain(host, ours) : app.domains.some((d) => onDomain(host, d))))
  return { returnsTo: u.host, onThisDevice: false, impersonates: borrowed?.name ?? null }
}

/** The resource a request names must be ours; with none, it is ours by default. */
function checkResource(resource: URL | string | undefined): string {
  const ours = mcpResourceUrl().href
  if (resource === undefined) return ours
  const href = typeof resource === "string" ? resource : resource.href
  if (href.replace(/\/$/, "") !== ours) throw new InvalidTargetError(`This server issues tokens only for ${ours}`)
  return ours
}

// ─── Clients ──────────────────────────────────────────────────────────────────

export const clientsStore: OAuthRegisteredClientsStore = {
  async getClient(clientId) {
    const row = await prisma.oAuthClient.findUnique({ where: { id: clientId } })
    if (!row) return undefined
    return {
      ...(row.metadata as Record<string, unknown>),
      client_id: row.id,
      ...(row.secret && { client_secret: row.secret }),
      ...(row.secretExpiresAt !== null && { client_secret_expires_at: row.secretExpiresAt }),
      client_id_issued_at: Math.floor(row.createdAt.getTime() / 1000),
    } as OAuthClientInformationFull
  },

  async registerClient(client) {
    const redirects = client.redirect_uris ?? []
    if (redirects.length === 0 || redirects.length > 10 || !redirects.every((u) => allowedRedirect(String(u)))) {
      throw new InvalidClientMetadataError("redirect_uris must be https (or loopback http, or an app scheme), at most 10")
    }
    const id = `gxqr_client_${randomBytes(16).toString("hex")}`
    const { client_secret, client_secret_expires_at, ...metadata } = client as Record<string, unknown>
    const name = typeof metadata.client_name === "string" ? cleanName(metadata.client_name) || undefined : undefined
    delete metadata.client_name
    const row = await prisma.oAuthClient.create({
      data: {
        id,
        secret: typeof client_secret === "string" ? client_secret : null,
        secretExpiresAt: typeof client_secret_expires_at === "number" ? client_secret_expires_at : null,
        metadata: { ...metadata, ...(name && { client_name: name }) } as Prisma.InputJsonValue,
      },
    })
    return { ...client, client_id: row.id, client_id_issued_at: Math.floor(row.createdAt.getTime() / 1000) } as OAuthClientInformationFull
  },
}

const clientName = (c: { metadata: Prisma.JsonValue } | OAuthClientInformationFull) => {
  const m = ("metadata" in c ? c.metadata : c) as Record<string, unknown>
  return typeof m?.client_name === "string" && cleanName(m.client_name) ? cleanName(m.client_name) : "An AI app"
}

// ─── Tokens ───────────────────────────────────────────────────────────────────

async function issueTokens(grant: { grantId?: string; clientId: string; userId: string; scopes: string[]; resource: string }): Promise<OAuthTokens> {
  const access = newToken(ACCESS_TOKEN_PREFIX)
  const refresh = newToken(REFRESH_TOKEN_PREFIX)
  const now = Date.now()
  await prisma.oAuthToken.create({
    data: {
      grantId: grant.grantId ?? randomBytes(12).toString("hex"),
      clientId: grant.clientId,
      userId: grant.userId,
      accessHash: hashToken(access),
      refreshHash: hashToken(refresh),
      scopes: grant.scopes,
      resource: grant.resource,
      accessExpiresAt: new Date(now + ACCESS_TTL_S * 1000),
      refreshExpiresAt: new Date(now + REFRESH_TTL_S * 1000),
    },
  })
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: grant.scopes.join(" ") }
}

const revokeGrant = (grantId: string) =>
  prisma.oAuthToken.updateMany({ where: { grantId, revokedAt: null }, data: { revokedAt: new Date() } })

export const oauthProvider: OAuthServerProvider = {
  get clientsStore() {
    return clientsStore
  },

  /** Holds the request and sends the person to GenXQR's consent page. */
  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response) {
    // Answered here, not thrown: the SDK turns a thrown error into a redirect to
    // the client's address, and with public registration that is a ready-made
    // "genxqr.com link that lands on any site". Nothing leaves for a client's
    // address until a signed-in person has answered the consent page.
    let resource: string
    try { resource = checkResource(params.resource) } catch {
      res.status(400).json({ error: "invalid_target", error_description: `This server issues tokens only for ${mcpResourceUrl().href}` })
      return
    }
    const scopes = params.scopes?.length ? params.scopes : [SCOPE]
    if (scopes.some((s) => s !== SCOPE)) {
      res.status(400).json({ error: "invalid_scope", error_description: `Unknown scope; this server has one: ${SCOPE}` })
      return
    }
    const id = randomBytes(24).toString("base64url")
    const pending: PendingRequest = { clientId: client.client_id, redirectUri: params.redirectUri, codeChallenge: params.codeChallenge, state: params.state, scopes, resource }
    await redis.setex(`oauth:req:${id}`, REQUEST_TTL_S, JSON.stringify(pending))
    res.redirect(302, `${origin()}/app/oauth/authorize?request=${id}`)
  },

  async challengeForAuthorizationCode(client, code) {
    const raw = await redis.get(`oauth:code:${hashToken(code)}`)
    const issued = raw ? (JSON.parse(raw) as IssuedCode) : null
    if (!issued || issued.clientId !== client.client_id) throw new InvalidGrantError("Invalid or expired authorization code")
    return issued.codeChallenge
  },

  async exchangeAuthorizationCode(client, code, _verifier, redirectUri, resource) {
    // GETDEL: a code is good for one exchange, even when two race.
    const raw = await redis.getdel(`oauth:code:${hashToken(code)}`)
    const issued = raw ? (JSON.parse(raw) as IssuedCode) : null
    if (!issued || issued.clientId !== client.client_id) throw new InvalidGrantError("Invalid or expired authorization code")
    if (redirectUri !== undefined && redirectUri !== issued.redirectUri) throw new InvalidGrantError("redirect_uri does not match the authorization request")
    if (resource !== undefined && checkResource(resource) !== issued.resource) throw new InvalidTargetError("resource does not match the authorization request")
    return issueTokens({ clientId: client.client_id, userId: issued.userId, scopes: issued.scopes, resource: issued.resource })
  },

  async exchangeRefreshToken(client, refreshToken, scopes, resource) {
    const row = await prisma.oAuthToken.findUnique({ where: { refreshHash: hashToken(refreshToken) } })
    if (!row || row.clientId !== client.client_id) throw new InvalidGrantError("Invalid refresh token")
    if (row.revokedAt) {
      // Rotated and now replayed later than a racing request would: a stolen copy. End the connection.
      if (row.rotatedAt && Date.now() - row.rotatedAt.getTime() > REUSE_GRACE_MS) await revokeGrant(row.grantId)
      throw new InvalidGrantError("Refresh token is no longer valid")
    }
    if (row.refreshExpiresAt < new Date()) throw new InvalidGrantError("Refresh token expired")
    if (resource !== undefined && checkResource(resource) !== row.resource) throw new InvalidTargetError("resource does not match")
    if (scopes?.some((s) => !row.scopes.includes(s))) throw new InvalidGrantError("Cannot widen the scope on refresh")
    // Rotate: of two concurrent refreshes, exactly one wins the conditional update.
    const won = await prisma.oAuthToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: new Date(), rotatedAt: new Date() } })
    if (won.count !== 1) throw new InvalidGrantError("Refresh token is no longer valid")
    return issueTokens({ grantId: row.grantId, clientId: row.clientId, userId: row.userId, scopes: row.scopes, resource: row.resource })
  },

  async verifyAccessToken(token): Promise<AuthInfo> {
    if (!token.startsWith(ACCESS_TOKEN_PREFIX)) throw new InvalidTokenError("Invalid access token")
    const row = await prisma.oAuthToken.findUnique({ where: { accessHash: hashToken(token) } })
    if (!row || row.revokedAt || row.accessExpiresAt < new Date()) throw new InvalidTokenError("Invalid or expired access token")
    void prisma.oAuthToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined)
    return {
      token, clientId: row.clientId, scopes: row.scopes, resource: new URL(row.resource),
      expiresAt: Math.floor(row.accessExpiresAt.getTime() / 1000), extra: { userId: row.userId },
    }
  },

  /** RFC 7009: revoking either token ends the connection it belongs to. */
  async revokeToken(client, request: OAuthTokenRevocationRequest) {
    const hash = hashToken(request.token)
    const row = await prisma.oAuthToken.findFirst({ where: { OR: [{ accessHash: hash }, { refreshHash: hash }], clientId: client.client_id } })
    if (row) await revokeGrant(row.grantId)
  },
}

// ─── Consent (the person, signed in to GenXQR) ───────────────────────────────

async function pending(requestId: string) {
  const raw = await redis.get(`oauth:req:${requestId}`)
  if (!raw) throw new AppError(404, "This sign-in request has expired. Start again from the app.")
  const req = JSON.parse(raw) as PendingRequest
  const client = await prisma.oAuthClient.findUnique({ where: { id: req.clientId }, select: { metadata: true } })
  if (!client) throw new AppError(404, "This app is no longer registered. Start again from the app.")
  return { req, client }
}

const redirectWith = (base: string, params: Record<string, string | undefined>) => {
  const u = new URL(base)
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v)
  return u.toString()
}

/** What the consent page shows: who is asking, and where they will be sent back. */
export async function describeRequest(userId: string, requestId: string) {
  const { req, client } = await pending(requestId)
  const limits = await getPlanLimitsReadOnly(userId)
  const name = clientName(client)
  const to = describeRedirect(name, req.redirectUri)
  return {
    clientName: name,
    redirectHost: to.returnsTo,
    onThisDevice: to.onThisDevice,
    /** A well-known app's name, when this app uses it but does not return to that app's address. */
    impersonates: to.impersonates,
    planAllows: !!limits.apiAccess,
  }
}

/**
 * The person's answer. Approve: a one-time code for the client; deny: an
 * access_denied error. Either way the request is used up, and the client's
 * redirect URI (with state) comes back for the browser to follow.
 */
export async function answerRequest(user: { id: string; email: string }, requestId: string, approve: boolean) {
  const { req, client } = await pending(requestId)
  if ((await redis.del(`oauth:req:${requestId}`)) !== 1) throw new AppError(404, "This sign-in request has expired. Start again from the app.")
  if (!approve) return { redirect: redirectWith(req.redirectUri, { error: "access_denied", error_description: "The user declined", state: req.state }), clientName: clientName(client) }
  if (await isAccountBlocked(user.id, user.email)) throw new AppError(403, "This account has been suspended.")
  if (!(await getPlanLimitsReadOnly(user.id)).apiAccess) throw new AppError(403, "Connecting AI apps needs API access, on the Pro plan or higher.")
  const code = randomBytes(32).toString("base64url")
  const issued: IssuedCode = { ...req, userId: user.id }
  await redis.setex(`oauth:code:${hashToken(code)}`, CODE_TTL_S, JSON.stringify(issued))
  return { redirect: redirectWith(req.redirectUri, { code, state: req.state }), clientName: clientName(client) }
}

/** The AI apps a person has connected, one row per app, for Settings → API keys. */
export async function listConnections(userId: string) {
  const rows = await prisma.oAuthToken.findMany({
    where: { userId, revokedAt: null, refreshExpiresAt: { gt: new Date() } },
    select: { clientId: true, createdAt: true, lastUsedAt: true, client: { select: { metadata: true } } },
    orderBy: { createdAt: "desc" },
  })
  const byClient = new Map<string, { clientId: string; name: string; connectedAt: Date; lastUsedAt: Date | null }>()
  for (const r of rows) {
    const seen = byClient.get(r.clientId)
    const last = r.lastUsedAt && (!seen?.lastUsedAt || r.lastUsedAt > seen.lastUsedAt) ? r.lastUsedAt : seen?.lastUsedAt ?? null
    byClient.set(r.clientId, { clientId: r.clientId, name: clientName(r.client), connectedAt: seen && seen.connectedAt < r.createdAt ? seen.connectedAt : r.createdAt, lastUsedAt: last })
  }
  return [...byClient.values()]
}

/** Disconnect an app: every token it holds for this person stops working. */
export async function revokeConnection(userId: string, clientId: string) {
  const { count } = await prisma.oAuthToken.updateMany({ where: { userId, clientId, revokedAt: null }, data: { revokedAt: new Date() } })
  if (count === 0) throw new AppError(404, "No such connection")
}

/**
 * Housekeeping (expiry worker): registration is public, so apps that never got
 * connected are dropped after a day, and tokens are deleted a week after they
 * can no longer be used.
 */
export async function sweepOAuth(now = new Date()): Promise<{ clients: number; tokens: number }> {
  const week = new Date(now.getTime() - 7 * 86_400_000)
  const tokens = await prisma.oAuthToken.deleteMany({
    where: { OR: [{ refreshExpiresAt: { lt: week } }, { revokedAt: { lt: week } }] },
  })
  const clients = await prisma.oAuthClient.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - 86_400_000) }, tokens: { none: {} } },
  })
  return { clients: clients.count, tokens: tokens.count }
}
