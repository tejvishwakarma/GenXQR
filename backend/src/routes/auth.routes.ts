import path from "path"
import fs from "fs"
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import { z } from "zod"
import passport from "passport"
import { Strategy as GoogleStrategy, type Profile } from "passport-google-oauth20"
import { randomBytes } from "node:crypto"
import multer, { type FileFilterCallback } from "multer"
import { env } from "../config/env.js"
import { logger } from "../logger/index.js"
import { AppError } from "../middleware/error.middleware.js"
import { authLimiter } from "../middleware/rateLimit.middleware.js"
import { requireAuth } from "../middleware/auth.middleware.js"
import * as AuthService from "../services/auth.service.js"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { redis } from "../redis/client.js"
import { logAudit } from "../services/audit.service.js"

// ─── Google OAuth Strategy (registered only when credentials are provided) ────

if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_CALLBACK_URL) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: env.GOOGLE_CALLBACK_URL,
      },
      (_accessToken: string, _refreshToken: string, profile: Profile, done) => {
        const email = profile.emails?.[0]?.value
        if (!email) {
          done(new Error("Google did not return an email address"))
          return
        }
        done(null, {
          id: profile.id,
          email,
          name: profile.displayName ?? email,
          avatarUrl: profile.photos?.[0]?.value,
        })
      },
    ),
  )
}

// ─── Refresh token cookie helpers ─────────────────────────────────────────────

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: 30 * 24 * 60 * 60 * 1_000, // 30 days
  path: "/api/auth",
}

// ─── Router ───────────────────────────────────────────────────────────────────

const router: IRouter = Router()

const NotificationPrefsSchema = z.object({
  scanMilestoneAlerts: z.boolean(),
  weeklyAnalyticsDigest: z.boolean(),
  billingReminders: z.boolean(),
  productUpdates: z.boolean(),
})

const DEFAULT_NOTIFICATION_PREFS = {
  scanMilestoneAlerts: true,
  weeklyAnalyticsDigest: true,
  billingReminders: true,
  productUpdates: true,
} satisfies z.infer<typeof NotificationPrefsSchema>

function safeFrontendPath(input: unknown, fallback = "/app/dashboard"): string {
  if (typeof input !== "string" || !input.startsWith("/") || input.startsWith("//")) {
    return fallback
  }
  return input
}

/**
 * POST /api/auth/register
 */
