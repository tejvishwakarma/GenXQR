import { Router, type IRouter } from "express"
import { z } from "zod"
import type { Request } from "express"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { requireAuth } from "../middleware/auth.middleware.js"
import {
  getDriveAuthUrl,
  connectDrive,
  disconnectDrive,
  exportQRsToDrive,
  getDriveStatus,
} from "../services/gdrive.service.js"
import { env } from "../config/env.js"

const router: IRouter = Router()
const uid = (req: Request) => (req.user as unknown as AccessTokenPayload).sub

/**
 * GET /api/gdrive/status
 * Returns whether Google Drive is currently connected for the user.
 */
router.get("/status", requireAuth, async (req, res, next) => {
  try {
    const status = await getDriveStatus(uid(req))
    res.json({ success: true, data: status })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/gdrive/connect
 * Redirects the user to Google's OAuth2 consent page.
 */
router.get("/connect", requireAuth, (_req, res, next) => {
  try {
    const url = getDriveAuthUrl()
    res.json({ success: true, data: { url } })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/gdrive/callback
 * OAuth2 callback handler — Google redirects here after user grants permission.
 * Exchanges the code for tokens and redirects back to the frontend.
 */
router.get("/callback", async (req, res, next) => {
  try {
    const { code, state, error } = req.query as Record<string, string>

    if (error) {
      return res.redirect(`${env.FRONTEND_URL}/app/settings?drive=error&reason=${encodeURIComponent(error)}`)
    }

    if (!code || !state) {
      return res.redirect(`${env.FRONTEND_URL}/app/settings?drive=error&reason=missing_params`)
    }

    // The user ID is passed through the state parameter
    const userId = Buffer.from(state, "base64url").toString("utf8")
    await connectDrive(userId, code)
    return res.redirect(`${env.FRONTEND_URL}/app/settings?drive=connected`)
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/gdrive/auth-url
 * Returns the Google OAuth URL with state=base64url(userId) for the frontend
 * to open in a popup or redirect.
 */
router.get("/auth-url", requireAuth, (_req, res, next) => {
  try {
    const url = getDriveAuthUrl()
    // Encode userId in state so the callback can identify the user
    const stateParam = Buffer.from(_req.user ? uid(_req) : "").toString("base64url")
    const fullUrl = url + `&state=${stateParam}`
    res.json({ success: true, data: { url: fullUrl } })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/gdrive/disconnect
 * Revoke Google Drive access and remove stored tokens.
 */
router.post("/disconnect", requireAuth, async (req, res, next) => {
  try {
    await disconnectDrive(uid(req))
    res.json({ success: true, message: "Google Drive disconnected" })
  } catch (err) {
    next(err)
  }
})

const exportSchema = z.object({
  qrIds: z.array(z.string()).optional(),
})

/**
 * POST /api/gdrive/export
 * Export selected (or all) QR codes to Google Drive.
 */
router.post("/export", requireAuth, async (req, res, next) => {
  try {
    const { qrIds } = exportSchema.parse(req.body)
    const files = await exportQRsToDrive(uid(req), qrIds)
    res.json({ success: true, data: files })
  } catch (err) {
    next(err)
  }
})

export default router
