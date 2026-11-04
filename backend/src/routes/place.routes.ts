import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import { z } from "zod"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { requireAuth } from "../middleware/auth.middleware.js"
import { requireWorkspacePermission, withWorkspace, wsOwner } from "../middleware/workspace.middleware.js"
import * as PlaceService from "../services/place.service.js"
import { logAudit } from "../services/audit.service.js"
import { getQR } from "../services/qr.service.js"
import { deliverWebhookEvent } from "../services/webhook.service.js"

/**
 * /api/places — the workspace's print locations (place.service.ts). Same roles
 * as codes: anyone can view, EDITOR+ adds and edits, OWNER/ADMIN deletes.
 */
const router: IRouter = Router()
const uid = (req: Request): string => (req.user as unknown as AccessTokenPayload).sub

router.use(requireAuth, withWorkspace)

/** Activity-log entry (team log, category qr; owner = this request's workspace). */
function auditPlace(req: Request, action: string, placeId: string, metadata: Record<string, unknown>): void {
  logAudit({ userId: uid(req), action, category: "qr", entityId: placeId, entityType: "Place", metadata, ip: req.ip, userAgent: req.headers["user-agent"] })
}

const listQuery = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) })

/** GET /api/places?days=30 — places with their code count and scans (in range + all time). */
router.get("/", requireWorkspacePermission("qr:view"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { days } = listQuery.parse(req.query)
    res.json({ success: true, data: await PlaceService.listPlaces(wsOwner(req), days) })
  } catch (err) {
    next(err)
  }
})

router.post("/", requireWorkspacePermission("qr:create"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const place = await PlaceService.createPlace(wsOwner(req), PlaceService.placeInputSchema.parse(req.body))
    auditPlace(req, "place.create", place.id, { name: place.name })
    res.status(201).json({ success: true, data: place })
  } catch (err) {
    next(err)
  }
})

router.patch("/:id", requireWorkspacePermission("qr:edit"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const place = await PlaceService.updatePlace(wsOwner(req), req.params["id"] as string, PlaceService.placeUpdateSchema.parse(req.body))
    auditPlace(req, "place.update", place.id, { name: place.name })
    res.json({ success: true, data: place })
  } catch (err) {
    next(err)
  }
})

/**
 * PUT /api/places/:id/codes {add, remove} — put codes at this place or take
 * them off it. An edit of each code: audited and sent as qr.updated.
 */
router.put("/:id/codes", requireWorkspacePermission("qr:edit"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const owner = wsOwner(req)
    const result = await PlaceService.setPlaceCodes(owner, req.params["id"] as string, PlaceService.placeCodesSchema.parse(req.body))
    if (result.added.length || result.removed.length) {
      auditPlace(req, "place.codes", result.place.id, { name: result.place.name, added: result.added.length, removed: result.removed.length })
    }
    // qr.updated for each changed code, one after another (as bulk upload does).
    void (async () => {
      for (const id of [...result.added, ...result.removed]) {
        await getQR(id, owner).then((qr) => deliverWebhookEvent(owner, "qr.updated", { qr })).catch(() => undefined)
      }
    })()
    res.json({ success: true, data: { added: result.added, removed: result.removed } })
  } catch (err) {
    next(err)
  }
})

router.delete("/:id", requireWorkspacePermission("qr:delete"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const place = await PlaceService.deletePlace(wsOwner(req), req.params["id"] as string)
    auditPlace(req, "place.delete", place.id, { name: place.name })
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
