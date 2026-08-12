import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import { z } from "zod"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { requireAuth } from "../middleware/auth.middleware.js"
import * as TeamService from "../services/team.service.js"

const router: IRouter = Router()

function uid(req: Request): string {
  return (req.user as AccessTokenPayload).sub
}

const CreateInviteSchema = z.object({
  email: z.string().email().max(320),
  role: z.enum(["admin", "editor", "viewer"]),
})

router.get("/", requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const overview = await TeamService.getTeamOverview(uid(req))
    res.json({ success: true, data: overview })
  } catch (err) {
    next(err)
  }
})

router.get("/invites/token/:token", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rawToken = req.params["token"] as string
    const data = await TeamService.getInvitePreview(rawToken)
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

router.post("/invites", requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = CreateInviteSchema.parse(req.body)
    const data = await TeamService.createInvite(uid(req), parsed.email, parsed.role)
    res.status(201).json({ success: true, message: "Invite sent", data })
  } catch (err) {
    next(err)
  }
})

router.post("/invites/:id/resend", requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const inviteId = req.params["id"] as string
    const data = await TeamService.resendInvite(uid(req), inviteId)
    res.json({ success: true, message: "Invite resent", data })
  } catch (err) {
    next(err)
  }
})

router.delete("/invites/:id", requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const inviteId = req.params["id"] as string
    await TeamService.cancelInvite(uid(req), inviteId)
    res.json({ success: true, message: "Invite cancelled" })
  } catch (err) {
    next(err)
  }
})

router.post("/invites/token/:token/accept", requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rawToken = req.params["token"] as string
    const { message, ...data } = await TeamService.acceptInvite(uid(req), rawToken)
    res.json({ success: true, message, data })
  } catch (err) {
    next(err)
  }
})

export default router
