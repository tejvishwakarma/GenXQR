import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto"
import { z } from "zod"
import { prisma } from "../db/prisma.js"
import { redis } from "../redis/client.js"
import { env } from "../config/env.js"
import { AppError } from "../middleware/error.middleware.js"
import { verifyPassword } from "../utils/password.js"
import { matchTotp, newTotpSecret, otpauthUrl } from "../utils/totp.util.js"

/**
 * Two-factor sign-in (built 7 Nov 2026): a code from an authenticator app
 * (TOTP) after the password, or after Google sign-in. SSO sign-ins skip it —
 * the company's identity provider runs its own second factor.
 *
 * - The secret is stored AES-256-GCM encrypted under a key derived from
 *   JWT_ACCESS_SECRET. Rotating that secret makes every stored secret
 *   unreadable: those users then sign in with a recovery code, or a
 *   SUPER_ADMIN resets their two-factor.
 * - A code is accepted once (twoFactorLastStep), and 10 one-time recovery
 *   codes stand in for a lost phone (stored as sha256).
 * - Sign-in: the password step returns a CHALLENGE (Redis, 5 minutes, 5
 *   attempts) instead of a session; the code is redeemed against it.
 */

const RECOVERY_CODE_COUNT = 10
const CHALLENGE_TTL_SECONDS = 300
const CHALLENGE_MAX_ATTEMPTS = 5
const SETUP_TTL_SECONDS = 900
/** Wrong codes per account per 15 minutes, across settings actions (a stolen session guessing). */
const USER_FAILS_PER_WINDOW = 10

export const codeSchema = z.object({ code: z.string().trim().min(6).max(20) })
export const disableSchema = codeSchema.extend({ password: z.string().max(200).optional() })
export const verifyChallengeSchema = codeSchema.extend({ challenge: z.string().min(20).max(100) })

// ─── Secret encryption ────────────────────────────────────────────────────────

const key = (): Buffer => Buffer.from(hkdfSync("sha256", env.JWT_ACCESS_SECRET, "genxqr", "two-factor-secret-v1", 32))

export function encryptSecret(secret: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const ct = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()])
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64")}`
}

function decryptSecret(stored: string): string | null {
  try {
    const raw = Buffer.from(stored.replace(/^v1:/, ""), "base64")
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12))
    decipher.setAuthTag(raw.subarray(12, 28))
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8")
  } catch {
    return null // the key changed (JWT_ACCESS_SECRET rotated): only recovery codes work now
  }
}

// ─── Recovery codes ───────────────────────────────────────────────────────────

const normaliseRecovery = (code: string) => code.toLowerCase().replace(/[^a-z0-9]/g, "")
const hashRecovery = (code: string) => createHash("sha256").update(normaliseRecovery(code)).digest("hex")

/** Ten codes like "k7mq-2xpd", 40 random bits each. */
function newRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const s = randomBytes(5).toString("hex")
    return `${s.slice(0, 5)}-${s.slice(5)}`
  })
}

// ─── Checking a code ──────────────────────────────────────────────────────────

/**
 * True if `code` is the account's current authenticator code (not used before)
 * or one of its unused recovery codes, which is then used up. Both consume
 * atomically, so two requests with one code cannot both pass.
 */
async function consumeCode(userId: string, code: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorSecret: true, twoFactorEnabledAt: true, twoFactorRecoveryHashes: true },
  })
  if (!user?.twoFactorEnabledAt || !user.twoFactorSecret) return false

  const digits = code.replace(/\s/g, "")
  const secret = decryptSecret(user.twoFactorSecret)
  const step = secret ? matchTotp(secret, digits) : null
  if (step !== null) {
    const taken = await prisma.user.updateMany({
      where: { id: userId, OR: [{ twoFactorLastStep: null }, { twoFactorLastStep: { lt: step } }] },
      data: { twoFactorLastStep: step },
    })
    return taken.count === 1
  }

  const hash = hashRecovery(code)
  if (!user.twoFactorRecoveryHashes.includes(hash)) return false
  const used = await prisma.user.updateMany({
    where: { id: userId, twoFactorRecoveryHashes: { has: hash } },
    data: { twoFactorRecoveryHashes: user.twoFactorRecoveryHashes.filter((h) => h !== hash) },
  })
  return used.count === 1
}

/** consumeCode for settings actions, with a per-account limit on wrong codes. */
async function requireCode(userId: string, code: string): Promise<void> {
  const failKey = `2fa:fail:${userId}`
  if (Number(await redis.get(failKey)) >= USER_FAILS_PER_WINDOW) {
    throw new AppError(429, "Too many wrong codes. Try again in 15 minutes.")
  }
  if (!(await consumeCode(userId, code))) {
    await redis.multi().incr(failKey).expire(failKey, 900).exec()
    throw new AppError(422, "That code isn't right. Use the current code from your authenticator app, or a recovery code.")
  }
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getStatus(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabledAt: true, twoFactorRecoveryHashes: true, passwordHash: true },
  })
  return {
    // Turning it off asks for the password only when there is one (not for Google-only accounts).
    hasPassword: !!user?.passwordHash,
    enabled: !!user?.twoFactorEnabledAt,
    enabledAt: user?.twoFactorEnabledAt ?? null,
    recoveryCodesLeft: user?.twoFactorEnabledAt ? user.twoFactorRecoveryHashes.length : 0,
  }
}

