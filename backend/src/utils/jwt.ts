import { createHmac } from "node:crypto"
import jwt from "jsonwebtoken"
import { env } from "../config/env.js"

export interface AccessTokenPayload {
  /** User ID */
  sub: string
  email: string
  role: "USER" | "ADMIN" | "SUPER_ADMIN"
  /** Impersonation: the admin acting as this user (admin-users impersonateUser). */
  act?: string
}

export interface RefreshTokenPayload {
  /** User ID */
  sub: string
  /** Unique token ID (maps to RefreshToken.id in DB) */
  jti: string
}

// All tokens are signed and verified with a fixed symmetric algorithm. Pinning
// the algorithm on verify rejects a token whose header advertises a different
// alg (including "none"), closing algorithm-confusion attacks.
const JWT_ALGORITHM: jwt.Algorithm = "HS256"

export interface OAuthStatePayload {
  /** User ID the OAuth flow is bound to */
  sub: string
  /** Discriminator so a state token cannot be reused for a different flow */
  purpose: "gdrive_oauth"
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  })
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  })
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: [JWT_ALGORITHM] }) as Partial<AccessTokenPayload> & { purpose?: unknown }
  // Only a token minted by signAccessToken carries all three claims. Anything
  // else signed with this secret — or any future token type — is not a login.
  if (
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    !["USER", "ADMIN", "SUPER_ADMIN"].includes(payload.role as string) ||
    payload.purpose !== undefined ||
    (payload.act !== undefined && typeof payload.act !== "string")
  ) {
    throw new jwt.JsonWebTokenError("not an access token")
  }
  return payload as AccessTokenPayload
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: [JWT_ALGORITHM] }) as RefreshTokenPayload
}

/**
 * Signs a short-lived, tamper-proof OAuth `state` value binding the flow to the
 * user who initiated it. Prevents an attacker from forging a state for another
 * user's account (CSRF / account-linking) since only the server holds the secret.
 */
/**
 * The state's own key, derived from the access secret. The state used to be
 * signed with the access secret itself and carries `sub`, so requireAuth
 * accepted it as a 10-minute login token — and it travels in URLs (Google's
 * consent page, our callback), i.e. browser history and access logs.
 */
function oauthStateKey(): string {
  return createHmac("sha256", env.JWT_ACCESS_SECRET).update("genxqr:gdrive-oauth-state").digest("hex")
}

export function signOAuthState(userId: string): string {
  return jwt.sign({ sub: userId, purpose: "gdrive_oauth" }, oauthStateKey(), {
    algorithm: JWT_ALGORITHM,
    expiresIn: "10m",
  })
}

export function verifyOAuthState(state: string): OAuthStatePayload {
  const decoded = jwt.verify(state, oauthStateKey(), { algorithms: [JWT_ALGORITHM] }) as OAuthStatePayload
  if (decoded.purpose !== "gdrive_oauth") {
    throw new Error("Invalid OAuth state purpose")
  }
  return decoded
}

// ─── QR unlock (password-protected landing pages) ─────────────────────────────

const QR_UNLOCK_PURPOSE = "qr_unlock"

/** Own key, derived from the access secret, so an unlock token is never a login token. */
function qrUnlockKey(): string {
  return createHmac("sha256", env.JWT_ACCESS_SECRET).update("genxqr:qr-unlock").digest("hex")
}

/**
 * Proof, for 10 minutes, that this visitor entered a code's password. Landing-
 * page codes (PDF, vCard, menu, WiFi…) have no destination to redirect to, so
 * after the password the visitor goes to /l/<slug>?access=<token>, and the
 * content endpoint accepts the token in place of the password. Bound to the slug.
 */
export function signQRUnlock(slug: string): string {
  return jwt.sign({ slug, purpose: QR_UNLOCK_PURPOSE }, qrUnlockKey(), { algorithm: JWT_ALGORITHM, expiresIn: "10m" })
}

export function verifyQRUnlock(token: string, slug: string): boolean {
  try {
    const p = jwt.verify(token, qrUnlockKey(), { algorithms: [JWT_ALGORITHM] }) as { slug?: unknown; purpose?: unknown }
    return p.purpose === QR_UNLOCK_PURPOSE && p.slug === slug
  } catch {
    return false
  }
}
