import { Router, type IRouter } from "express"
import { z } from "zod"
import type { Request } from "express"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { signOAuthState, verifyOAuthState } from "../utils/jwt.js"
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
router.get("/connect", requireAuth, (req, res, next) => {
  try {
    const url = getDriveAuthUrl()
    const stateParam = signOAuthState(uid(req))
    res.json({ success: true, data: { url: `${url}&state=${encodeURIComponent(stateParam)}` } })
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

    // The user ID is carried in a server-signed, short-lived state token. Verifying
    // the signature guarantees the flow can only complete for the user who started
    // it — a forged/expired/tampered state is rejected here.
    let userId: string
    try {
      userId = verifyOAuthState(state).sub
    } catch {
      return res.redirect(`${env.FRONTEND_URL}/app/settings?drive=error&reason=invalid_state`)
    }
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
    // Bind the flow to the authenticated user with a signed, short-lived state token.
    const stateParam = signOAuthState(uid(_req))
    const fullUrl = url + `&state=${encodeURIComponent(stateParam)}`
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