/** Step 1: a new secret to scan, held for 15 minutes until confirmed with a code. */
export async function startSetup(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, twoFactorEnabledAt: true } })
  if (!user) throw new AppError(404, "User not found")
  if (user.twoFactorEnabledAt) throw new AppError(409, "Two-factor sign-in is already on.")
  const secret = newTotpSecret()
  await redis.setex(`2fa:setup:${userId}`, SETUP_TTL_SECONDS, encryptSecret(secret))
  return { secret, otpauthUrl: otpauthUrl(secret, user.email) }
}

/** Step 2: the first code proves the app has the secret; returns the recovery codes, shown once. */
export async function confirmSetup(userId: string, code: string) {
  const pending = await redis.get(`2fa:setup:${userId}`)
  const secret = pending ? decryptSecret(pending) : null
  if (!secret) throw new AppError(410, "Setup timed out. Start again.")
  const step = matchTotp(secret, code.replace(/\s/g, ""))
  if (step === null) throw new AppError(422, "That code isn't right. Check the time on your phone is set automatically, and use the newest code.")

  const codes = newRecoveryCodes()
  const done = await prisma.user.updateMany({
    where: { id: userId, twoFactorEnabledAt: null },
    data: {
      twoFactorSecret: encryptSecret(secret),
      twoFactorEnabledAt: new Date(),
      twoFactorLastStep: step,
      twoFactorRecoveryHashes: codes.map(hashRecovery),
    },
  })
  if (done.count !== 1) throw new AppError(409, "Two-factor sign-in is already on.")
  await redis.del(`2fa:setup:${userId}`)
  return { recoveryCodes: codes }
}

/** Needs a current code (or recovery code), and the password if the account has one. */
export async function disable(userId: string, input: z.infer<typeof disableSchema>) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true, twoFactorEnabledAt: true } })
  if (!user?.twoFactorEnabledAt) throw new AppError(409, "Two-factor sign-in is not on.")
  if (user.passwordHash && !(input.password && (await verifyPassword(input.password, user.passwordHash)))) {
    throw new AppError(422, "Your password isn't right.")
  }
  await requireCode(userId, input.code)
  await clearTwoFactor(userId)
}

export async function regenerateRecoveryCodes(userId: string, code: string) {
  await requireCode(userId, code)
  const codes = newRecoveryCodes()
  await prisma.user.update({ where: { id: userId }, data: { twoFactorRecoveryHashes: codes.map(hashRecovery) } })
  return { recoveryCodes: codes }
}

/** Turns it off (the owner, or a SUPER_ADMIN for someone who lost their phone). */
export async function clearTwoFactor(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorSecret: null, twoFactorEnabledAt: null, twoFactorLastStep: null, twoFactorRecoveryHashes: [] },
  })
}

// ─── Sign-in challenge ────────────────────────────────────────────────────────

interface Challenge {
  userId: string
  method: "password" | "google"
  /** Google sign-in: where to go afterwards. */
  next?: string
}

/** Issued by a correct password / Google sign-in when the account has two-factor on. */
export async function createChallenge(userId: string, method: Challenge["method"], next?: string): Promise<string> {
  const id = randomBytes(24).toString("hex")
  const value: Challenge = { userId, method, ...(next && { next }) }
  await redis.setex(`2fa:challenge:${id}`, CHALLENGE_TTL_SECONDS, JSON.stringify(value))
  return id
}

/**
 * Redeems a challenge with a code. Wrong codes count against it; after five it
 * is gone and the sign-in starts again. Returns the account to start a session for.
 */
export async function redeemChallenge(challengeId: string, code: string): Promise<Challenge> {
  const key = `2fa:challenge:${challengeId}`
  const raw = await redis.get(key)
  if (!raw) throw new AppError(401, "This sign-in has expired. Sign in again.")
  const challenge = JSON.parse(raw) as Challenge

  if (!(await consumeCode(challenge.userId, code))) {
    // Counted atomically, so parallel guesses cannot exceed the limit.
    const [[, fails]] = (await redis.multi().incr(`${key}:fails`).expire(`${key}:fails`, CHALLENGE_TTL_SECONDS).exec()) as [[unknown, number]]
    if (fails >= CHALLENGE_MAX_ATTEMPTS) {
      await redis.del(key, `${key}:fails`)
      throw new AppError(401, "Too many wrong codes. Sign in again.")
    }
    throw new AppError(422, "That code isn't right. Use the current code from your authenticator app, or a recovery code.")
  }
  // Single use: a second request with the same challenge finds nothing.
  if ((await redis.del(key)) !== 1) throw new AppError(401, "This sign-in has expired. Sign in again.")
  await redis.del(`${key}:fails`)
  return challenge
}
