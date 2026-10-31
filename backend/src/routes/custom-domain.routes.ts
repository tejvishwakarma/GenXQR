import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import { z } from "zod"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { requireAuth } from "../middleware/auth.middleware.js"
import { withWorkspace, wsOwner, requireWorkspacePermission } from "../middleware/workspace.middleware.js"
import { logAudit } from "../services/audit.service.js"
import * as Domains from "../services/custom-domain.service.js"

/**
 * /api/domains — custom domains (custom-domain.service.ts).
 *
 * Listing follows the workspace, so a team member creating codes in the owner's
 * workspace can pick the owner's domains. Adding, checking, defaulting and
 * removing are the account's own business, like billing and branding: they act
 * on the signed-in user's account and ignore the workspace header.
 */

const router: IRouter = Router()
const uid = (req: Request) => (req.user as unknown as AccessTokenPayload).sub

router.use(requireAuth)

router.get("/", withWorkspace, requireWorkspacePermission("qr:view"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await Domains.listDomains(wsOwner(req)) })
  } catch (err) { next(err) }
})

const AddSchema = z.object({ hostname: z.string().trim().min(1).max(253) })

router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { hostname } = AddSchema.parse(req.body)
    const domain = await Domains.addDomain(uid(req), hostname)
    logAudit({ userId: uid(req), action: "domain.add", category: "settings", entityId: domain.id, entityType: "CustomDomain", metadata: { hostname: domain.hostname }, ip: req.ip, userAgent: req.headers["user-agent"] })
    res.status(201).json({ success: true, data: domain })
  } catch (err) { next(err) }
})

router.post("/:id/check", async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await Domains.checkDomain(uid(req), String(req.params["id"])) })
  } catch (err) { next(err) }
})

const DefaultSchema = z.object({ id: z.string().min(1).max(40).nullable() })

router.put("/default", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = DefaultSchema.parse(req.body)
    await Domains.setDefaultDomain(uid(req), id)
    res.json({ success: true })
  } catch (err) { next(err) }
})

router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params["id"])
    const result = await Domains.deleteDomain(uid(req), id)
    logAudit({ userId: uid(req), action: "domain.remove", category: "settings", entityId: id, entityType: "CustomDomain", metadata: result, ip: req.ip, userAgent: req.headers["user-agent"] })
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
})

export default router
