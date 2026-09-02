import { v4 as uuidv4 } from "uuid"
import { z } from "zod"
import { prisma } from "../db/prisma.js"
import { AppError } from "../middleware/error.middleware.js"
import { env } from "../config/env.js"
import { hashPassword, verifyPassword } from "../utils/password.js"
import { generateSecureToken, hashToken } from "../utils/crypto.js"
import { isDisposableEmail } from "../utils/disposable-email.util.js"
import { normalizeEmail } from "../utils/normalize-email.util.js"
// Reused so a number saved in settings is stored in exactly the form checkout
// expects — two normalisers would eventually disagree.
import { normalisePhone } from "./billing.service.js"
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt.js"
import {
  sendEmail,
  buildVerificationEmail,
  buildPasswordResetEmail,
  sendPasswordChangedEmail,
} from "./email.service.js"
import { logger } from "../logger/index.js"
import { redis } from "../redis/client.js"
import { createTrialSubscription } from "./billing.service.js"

// ─── Validation Schemas ────────────────────────────────────────────────────────

export const registerSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  email: z
    .string()
    .email()
    .transform((v) => v.toLowerCase().trim()),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128)
    .regex(/[A-Z]/, "Must contain at least one uppercase letter")
    .regex(/[a-z]/, "Must contain at least one lowercase letter")
    .regex(/[0-9]/, "Must contain at least one number"),
})

export const loginSchema = z.object({
  email: z
    .string()
    .email()
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, "Password is required"),
})

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .email()
    .transform((v) => v.toLowerCase().trim()),
})

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128)
    .regex(/[A-Z]/, "Must contain at least one uppercase letter")
    .regex(/[a-z]/, "Must contain at least one lowercase letter")
    .regex(/[0-9]/, "Must contain at least one number"),
})

export interface NotificationPrefs {
  scanMilestoneAlerts: boolean
  weeklyAnalyticsDigest: boolean
  billingReminders: boolean
  productUpdates: boolean
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildTokenPair(userId: string, email: string, role: "USER" | "ADMIN" | "SUPER_ADMIN" = "USER") {
  const accessToken = signAccessToken({ sub: userId, email, role })
  const jti = uuidv4()
  const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000)
  return { accessToken, jti, refreshExpiresAt }
}

async function persistRefreshToken(
  userId: string,
  jti: string,
  expiresAt: Date,
): Promise<string> {
  const refreshToken = signRefreshToken({ sub: userId, jti })
  await prisma.refreshToken.create({
    data: {
      id: jti,
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt,
    },
  })
  return refreshToken
}

async function ensureVerifiedTrialSubscription(userId: string): Promise<void> {
  const existing = await prisma.subscription.findUnique({
    where: { userId },
    select: { id: true }
  })

  if (existing) return

  await createTrialSubscription(userId)
}

// ─── Auth Service ─────────────────────────────────────────────────────────────

/**
 * Register a new user with email + password.
 * Sends a verification email (non-blocking — registration succeeds even if email fails).
 */
export async function registerUser(input: z.infer<typeof registerSchema>) {
  if (isDisposableEmail(input.email)) {
    throw new AppError(400, "Temporary or disposable email addresses are not allowed. Please use a real email address.")
  }

  const emailBlockEntry = await prisma.blocklist.findFirst({
    where: { type: "email", value: input.email },
    select: { isActive: true, isPermanent: true }
  })

  if (emailBlockEntry?.isPermanent) {
    throw new AppError(403, "account_permanently_banned")
  }
  if (emailBlockEntry?.isActive) {
    throw new AppError(403, "account_deleted")
  }
  const wasEverBlocked = !!emailBlockEntry

  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true }
  })

  if (existing) {
    throw new AppError(409, "An account with this email already exists")
  }

  const passwordHash = await hashPassword(input.password)

  const hasEmailTransport = !!(env.RESEND_API_KEY || env.SMTP_HOST)
  const autoVerify = !hasEmailTransport

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      // Canonical inbox, used only to decide trial eligibility so one person
      // cannot mint unlimited trials with +tag or dotted-Gmail aliases.
      normalizedEmail: normalizeEmail(input.email),
      passwordHash,
      emailVerified: autoVerify,
    },
    select: { id: true, email: true, name: true }
  })

  if (!autoVerify) {
    const rawToken = generateSecureToken()
    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
      },
    })

    const verifyUrl = `${env.FRONTEND_URL}/verify-email?token=${rawToken}`
    sendEmail({
      to: user.email,
      subject: "Verify your GenXQR email address",
      html: buildVerificationEmail(user.name, verifyUrl),
    }).catch(() => {})
  }

  if (autoVerify && !wasEverBlocked) {
    ensureVerifiedTrialSubscription(user.id).catch(() => {})
  }

  return user
}

