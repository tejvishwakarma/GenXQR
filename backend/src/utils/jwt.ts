import jwt from "jsonwebtoken"
import { env } from "../config/env.js"

export interface AccessTokenPayload {
  /** User ID */
  sub: string
  email: string
  role: "USER" | "ADMIN" | "SUPER_ADMIN"
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
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: [JWT_ALGORITHM] }) as AccessTokenPayload
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: [JWT_ALGORITHM] }) as RefreshTokenPayload
}

/**
 * Signs a short-lived, tamper-proof OAuth `state` value binding the flow to the
 * user who initiated it. Prevents an attacker from forging a state for another
 * user's account (CSRF / account-linking) since only the server holds the secret.
 */
export function signOAuthState(userId: string): string {
  return jwt.sign({ sub: userId, purpose: "gdrive_oauth" }, env.JWT_ACCESS_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: "10m",
  })
}

export function verifyOAuthState(state: string): OAuthStatePayload {
  const decoded = jwt.verify(state, env.JWT_ACCESS_SECRET, { algorithms: [JWT_ALGORITHM] }) as OAuthStatePayload
  if (decoded.purpose !== "gdrive_oauth") {
    throw new Error("Invalid OAuth state purpose")
  }
  return decoded
}
