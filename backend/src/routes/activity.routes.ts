import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import { z } from "zod"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { requireAuth } from "../middleware/auth.middleware.js"
import { withWorkspace, wsOwner, requireWorkspacePermission } from "../middleware/workspace.middleware.js"
import { AppError } from "../middleware/error.middleware.js"
import { getUserPlanLimits } from "../services/billing.service.js"
import * as Activity from "../services/activity.service.js"

/**
 * /api/activity — the customer activity log (services/activity.service.ts).
 *
 *   /security[/export]  the caller's own security history — every plan
 *   /team[/export]      the workspace's activity — OWNER/ADMIN, owner's plan
 *   /team/actors          has activityLog (Pro+)
 */

const router: IRouter = Router()
const uid = (req: Request) => (req.user as unknown as AccessTokenPayload).sub

router.use(requireAuth)

const FilterSchema = z.object({
  category: z.string().max(20).optional(),
  actorId: z.string().max(40).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})
const PageSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

async function requireActivityLog(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const { limits, planName } = await getUserPlanLimits(wsOwner(req))
    if (!limits.activityLog) {
      throw new AppError(403, `The team activity log is not available on the ${planName} plan. Please upgrade to Pro or higher.`)
    }
    next()
  } catch (err) { next(err) }
}

const team = [withWorkspace, requireWorkspacePermission("team:manage"), requireActivityLog]

function sendCsv(res: Response, name: string, csv: string): void {
  const day = new Date().toISOString().slice(0, 10)
  res.setHeader("Content-Type", "text/csv; charset=utf-8")
  res.setHeader("Content-Disposition", `attachment; filename="genxqr-${name}-${day}.csv"`)
  res.setHeader("Cache-Control", "no-store")
  res.send(csv)
}

router.get("/security", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { actorId: _ignored, ...filters } = FilterSchema.parse(req.query)
    const { page, limit } = PageSchema.parse(req.query)
    res.json({ success: true, data: await Activity.listActivity("security", uid(req), filters, page, limit) })
  } catch (err) { next(err) }
})

router.get("/security/export", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { actorId: _ignored, ...filters } = FilterSchema.parse(req.query)
    sendCsv(res, "security-history", await Activity.exportActivityCsv("security", uid(req), filters))
  } catch (err) { next(err) }
})

router.get("/team", ...team, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = FilterSchema.parse(req.query)
    const { page, limit } = PageSchema.parse(req.query)
    res.json({ success: true, data: await Activity.listActivity("team", wsOwner(req), filters, page, limit) })
  } catch (err) { next(err) }
})

router.get("/team/actors", ...team, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await Activity.listActivityActors(wsOwner(req)) })
  } catch (err) { next(err) }
})

router.get("/team/export", ...team, async (req: Request, res: Response, next: NextFunction) => {
  try {
    sendCsv(res, "activity-log", await Activity.exportActivityCsv("team", wsOwner(req), FilterSchema.parse(req.query)))
  } catch (err) { next(err) }
})

export default router
