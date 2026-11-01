import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import { z } from "zod"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { requireAuth } from "../middleware/auth.middleware.js"
import { withWorkspace, wsOwner, requireWorkspacePermission } from "../middleware/workspace.middleware.js"
import { AppError } from "../middleware/error.middleware.js"
import * as Agency from "../services/agency.service.js"

/**
 * /api/agency — an agency's clients (services/agency.service.ts).
 *
 * Acts on the agency whose workspace is selected: your own, or an agency team
 * you are an OWNER/ADMIN of. Never from inside a client's workspace — clients
 * do not have clients.
 */

const router: IRouter = Router()
const uid = (req: Request) => (req.user as unknown as AccessTokenPayload).sub

router.use(requireAuth, withWorkspace, requireWorkspacePermission("team:manage"), (req: Request, _res: Response, next: NextFunction) => {
  next(req.workspace?.clientOf ? new AppError(409, "Switch to the agency's workspace to manage clients.") : undefined)
})

router.get("/clients", async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await Agency.listClients(wsOwner(req)) })
  } catch (err) { next(err) }
})

router.post("/clients", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = Agency.createClientSchema.parse(req.body)
    res.status(201).json({ success: true, data: await Agency.createClient(wsOwner(req), uid(req), input) })
  } catch (err) { next(err) }
})

router.patch("/clients/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = Agency.updateClientSchema.parse(req.body)
    res.json({ success: true, data: await Agency.updateClient(wsOwner(req), uid(req), String(req.params["id"]), input) })
  } catch (err) { next(err) }
})

router.delete("/clients/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await Agency.deleteClient(wsOwner(req), uid(req), String(req.params["id"]))
    res.json({ success: true })
  } catch (err) { next(err) }
})

router.put("/clients/:id/report", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body)
    const token = await Agency.setReportLink(wsOwner(req), uid(req), String(req.params["id"]), enabled)
    res.json({ success: true, data: { reportToken: token } })
  } catch (err) { next(err) }
})

export default router