/**
 * Login with email + password. Returns access token + httpOnly refresh token string.
 */
export async function loginUser(
  input: z.infer<typeof loginSchema>,
  ip: string,
): Promise<{ accessToken: string; refreshToken: string; user: { id: string; email: string; name: string; role: "USER" | "ADMIN" | "SUPER_ADMIN"; avatarUrl: string | null } }> {
  const user = await prisma.user.findUnique({
    where: { email: input.email }
  })

  const dummyHash = "$2b$12$invalidhashinvalidhas.validhashvalidhashvalidhashval."
  const passwordValid = await verifyPassword(
    input.password,
    user?.passwordHash ?? dummyHash,
  )

  if (!user || !user.passwordHash || !passwordValid) {
    throw new AppError(401, "Invalid email or password")
  }

  if (!user.emailVerified) {
    throw new AppError(403, "Please verify your email before signing in")
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() }
  })

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "auth.login",
      category: "auth",
      ip
    }
  })

  const { accessToken, jti, refreshExpiresAt } = buildTokenPair(user.id, user.email, user.role)
  const refreshToken = await persistRefreshToken(user.id, jti, refreshExpiresAt)

  return { accessToken, refreshToken, user: { id: user.id, email: user.email, name: user.name, role: user.role, avatarUrl: user.avatarUrl ?? null } }
}

/**
 * Rotate refresh token pair (silent re-auth).
 */
export async function refreshTokens(
  rawRefreshToken: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  let payload: { sub: string; jti: string }
  try {
    payload = verifyRefreshToken(rawRefreshToken)
  } catch {
    throw new AppError(401, "Invalid or expired refresh token")
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { id: payload.jti }
  })

  if (!stored || stored.revokedAt !== null || stored.expiresAt < new Date()) {
    throw new AppError(401, "Refresh token is revoked or expired")
  }

  if (stored.tokenHash !== hashToken(rawRefreshToken)) {
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() }
    })
    throw new AppError(401, "Refresh token mismatch — all sessions revoked")
  }

  await prisma.refreshToken.update({
    where: { id: payload.jti },
    data: { revokedAt: new Date() }
  })

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, role: true }
  })

  if (!user) throw new AppError(401, "User not found")

  const { accessToken, jti, refreshExpiresAt } = buildTokenPair(user.id, user.email, user.role)
  const refreshToken = await persistRefreshToken(user.id, jti, refreshExpiresAt)

  return { accessToken, refreshToken }
}

/**
 * Logout: revoke the provided refresh token.
 */
export async function logoutUser(rawRefreshToken: string): Promise<void> {
  try {
    const payload = verifyRefreshToken(rawRefreshToken)
    await prisma.refreshToken.updateMany({
      where: { id: payload.jti, revokedAt: null },
      data: { revokedAt: new Date() }
    })
  } catch {
    // Silently ignore — logout should always succeed from the client's perspective
  }
}

/**
 * Initiate password reset flow.
 * Always returns success to prevent email enumeration.
 */
