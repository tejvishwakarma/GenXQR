/**
 * OpenID Connect against Google and Microsoft Entra ID, for single sign-on
 * (sso.service.ts). Authorization-code flow with PKCE and a nonce; the ID
 * token's signature, audience, issuer, expiry and nonce are all checked here,
 * so what comes out is what the provider asserted — nothing from the browser.
 *
 * Both apps are GenXQR's own: Google reuses the sign-in client
 * (GOOGLE_CLIENT_ID/SECRET), Microsoft is one multi-tenant app registration
 * (MICROSOFT_CLIENT_ID/SECRET) using the "organizations" endpoints, so personal
 * Microsoft accounts cannot sign in this way.
 */
import { createHash, randomBytes } from "node:crypto"
import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose"
import { env } from "../config/env.js"
import { AppError } from "../middleware/error.middleware.js"

export type SsoProvider = "google" | "microsoft"
export const SSO_PROVIDERS: readonly SsoProvider[] = ["google", "microsoft"]

const ENDPOINTS: Record<SsoProvider, { authorize: string; token: string; jwks: string }> = {
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    jwks: "https://www.googleapis.com/oauth2/v3/certs",
  },
  microsoft: {
    authorize: "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/organizations/oauth2/v2.0/token",
    jwks: "https://login.microsoftonline.com/common/discovery/v2.0/keys",
  },
}

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"]

function credentials(provider: SsoProvider): { clientId: string; clientSecret: string } | null {
  const id = provider === "google" ? env.GOOGLE_CLIENT_ID : env.MICROSOFT_CLIENT_ID
  const secret = provider === "google" ? env.GOOGLE_CLIENT_SECRET : env.MICROSOFT_CLIENT_SECRET
  return id && secret ? { clientId: id, clientSecret: secret } : null
}

export function isProviderConfigured(provider: SsoProvider): boolean {
  return credentials(provider) !== null
}

function requireCredentials(provider: SsoProvider) {
  const c = credentials(provider)
  if (!c) throw new AppError(503, `${provider === "google" ? "Google" : "Microsoft"} sign-in is not configured on this server.`)
  return c
}

export function redirectUri(provider: SsoProvider): string {
  return `${env.BACKEND_URL.replace(/\/+$/, "")}/api/auth/sso/callback/${provider}`
}

const b64url = (buf: Buffer) => buf.toString("base64url")

export interface AuthorizationRequest {
  url: string
  /** Kept server-side with the state; sent with the code exchange. */
  codeVerifier: string
  nonce: string
}

export function buildAuthorizationUrl(
  provider: SsoProvider,
  state: string,
  hints: { loginHint?: string; domain?: string } = {},
): AuthorizationRequest {
  const { clientId } = requireCredentials(provider)
  const codeVerifier = b64url(randomBytes(32))
  const nonce = b64url(randomBytes(16))
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri(provider),
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: b64url(createHash("sha256").update(codeVerifier).digest()),
    code_challenge_method: "S256",
    prompt: "select_account",
  })
  if (hints.loginHint) params.set("login_hint", hints.loginHint)
  // UI hints only — the domain is enforced on the returned ID token (Google
  // says not to rely on hd in the request for access control).
  if (hints.domain && provider === "google") params.set("hd", hints.domain)
  if (hints.domain && provider === "microsoft") params.set("domain_hint", hints.domain)
  return { url: `${ENDPOINTS[provider].authorize}?${params}`, codeVerifier, nonce }
}

/** What the provider asserted about the person who signed in. */
export interface SsoIdentity {
  provider: SsoProvider
  /** Lower-cased. Google: verified by Google. Microsoft: trusted only together with tenantId. */
  email: string
  name: string | null
  /** Google: Workspace domain of the account ("hd"); null for a consumer account. */
  hostedDomain: string | null
  /** Microsoft: the Entra tenant ("tid"). */
  tenantId: string | null
  /** The provider's stable id for the person. */
  subject: string
}

// ─── Test hooks ─────────────────────────────────────────────────────────────

const remoteKeySets = new Map<SsoProvider, JWTVerifyGetKey>()
let keySetOverride: JWTVerifyGetKey | null = null

/** Tests only: verify ID tokens against these keys instead of the provider's. */
export function _setKeySetForTests(keys: JWTVerifyGetKey | null): void {
  keySetOverride = keys
}

function keySet(provider: SsoProvider): JWTVerifyGetKey {
  if (keySetOverride) return keySetOverride
  let ks = remoteKeySets.get(provider)
  if (!ks) {
    ks = createRemoteJWKSet(new URL(ENDPOINTS[provider].jwks))
    remoteKeySets.set(provider, ks)
  }
  return ks
}

const MICROSOFT_ISSUER = /^https:\/\/login\.microsoftonline\.com\/([0-9a-f-]{36})\/v2\.0$/

/**
 * Exchanges the authorization code and returns the verified identity.
 * Throws AppError(401) for anything that does not check out.
 */
export async function completeAuthorization(
  provider: SsoProvider,
  code: string,
  codeVerifier: string,
  expectedNonce: string,
): Promise<SsoIdentity> {
  const { clientId, clientSecret } = requireCredentials(provider)
  const res = await fetch(ENDPOINTS[provider].token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(provider),
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: codeVerifier,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  const body = (await res.json().catch(() => null)) as { id_token?: unknown } | null
  if (!res.ok || typeof body?.id_token !== "string") throw new AppError(401, "sso_token_exchange_failed")
  const idToken = body.id_token

  let payload: JWTPayload
  try {
    if (provider === "google") {
      ({ payload } = await jwtVerify(idToken, keySet(provider), { audience: clientId, issuer: GOOGLE_ISSUERS, algorithms: ["RS256"] }))
    } else {
      // Multi-tenant: the issuer names the tenant, so it is checked against the
      // token's own tid rather than a fixed value (Microsoft's guidance).
      const tid = decodeJwt(idToken).tid
      if (typeof tid !== "string") throw new Error("no tid")
      ;({ payload } = await jwtVerify(idToken, keySet(provider), {
        audience: clientId,
        issuer: `https://login.microsoftonline.com/${tid}/v2.0`,
        algorithms: ["RS256"],
      }))
      if (!MICROSOFT_ISSUER.test(String(payload.iss))) throw new Error("bad issuer")
    }
  } catch {
    throw new AppError(401, "sso_invalid_token")
  }
  if (payload.nonce !== expectedNonce) throw new AppError(401, "sso_invalid_token")

  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
  if (provider === "google") {
    const email = str(payload.email)
    if (!email || payload.email_verified !== true) throw new AppError(401, "sso_email_unverified")
    return {
      provider, email: email.toLowerCase(), name: str(payload.name), subject: String(payload.sub),
      hostedDomain: str(payload.hd)?.toLowerCase() ?? null, tenantId: null,
    }
  }
  const email = str(payload.email) ?? str(payload.preferred_username)
  if (!email || !email.includes("@")) throw new AppError(401, "sso_no_email")
  return {
    provider, email: email.toLowerCase(), name: str(payload.name), subject: String(payload.oid ?? payload.sub),
    hostedDomain: null, tenantId: str(payload.tid),
  }
}