router.post(
  "/register",
  authLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = AuthService.registerSchema.parse(req.body)
      const user = await AuthService.registerUser(input)
      logAudit({ userId: user.id, action: "auth.register", category: "auth", entityId: user.id, entityType: "User", metadata: { email: user.email }, ip: req.ip, userAgent: req.headers["user-agent"] })
      res.status(201).json({
        success: true,
        message: "Account created. Please check your email to verify your address.",
        data: user,
      })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * POST /api/auth/login
 */
router.post(
  "/login",
  authLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = AuthService.loginSchema.parse(req.body)
      const { accessToken, refreshToken, user } = await AuthService.loginUser(
        input,
        req.ip ?? "",
      )
      logAudit({ userId: user.id, action: "auth.login", category: "auth", entityId: user.id, entityType: "User", ip: req.ip, userAgent: req.headers["user-agent"] })
      res
        .cookie("refresh_token", refreshToken, REFRESH_COOKIE_OPTIONS)
        .json({ success: true, data: { accessToken, user } })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * POST /api/auth/refresh
 */
router.post(
  "/refresh",
  authLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawToken = (req.cookies as Record<string, string | undefined>)["refresh_token"]
      if (!rawToken) throw new AppError(401, "No refresh token provided")

      const { accessToken, refreshToken } = await AuthService.refreshTokens(rawToken)
      res
        .cookie("refresh_token", refreshToken, REFRESH_COOKIE_OPTIONS)
        .json({ success: true, data: { accessToken } })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * POST /api/auth/logout
 */
router.post(
  "/logout",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawToken = (req.cookies as Record<string, string | undefined>)["refresh_token"]
      if (rawToken) {
        await AuthService.logoutUser(rawToken)
      }
      logAudit({ action: "auth.logout", category: "auth", ip: req.ip, userAgent: req.headers["user-agent"] })
      res
        .clearCookie("refresh_token", { path: "/api/auth" })
        .json({ success: true, message: "Logged out successfully" })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * POST /api/auth/forgot-password
 */
router.post(
  "/forgot-password",
  authLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = AuthService.forgotPasswordSchema.parse(req.body)
      await AuthService.forgotPassword(input)
      // Always return success to prevent email enumeration
      res.json({
        success: true,
        message: "If that email exists, a reset link has been sent.",
      })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * POST /api/auth/resend-verification
 * Resends the email verification link. Always returns success (anti-enumeration).
 */
router.post(
  "/resend-verification",
  authLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email } = z.object({ email: z.string().email() }).parse(req.body)
      await AuthService.resendVerificationEmail(email)
      res.json({ success: true, message: "If that account exists and is unverified, a new verification email has been sent." })
    } catch (err) {
      next(err)
    }
  },
)


/**
 * POST /api/auth/reset-password
 */
router.post(
  "/reset-password",
  authLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = AuthService.resetPasswordSchema.parse(req.body)
      await AuthService.resetPassword(input)
      logAudit({ action: "auth.password.reset", category: "auth", ip: req.ip, userAgent: req.headers["user-agent"] })
      res.json({ success: true, message: "Password updated. Please log in." })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * GET /api/auth/verify-email/:token
 */
router.get(
  "/verify-email/:token",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await AuthService.verifyEmail(req.params["token"] as string)
      const message = result.alreadyVerified
        ? "Your email is already verified. You can sign in."
        : "Email verified successfully. You can now sign in."
      res.json({ success: true, message })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * DELETE /api/auth/me
 * Permanently deletes the authenticated user's account and all their data.
 * Requires password confirmation in the request body.
 */
const DeleteAccountSchema = z.object({
  password: z.string().min(1, "Password is required for account deletion"),
})

router.delete(
  "/me",
  requireAuth,
  authLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = DeleteAccountSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ success: false, error: "Password is required to delete your account" })
        return
      }
      const deletedUserId = (req.user as unknown as AccessTokenPayload).sub
      await AuthService.deleteAccount(deletedUserId, parsed.data.password)
      logAudit({ userId: deletedUserId, action: "auth.account.delete", category: "auth", entityId: deletedUserId, entityType: "User", ip: req.ip, userAgent: req.headers["user-agent"] })
      // Clear the refresh token cookie
      res.clearCookie("refresh_token", { path: "/api/auth" })
      res.json({ success: true, message: "Your account has been permanently deleted." })
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  "/me",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req.user as unknown as AccessTokenPayload).sub
      const user = await AuthService.getSessionUserById(userId)

      if (!user) {
        res.status(404).json({ success: false, error: "User not found" })
        return
      }

      res.json({ success: true, data: user })
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  "/preferences",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req.user as unknown as AccessTokenPayload).sub
      const user = await AuthService.findUserById(userId)
      const parsed = NotificationPrefsSchema.safeParse(user?.notificationPrefs)

      res.json({
        success: true,
        data: {
          notifications: parsed.success ? parsed.data : DEFAULT_NOTIFICATION_PREFS,
        },
      })
    } catch (err) {
      next(err)
    }
  },
)

router.patch(
  "/preferences",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req.user as unknown as AccessTokenPayload).sub
      const { notifications } = z.object({ notifications: NotificationPrefsSchema }).parse(req.body)

      await AuthService.updateNotificationPrefs(userId, notifications)

      res.json({
        success: true,
        data: { notifications },
        message: "Notification preferences updated",
      })
    } catch (err) {
      next(err)
    }
  },
)

// ─── Avatar upload ────────────────────────────────────────────────────────────

const AVATAR_DIR = path.join(process.cwd(), "uploads", "avatars")
if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true })

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, AVATAR_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase()
      cb(null, `${Date.now()}${ext}`)
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"]
    const allowedExt = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"])
    const ext = path.extname(file.originalname).toLowerCase()
    if (!allowed.includes(file.mimetype) || !allowedExt.has(ext)) {
      cb(new AppError(415, "Only JPEG, PNG, WebP, or GIF images are allowed"))
      return
    }
    cb(null, true)
  },
})

// Wrap multer so its errors are converted to user-friendly AppErrors instead of generic 500s
function runAvatarUpload(req: Request, res: Response, next: NextFunction): void {
  avatarUpload.single("avatar")(req, res, (err: unknown) => {
    if (!err) { next(); return }
    if (err instanceof multer.MulterError) {
      const msg = err.code === "LIMIT_FILE_SIZE"
        ? "File too large. Maximum size is 2 MB."
        : `Upload error: ${err.message}`
      next(new AppError(413, msg))
    } else {
      next(err)
    }
  })
}

