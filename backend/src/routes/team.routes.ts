import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import { z } from "zod"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { requireAuth } from "../middleware/auth.middleware.js"
import * as TeamService from "../services/team.service.js"
import { listWorkspaces } from "../services/workspace.service.js"
import { requireWorkspacePermission, withWorkspace, wsOwner } from "../middleware/workspace.middleware.js"

const router: IRouter = Router()

function uid(req: Request): string {
  return (req.user as AccessTokenPayload).sub
}

const CreateInviteSchema = z.object({
  email: z.string().email().max(320),
  role: z.enum(["admin", "editor", "viewer"]),
})

// Team routes act on the SELECTED workspace's team (X-Workspace-Id): in your
// own workspace that is your team; in a team you belong to, it is the owner's.
const manageTeam = [requireAuth, withWorkspace, requireWorkspacePermission("team:manage")]

const MemberRoleSchema = z.object({ role: z.enum(["admin", "editor", "viewer"]) })

/** Every workspace the caller can switch to (personal first). */
router.get("/workspaces", requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await listWorkspaces(uid(req)) })
  } catch (err) {
    next(err)
  }
})

router.get("/", requireAuth, withWorkspace, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const overview = await TeamService.getTeamOverview(wsOwner(req))
    res.json({
      success: true,
      data: { ...overview, ownerId: wsOwner(req), myRole: req.workspace!.role.toLowerCase() },
    })
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

router.post("/invites", ...manageTeam, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = CreateInviteSchema.parse(req.body)
    const data = await TeamService.createInvite(wsOwner(req), parsed.email, parsed.role)
    res.status(201).json({ success: true, message: "Invite sent", data })
  } catch (err) {
    next(err)
  }
})

router.post("/invites/:id/resend", ...manageTeam, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const inviteId = req.params["id"] as string
    const data = await TeamService.resendInvite(wsOwner(req), inviteId)
    res.json({ success: true, message: "Invite resent", data })
  } catch (err) {
    next(err)
  }
})

router.delete("/invites/:id", ...manageTeam, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const inviteId = req.params["id"] as string
    await TeamService.cancelInvite(wsOwner(req), inviteId)
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

router.patch("/members/:userId/role", ...manageTeam, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { role } = MemberRoleSchema.parse(req.body)
    const data = await TeamService.changeMemberRole(wsOwner(req), uid(req), req.params["userId"] as string, role)
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

router.delete("/members/:userId", ...manageTeam, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await TeamService.removeMember(wsOwner(req), uid(req), req.params["userId"] as string)
    res.json({ success: true, message: "Member removed" })
  } catch (err) {
    next(err)
  }
})

/** Leave another owner's team (no workspace header needed — the owner is in the path). */
router.delete("/memberships/:ownerId", requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await TeamService.leaveTeam(uid(req), req.params["ownerId"] as string)
    res.json({ success: true, message: "You have left the team" })
  } catch (err) {
    next(err)
  }
})

export default router
