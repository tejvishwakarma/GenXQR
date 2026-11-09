import { Router, type IRouter } from "express"
import { z } from "zod"
import type { Request } from "express"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { signOAuthState, verifyOAuthState } from "../utils/jwt.js"
import { requireAuth } from "../middleware/auth.middleware.js"
import multer from "multer"
import { requirePlanFeature } from "../middleware/plan-gate.middleware.js"
import { forbidWhileImpersonating } from "../middleware/impersonation.middleware.js"
import { AppError } from "../middleware/error.middleware.js"
import { MULTIPART_FIELD_LIMITS } from "../utils/multipart-limits.util.js"
import { logAudit } from "../services/audit.service.js"
import {
  getDriveAuthUrl,
  connectDrive,
  disconnectDrive,
  getDriveStatus,
  startDriveExport,
  uploadDriveExportFile,
  DRIVE_EXPORT_MAX_CODES,
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
router.get("/connect", requireAuth, forbidWhileImpersonating, requirePlanFeature("driveExport"), (req, res, next) => {
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
router.get("/auth-url", requireAuth, forbidWhileImpersonating, requirePlanFeature("driveExport"), (_req, res, next) => {
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

/**
 * Export (Business and above): POST /export/start {qrIds, format} makes a dated
 * folder with codes.csv and answers which files to send; the browser then draws
 * each code (frame and logo included) and POSTs it to /export/:id/files/:qrId.
 * Only the caller's own codes, each once (gdrive.service).
 */
const startSchema = z.object({
  qrIds: z.array(z.string().min(1).max(40)).min(1).max(DRIVE_EXPORT_MAX_CODES),
  format: z.enum(["png", "svg", "pdf"]),
})

router.post("/export/start", requireAuth, forbidWhileImpersonating, requirePlanFeature("driveExport"), async (req, res, next) => {
  try {
    const { qrIds, format } = startSchema.parse(req.body)
    const result = await startDriveExport(uid(req), qrIds, format)
    logAudit({ userId: uid(req), action: "qr.export.drive", category: "qr", metadata: { count: result.files.length, format }, ip: req.ip, userAgent: req.headers["user-agent"] })
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

const upload = multer({
  storage: multer.memoryStorage(),
  // A framed code at print size is a few MB as PNG; PDFs are a JPEG inside.
  limits: { ...MULTIPART_FIELD_LIMITS, fields: 2, files: 1, fileSize: 15 * 1024 * 1024 },
})

router.post("/export/:exportId/files/:qrId", requireAuth, requirePlanFeature("driveExport"), upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) throw new AppError(422, "No file was sent.")
    await uploadDriveExportFile(uid(req), String(req.params["exportId"]), String(req.params["qrId"]), req.file.buffer)
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
