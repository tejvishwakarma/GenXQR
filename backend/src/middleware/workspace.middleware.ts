/**
 * Resolves which workspace a dashboard request acts in, and enforces the role.
 *
 * The dashboard sends `X-Workspace-Id: <owner user id>` while a team workspace
 * is selected; without it every request acts in the caller's own workspace,
 * exactly as before teams were shared. See services/workspace.service.ts.
 *
 * Use after requireAuth:
 *   router.use(requireAuth, withWorkspace)
 *   router.delete("/:id", requireWorkspacePermission("qr:delete"), handler)
 * and scope data by wsOwner(req), never by the caller's id.
 */
import type { Request, Response, NextFunction } from "express"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { AppError } from "./error.middleware.js"
import { requestContext } from "../utils/request-context.js"
import { can, resolveWorkspace, type Workspace, type WorkspaceAction } from "../services/workspace.service.js"

export const WORKSPACE_HEADER = "x-workspace-id"

declare module "express-serve-static-core" {
  interface Request {
    workspace?: Workspace
  }
}

export async function withWorkspace(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const actorId = (req.user as unknown as AccessTokenPayload).sub
    const header = req.headers[WORKSPACE_HEADER]
    const requested = typeof header === "string" && header.length > 0 && header.length <= 64 ? header : null
    req.workspace = await resolveWorkspace(actorId, requested)
    // Every audit row this request writes belongs to the workspace owner's
    // activity log (db/prisma.ts audit hook). Keeps any impersonation stamp.
    requestContext.run({ ...requestContext.getStore(), workspaceOwnerId: req.workspace.ownerId }, next)
  } catch (err) {
    next(err)
  }
}

export function requireWorkspacePermission(action: WorkspaceAction) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const ws = req.workspace
    if (!ws) return next(new AppError(500, "Workspace not resolved"))
    if (!can(ws, action)) {
      return next(new AppError(403, `Your role in this workspace (${ws.role.toLowerCase()}) cannot do this.`))
    }
    next()
  }
}

/** The owner whose data, plan and quotas this request acts on. */
export function wsOwner(req: Request): string {
  if (req.workspace) return req.workspace.ownerId
  return (req.user as unknown as AccessTokenPayload).sub
}