/**
 * PATCH /api/auth/me/avatar
 * Upload or replace the user's profile avatar.
 */
router.patch(
  "/me/avatar",
  requireAuth,
  runAvatarUpload,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) throw new AppError(400, "No image file uploaded")
      const userId = (req.user as unknown as AccessTokenPayload).sub
      const avatarUrl = `/uploads/avatars/${req.file.filename}`
      await AuthService.updateUserAvatar(userId, avatarUrl)
      res.json({ success: true, data: { avatarUrl } })
    } catch (err) {
      if (req.file) fs.unlink(req.file.path, () => undefined)
      next(err)
    }
  },
)

/**
 * DELETE /api/auth/me/avatar
 * Remove the user's profile avatar.
 */
router.delete(
  "/me/avatar",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req.user as unknown as AccessTokenPayload).sub
      const user = await AuthService.getSessionUserById(userId)
      if (user?.avatarUrl) {
        // Best-effort delete the old file from disk
        const diskPath = path.resolve(path.join(process.cwd(), user.avatarUrl))
        if (diskPath.startsWith(AVATAR_DIR)) {
          fs.unlink(diskPath, () => undefined)
        }
      }
      await AuthService.updateUserAvatar(userId, null)
      res.json({ success: true, message: "Avatar removed" })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * GET /api/auth/google
 */
router.get("/google", (req: Request, res: Response, next: NextFunction): void => {
  if (!env.GOOGLE_CLIENT_ID) {
    res.status(503).json({ success: false, error: "Google OAuth is not configured" })
    return
  }
  const nextPath = safeFrontendPath(req.query["next"], "/app/dashboard")
  passport.authenticate("google", { session: false, scope: ["profile", "email"], state: nextPath })(
    req,
    res,
    next,
  )
})

/**
 * GET /api/auth/google/callback
 */
router.get(
  "/google/callback",
  (req: Request, res: Response, next: NextFunction): void => {
    passport.authenticate("google", {
      session: false,
      failureRedirect: `${env.FRONTEND_URL}/login?error=oauth_failed`,
    })(req, res, next)
  },
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Passport sets req.user to the GoogleProfile object in this callback chain,
      // not the JWT AccessTokenPayload — cast through unknown to reflect this.
      const profile = req.user as unknown as {
        id: string
        email: string
        name: string
        avatarUrl?: string
      }
      const { accessToken, refreshToken } = await AuthService.handleGoogleOAuth(
        profile,
        req.ip ?? "",
      )
      const nextPath = safeFrontendPath(req.query["state"], "/app/dashboard")

      // Store the access token server-side under a short-lived one-time code.
      // The frontend redeems the code via POST /api/auth/oauth-token within 60 s.
      // This avoids putting the JWT in the URL (browser history / Referer leakage).
      const code = randomBytes(32).toString("hex")
      await redis.setex(`oauth:code:${code}`, 60, accessToken)

      res
        .cookie("refresh_token", refreshToken, REFRESH_COOKIE_OPTIONS)
        .redirect(`${env.FRONTEND_URL}${nextPath}?oauth_code=${code}`)
    } catch (err) {
      logger.error("Google OAuth callback error", {
        error: err instanceof Error ? err.message : String(err),
      })
      // Send a specific error code so the frontend can show a meaningful message
      if (err instanceof AppError && err.statusCode === 403) {
        if (err.message === "account_permanently_banned") {
          res.redirect(`${env.FRONTEND_URL}/login?error=account_permanently_banned`)
          return
        }
        if (err.message === "account_deleted") {
          res.redirect(`${env.FRONTEND_URL}/login?error=account_deleted`)
          return
        }
      }
      res.redirect(`${env.FRONTEND_URL}/login?error=oauth_failed`)
    }
  },
)

/**
 * POST /api/auth/oauth-token
 * Exchanges a one-time OAuth code (issued by the Google callback) for an access token.
 * The code expires after 60 seconds and is single-use.
 */
router.post(
  "/oauth-token",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { code } = z.object({ code: z.string().min(1) }).parse(req.body)
      const redisKey = `oauth:code:${code}`
      const accessToken = await redis.get(redisKey)
      if (!accessToken) {
        throw new AppError(400, "Invalid or expired OAuth code")
      }
      // Single-use: delete immediately after retrieval
      await redis.del(redisKey)
      res.json({ success: true, data: { accessToken } })
    } catch (err) {
      next(err)
    }
  },
)

export default router
