import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { requireAuth } from "../middleware/auth.middleware.js"
import { requireWorkspacePermission, withWorkspace, wsOwner } from "../middleware/workspace.middleware.js"
import * as FolderService from "../services/folder.service.js"
import { logAudit } from "../services/audit.service.js"
import { getQR } from "../services/qr.service.js"
import { deliverWebhookEvent } from "../services/webhook.service.js"

/**
 * /api/folders — the workspace's code folders (folder.service.ts). Same roles as
 * codes: anyone views, EDITOR+ adds, renames and files codes, OWNER/ADMIN deletes.
 */
const router: IRouter = Router()
const uid = (req: Request): string => (req.user as unknown as AccessTokenPayload).sub

router.use(requireAuth, withWorkspace)

/** Activity-log entry (team log, category qr; owner = this request's workspace). */
function auditFolder(req: Request, action: string, folderId: string | null, metadata: Record<string, unknown>): void {
  logAudit({ userId: uid(req), action, category: "qr", entityId: folderId ?? undefined, entityType: "Folder", metadata, ip: req.ip, userAgent: req.headers["user-agent"] })
}

/** qr.updated for each changed code, one after another (as bulk upload does). */
function sendUpdated(owner: string, ids: string[]): void {
  void (async () => {
    for (const id of ids) {
      await getQR(id, owner).then((qr) => deliverWebhookEvent(owner, "qr.updated", { qr })).catch(() => undefined)
    }
  })()
}

router.get("/", requireWorkspacePermission("qr:view"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await FolderService.listFolders(wsOwner(req)) })
  } catch (err) {
    next(err)
  }
})

router.post("/", requireWorkspacePermission("qr:create"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const folder = await FolderService.createFolder(wsOwner(req), FolderService.folderInputSchema.parse(req.body))
    auditFolder(req, "folder.create", folder.id, { name: folder.name })
    res.status(201).json({ success: true, data: folder })
  } catch (err) {
    next(err)
  }
})

/** POST /api/folders/move {ids, folderId} — file codes in a folder, or take them out (null). */
router.post("/move", requireWorkspacePermission("qr:edit"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const owner = wsOwner(req)
    const input = FolderService.moveToFolderSchema.parse(req.body)
    const moved = await FolderService.moveCodesToFolder(owner, input)
    if (moved.length) auditFolder(req, "folder.move", input.folderId, { moved: moved.length })
    sendUpdated(owner, moved)
    res.json({ success: true, data: { moved } })
  } catch (err) {
    next(err)
  }
})

router.patch("/:id", requireWorkspacePermission("qr:edit"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const folder = await FolderService.renameFolder(wsOwner(req), req.params["id"] as string, FolderService.folderInputSchema.parse(req.body))
    auditFolder(req, "folder.rename", folder.id, { name: folder.name })
    res.json({ success: true, data: folder })
  } catch (err) {
    next(err)
  }
})

router.delete("/:id", requireWorkspacePermission("qr:delete"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const owner = wsOwner(req)
    const folder = await FolderService.deleteFolder(owner, req.params["id"] as string)
    auditFolder(req, "folder.delete", folder.id, { name: folder.name, codes: folder.codeIds.length })
    sendUpdated(owner, folder.codeIds)
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
