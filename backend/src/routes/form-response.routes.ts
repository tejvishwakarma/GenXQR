import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import { z } from "zod"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { requireAuth } from "../middleware/auth.middleware.js"
import { requireWorkspacePermission, withWorkspace, wsOwner } from "../middleware/workspace.middleware.js"
import * as Responses from "../services/form-response.service.js"
import { logAudit } from "../services/audit.service.js"

/**
 * /api/qr/:id/responses — answers to a FORM code's form (form-response.service.ts).
 * Reading them is viewing the code (qr:view); deleting one is qr:delete.
 */
const router: IRouter = Router()
// Per route, not router.use: mounted on /api/qr next to qr.routes, a
// router-wide middleware would run on every /api/qr request.
const auth = [requireAuth, withWorkspace] as const

const pageQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

router.get("/:id/responses", ...auth, requireWorkspacePermission("qr:view"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit } = pageQuery.parse(req.query)
    res.json({ success: true, ...(await Responses.listResponses(wsOwner(req), req.params["id"] as string, page, limit)) })
  } catch (err) {
    next(err)
  }
})

router.get("/:id/responses/csv", ...auth, requireWorkspacePermission("qr:view"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { filename, csv } = await Responses.responsesCsv(wsOwner(req), req.params["id"] as string)
    res.setHeader("Content-Type", "text/csv; charset=utf-8")
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
    res.send(csv)
  } catch (err) {
    next(err)
  }
})

router.delete("/:id/responses/:responseId", ...auth, requireWorkspacePermission("qr:delete"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const qrId = req.params["id"] as string
    await Responses.deleteResponse(wsOwner(req), qrId, req.params["responseId"] as string)
    logAudit({
      userId: (req.user as unknown as AccessTokenPayload).sub, action: "qr.form_response.delete", category: "qr",
      entityId: qrId, entityType: "QRCode", ip: req.ip, userAgent: req.headers["user-agent"],
    })
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
