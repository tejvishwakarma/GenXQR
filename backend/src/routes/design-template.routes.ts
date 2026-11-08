import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { requireAuth } from "../middleware/auth.middleware.js"
import { requireWorkspacePermission, withWorkspace, wsOwner } from "../middleware/workspace.middleware.js"
import * as Templates from "../services/design-template.service.js"
import { logAudit } from "../services/audit.service.js"

/**
 * /api/design-templates — the workspace's saved QR designs (design-template.service.ts).
 * Same roles as codes: anyone views, EDITOR+ saves and renames, OWNER/ADMIN deletes.
 */
const router: IRouter = Router()
const uid = (req: Request): string => (req.user as unknown as AccessTokenPayload).sub

router.use(requireAuth, withWorkspace)

/** Activity-log entry (team log, category qr; owner = this request's workspace). */
function audit(req: Request, action: string, id: string, name: string): void {
  logAudit({ userId: uid(req), action, category: "qr", entityId: id, entityType: "DesignTemplate", metadata: { name }, ip: req.ip, userAgent: req.headers["user-agent"] })
}

router.get("/", requireWorkspacePermission("qr:view"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await Templates.listTemplates(wsOwner(req)) })
  } catch (err) {
    next(err)
  }
})

router.post("/", requireWorkspacePermission("qr:create"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const t = await Templates.createTemplate(wsOwner(req), Templates.templateInputSchema.parse(req.body))
    audit(req, "template.create", t.id, t.name)
    res.status(201).json({ success: true, data: t })
  } catch (err) {
    next(err)
  }
})

router.patch("/:id", requireWorkspacePermission("qr:edit"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = Templates.templateRenameSchema.parse(req.body)
    const t = await Templates.renameTemplate(wsOwner(req), req.params["id"] as string, name)
    audit(req, "template.rename", t.id, t.name)
    res.json({ success: true, data: t })
  } catch (err) {
    next(err)
  }
})

router.delete("/:id", requireWorkspacePermission("qr:delete"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const t = await Templates.deleteTemplate(wsOwner(req), req.params["id"] as string)
    audit(req, "template.delete", t.id, t.name)
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
