import { createHash, randomBytes } from "node:crypto"

/**
 * Generate a cryptographically secure random hex token.
 * Default byteLength=32 produces a 64-char hex string.
 */
export function generateSecureToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("hex")
}

/**
 * One-way SHA-256 hash of a token for safe storage.
 * Never store raw tokens — always store the hash.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}
