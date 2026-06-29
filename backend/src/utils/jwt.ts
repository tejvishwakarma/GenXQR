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

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  })
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  })
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload
}
