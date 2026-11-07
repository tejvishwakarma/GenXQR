import { createHmac, randomBytes } from "node:crypto"

/**
 * Time-based one-time passwords (RFC 6238, the authenticator-app standard):
 * HMAC-SHA1, 6 digits, 30-second steps. Small enough to own rather than add a
 * dependency for.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
export const TOTP_STEP_SECONDS = 30

/** RFC 4648 base32, no padding — how authenticator apps take the secret. */
export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ""
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, "")
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch)
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/** A new 160-bit secret, base32. */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

export function timeStep(at = Date.now()): number {
  return Math.floor(at / 1000 / TOTP_STEP_SECONDS)
}

/** The 6-digit code for one time step. */
export function totpAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const mac = createHmac("sha1", base32Decode(secret)).update(counter).digest()
  const offset = mac[mac.length - 1]! & 0x0f
  const n = (mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
  return n.toString().padStart(6, "0")
}

/**
 * The time step a code matches — the current one or one either side, for clock
 * drift — or null. The caller refuses a step already used (replay).
 */
export function matchTotp(secret: string, code: string, at = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null
  const now = timeStep(at)
  for (const step of [now, now - 1, now + 1]) {
    if (totpAt(secret, step) === code) return step
  }
  return null
}

/** The otpauth:// link an authenticator app reads from the setup QR code. */
export function otpauthUrl(secret: string, account: string, issuer = "GenXQR"): string {
  const label = encodeURIComponent(`${issuer}:${account}`)
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${TOTP_STEP_SECONDS}`
}