export async function forgotPassword(input: z.infer<typeof forgotPasswordSchema>): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, email: true, name: true }
  })

  if (!user) return

  // Expire existing tokens
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { expiresAt: new Date(0) }
  })

  const rawToken = generateSecureToken()
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1_000), // 1h
    }
  })

  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${rawToken}`
  await sendEmail({
    to: user.email,
    subject: "Reset your GenXQR password",
    html: buildPasswordResetEmail(user.name, resetUrl),
  })
}

/**
 * Reset password using a valid reset token.
 */
export async function resetPassword(input: z.infer<typeof resetPasswordSchema>): Promise<void> {
  const record = await prisma.passwordResetToken.findFirst({
    where: {
      tokenHash: hashToken(input.token),
      usedAt: null,
      expiresAt: { gt: new Date() }
    }
  })

  if (!record) {
    throw new AppError(400, "Invalid or expired password reset link")
  }

  const passwordHash = await hashPassword(input.password)

  await prisma.$transaction(async (tx: any) => {
    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash }
    })
    await tx.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() }
    })
    await tx.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() }
    })
  })
}

/**
 * Verify email address using a verification token.
 */
export async function verifyEmail(rawToken: string): Promise<{ alreadyVerified?: boolean }> {
  const tokenHash = hashToken(rawToken)

  const record = await prisma.emailVerificationToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() }
    }
  })

  if (!record) {
    // Check if already verified
    const usedRecord = await prisma.emailVerificationToken.findFirst({
      where: { tokenHash },
      select: { userId: true }
    })

    if (usedRecord) {
      const existingUser = await prisma.user.findUnique({
        where: { id: usedRecord.userId },
        select: { emailVerified: true }
      })
      if (existingUser?.emailVerified) {
        return { alreadyVerified: true }
      }
    }
    throw new AppError(400, "Invalid or expired verification link")
  }

  await prisma.$transaction(async (tx: any) => {
    await tx.user.update({
      where: { id: record.userId },
      data: { emailVerified: true }
    })
    await tx.emailVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() }
    })
  })

  await ensureVerifiedTrialSubscription(record.userId)

  return {}
}

/**
 * Resend email verification link.
 */
export async function resendVerificationEmail(email: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: { id: true, name: true, email: true, emailVerified: true }
  })

  if (!user || user.emailVerified) return

  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1_000)
  const recentToken = await prisma.emailVerificationToken.findFirst({
    where: {
      userId: user.id,
      usedAt: null,
      createdAt: { gt: twoMinutesAgo }
    },
    select: { id: true }
  })

  if (recentToken) return

  await prisma.emailVerificationToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { expiresAt: new Date(0) }
  })

  const rawToken = generateSecureToken()
  await prisma.emailVerificationToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
    }
  })

  const verifyUrl = `${env.FRONTEND_URL}/verify-email?token=${rawToken}`
  sendEmail({
    to: user.email,
    subject: "Verify your GenXQR email address",
    html: buildVerificationEmail(user.name, verifyUrl),
  }).catch(() => {})
}

/**
 * Handle Google OAuth callback: create or link user account.
 */
export async function handleGoogleOAuth(
  profile: { id: string; email: string; name: string; avatarUrl?: string },
  ip: string,
): Promise<{ accessToken: string; refreshToken: string; user: { id: string; email: string; name: string; role: "USER" | "ADMIN" | "SUPER_ADMIN"; avatarUrl: string | null } }> {
  const emailBlockEntry = await prisma.blocklist.findFirst({
    where: { type: "email", value: profile.email },
    select: { isActive: true, isPermanent: true }
  })

  if (emailBlockEntry?.isPermanent) {
    throw new AppError(403, "account_permanently_banned")
  }
  if (emailBlockEntry?.isActive) {
    throw new AppError(403, "account_deleted")
  }
  const wasEverBlocked = !!emailBlockEntry

  let createdUser = false
  let user = await prisma.user.findFirst({
    where: {
      OR: [
        { googleId: profile.id },
        { email: profile.email }
      ]
    }
  })

  if (!user) {
    createdUser = true
    user = await prisma.user.create({
      data: {
        googleId: profile.id,
        email: profile.email,
        normalizedEmail: normalizeEmail(profile.email),
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        emailVerified: true,
      }
    })
  } else if (!user.googleId) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        googleId: profile.id,
        avatarUrl: profile.avatarUrl ?? user.avatarUrl
      }
    })
  }

  if (createdUser && !wasEverBlocked) {
    await ensureVerifiedTrialSubscription(user.id)
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() }
  })
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "auth.login.google",
      category: "auth",
      ip
    }
  })

  const { accessToken, jti, refreshExpiresAt } = buildTokenPair(user.id, user.email, user.role)
  const refreshToken = await persistRefreshToken(user.id, jti, refreshExpiresAt)

  return { accessToken, refreshToken, user: { id: user.id, email: user.email, name: user.name, role: user.role, avatarUrl: user.avatarUrl ?? null } }
}

/**
 * Permanently delete a user account and all associated data.
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128)
    .regex(/[A-Z]/, "Must contain at least one uppercase letter")
    .regex(/[a-z]/, "Must contain at least one lowercase letter")
    .regex(/[0-9]/, "Must contain at least one number"),
})

/**
 * Change the password of the signed-in user, having re-verified the current one.
 *
 * Until now there was no way to do this. The Settings page showed a Change
 * Password form that was never wired to anything, and no endpoint existed — the
 * only routes to a new password were the emailed reset flow and an admin forcing
 * one. So a user who suspected their password was compromised could not simply
 * rotate it; they had to go through a password-reset email, which is a strange
 * thing to need while already signed in.
 *
 * Every existing refresh token is revoked, then a fresh pair is issued for the
 * caller. That combination is the point: if the reason for the change is that
 * somebody else has the old password, leaving their session alive defeats the
 * exercise — but signing the legitimate user out of the tab they just used to
 * change it reads as a failure. So other sessions end and this one continues.
 */
export async function changePassword(
  userId: string,
  input: z.infer<typeof changePasswordSchema>,
): Promise<{ accessToken: string; refreshToken: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, passwordHash: true },
  })
  if (!user) throw new AppError(404, "Account not found")

  // Google sign-in accounts have no password to change. Say so plainly rather
  // than reporting the current password as wrong, which is what a bare
  // verifyPassword against null would amount to.
  if (!user.passwordHash) {
    throw new AppError(
      400,
      "This account signs in with Google and has no password. Use \"Forgot password\" to set one.",
    )
  }

  const valid = await verifyPassword(input.currentPassword, user.passwordHash)
  if (!valid) throw new AppError(403, "Current password is incorrect")

  // Refuse a no-op. It would otherwise revoke every other session and send a
  // "your password changed" email for a password that did not change.
  if (await verifyPassword(input.newPassword, user.passwordHash)) {
    throw new AppError(422, "New password must be different from your current password")
  }

  const passwordHash = await hashPassword(input.newPassword)

  await prisma.$transaction(async (tx: any) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash } })
    await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  })

  const { accessToken, jti, refreshExpiresAt } = buildTokenPair(user.id, user.email, user.role)
  const refreshToken = await persistRefreshToken(user.id, jti, refreshExpiresAt)

  // Fire-and-forget: the password IS changed by this point, so a mail outage must
  // not surface as a failed change and tempt the user into trying again.
  void sendPasswordChangedEmail(user.email, user.name).catch((err: unknown) => {
    logger.error("Failed to send password-changed notification", {
      userId, error: String(err),
    })
  })

  return { accessToken, refreshToken }
}

/**
 * A single-use, short-lived grant that a fresh Google re-authentication mints,
 * proving an OAuth-only user re-controlled their Google account moments ago.
 */
const DELETE_GRANT_TTL_SECONDS = 5 * 60
const deleteGrantKey = (userId: string) => `reauth:delete:${userId}`

/** Called by the reauth callback after it confirms the Google identity matches. */
export async function grantDeleteReauth(userId: string): Promise<void> {
  await redis.setex(deleteGrantKey(userId), DELETE_GRANT_TTL_SECONDS, "1")
}

/**
 * Permanently delete the caller's account. Requires FRESH proof, not just a
 * valid session (finding #4):
 *
 *  - password accounts confirm their password (as before);
 *  - OAuth-only accounts (no passwordHash) must present a delete grant minted by
 *    a fresh Google re-authentication — previously the password check was
 *    skipped entirely for them, so any non-empty string authorised deletion.
 *
 * A missing grant throws a 403 with the code "reauth_required" so the client can
 * start the Google re-auth redirect.
 */
export async function deleteAccount(userId: string, password?: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new AppError(404, "Account not found")

  if (user.passwordHash) {
    const valid = password ? await verifyPassword(password, user.passwordHash) : false
    if (!valid) throw new AppError(403, "Incorrect password")
  } else {
    // OAuth-only: consume the single-use delete grant.
    const consumed = await redis.del(deleteGrantKey(userId))
    if (consumed === 0) {
      throw new AppError(403, "reauth_required")
    }
  }

  await prisma.user.delete({ where: { id: userId } })
}

export async function findUserById(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, notificationPrefs: true }
  })
  return user ?? null
}

export async function getSessionUserById(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    // `phone` is included so the billing page knows whether to ask for one
    // before checkout, rather than sending Cashfree a placeholder.
    select: { id: true, email: true, name: true, role: true, avatarUrl: true, phone: true }
  })
  return user ?? null
}

export async function updateUserAvatar(userId: string, avatarUrl: string | null): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl }
  })
}

export async function updateNotificationPrefs(userId: string, prefs: NotificationPrefs): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { notificationPrefs: JSON.stringify(prefs) }
  })
}

/** Fields a user may change about themselves from the settings page. */
export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, "Name cannot be empty").max(100).optional(),
  /**
   * Accepts what a person actually types — spaces, +91, a leading 0 — and stores
   * the bare 10 digits Cashfree requires. `null` clears it.
   *
   * Email is deliberately NOT updatable here. Changing it would need
   * re-verification and a uniqueness check, and it is also the key the trial
   * eligibility rule is built on, so it is a separate flow rather than a field
   * on this form.
   */
  phone: z.string().trim().max(20).nullable().optional(),
})

export async function updateProfile(
  userId: string,
  input: z.infer<typeof updateProfileSchema>,
): Promise<{ id: string; name: string; email: string; phone: string | null; avatarUrl: string | null }> {
  const data: { name?: string; phone?: string | null } = {}

  if (input.name !== undefined) data.name = input.name

  if (input.phone !== undefined) {
    if (input.phone === null || input.phone === "") {
      data.phone = null
    } else {
      // Same normalisation the checkout uses, so a number saved here is
      // immediately usable for a payment and cannot differ in format.
      const normalised = normalisePhone(input.phone)
      if (!normalised) {
        // 422 to match how error.middleware maps every other validation failure
        // (Zod errors), rather than inventing a second status for the same class.
        throw new AppError(422, "Enter a valid 10-digit Indian mobile number.")
      }
      data.phone = normalised
    }
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, name: true, email: true, phone: true, avatarUrl: true },
  })
  return user
}
