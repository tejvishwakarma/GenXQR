/**
 * Team workspaces: shared access to an owner's QR codes (decided 18 Oct 2026).
 *
 * A workspace is an owner's account. Its members — TeamMember rows on the
 * owner's Team — work inside it: they see the owner's QR codes and analytics,
 * and codes they create belong to the owner and count against the OWNER's plan
 * (slots, features, storage, scan quota). Everyone also keeps their own
 * personal workspace and switches between them in the dashboard.
 *
 * Roles (server-enforced; the dashboard only hides what you can't do):
 *   OWNER  — everything, including billing and deleting the team
 *   ADMIN  — everything except billing and deleting the team
 *   EDITOR — view, create, edit and switch codes on/off; no delete
 *   VIEWER — view codes and analytics only
 *
 * Personal-only, never shared: billing, API keys, webhooks, white-label
 * branding, account settings. Membership grants access only while the owner's
 * plan includes team seats (teamSeatsLimit > 1); after a downgrade, members
 * lose access but stay on the roster.
 */
import type { TeamRole } from "@prisma/client"
import { prisma } from "../db/prisma.js"
import { AppError } from "../middleware/error.middleware.js"
import { getPlanLimitsReadOnly } from "./billing.service.js"

export type WorkspaceRole = TeamRole // OWNER | ADMIN | EDITOR | VIEWER

export type WorkspaceAction = "qr:view" | "qr:create" | "qr:edit" | "qr:delete" | "team:manage"

const PERMISSIONS: Record<WorkspaceRole, readonly WorkspaceAction[]> = {
  OWNER: ["qr:view", "qr:create", "qr:edit", "qr:delete", "team:manage"],
  ADMIN: ["qr:view", "qr:create", "qr:edit", "qr:delete", "team:manage"],
  EDITOR: ["qr:view", "qr:create", "qr:edit"],
  VIEWER: ["qr:view"],
}

export interface Workspace {
  /** Whose QR codes, plan and quotas apply. */
  ownerId: string
  /** Who is making the request — used for audit logs and upload provenance. */
  actorId: string
  role: WorkspaceRole
}

export function can(ws: Workspace, action: WorkspaceAction): boolean {
  return PERMISSIONS[ws.role].includes(action)
}

/**
 * The workspace a request acts in. `requestedOwnerId` comes from the
 * X-Workspace-Id header; absent or equal to the caller means their own.
 */
export async function resolveWorkspace(actorId: string, requestedOwnerId?: string | null): Promise<Workspace> {
  if (!requestedOwnerId || requestedOwnerId === actorId) {
    return { ownerId: actorId, actorId, role: "OWNER" }
  }

  const membership = await prisma.teamMember.findFirst({
    where: { userId: actorId, team: { ownerId: requestedOwnerId } },
    select: { id: true, role: true, joinedAt: true, teamId: true },
  })
  // Same answer whether the workspace does not exist or the caller is not in
  // it, so the header cannot be used to probe for account ids.
  if (!membership) throw new AppError(403, "You are not a member of this workspace.")

  const ownerLimits = await getPlanLimitsReadOnly(requestedOwnerId)
  if (ownerLimits.teamSeatsLimit <= 1) {
    throw new AppError(403, "This team's plan no longer includes team access. Ask the owner to upgrade.")
  }
  if (!(await withinSeats(membership, ownerLimits.teamSeatsLimit))) {
    throw new AppError(403, "This team has more members than its plan has seats. Ask the owner to upgrade or free a seat.")
  }

  // OWNER is never stored on a member row; treat a stray one as ADMIN.
  const role: WorkspaceRole = membership.role === "OWNER" ? "ADMIN" : membership.role
  return { ownerId: requestedOwnerId, actorId, role }
}

/**
 * Members who fit the plan's seats: the earliest to join, the owner taking one
 * seat. After a downgrade (Business 20 → Pro 5) the members beyond that are
 * suspended — kept on the roster, no access — until the owner upgrades or
 * removes someone. Before this every member kept access (audit, 24 Oct 2026).
 */
export async function withinSeats(
  member: { id: string; joinedAt: Date; teamId: string },
  teamSeatsLimit: number,
): Promise<boolean> {
  const ahead = await prisma.teamMember.count({
    where: {
      teamId: member.teamId,
      OR: [{ joinedAt: { lt: member.joinedAt } }, { joinedAt: member.joinedAt, id: { lt: member.id } }],
    },
  })
  return ahead < Math.max(0, teamSeatsLimit - 1)
}

/** Every workspace the user can switch to: their own first, then teams they belong to. */
export async function listWorkspaces(userId: string) {
  const [me, memberships] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } }),
    prisma.teamMember.findMany({
      where: { userId },
      select: {
        id: true,
        joinedAt: true,
        teamId: true,
        role: true,
        team: { select: { name: true, owner: { select: { id: true, name: true } } } },
      },
      orderBy: { joinedAt: "asc" },
    }),
  ])

  const shared = await Promise.all(
    memberships.map(async (m) => {
      const limits = await getPlanLimitsReadOnly(m.team.owner.id)
      return {
        ownerId: m.team.owner.id,
        name: m.team.name || `${m.team.owner.name}'s team`,
        ownerName: m.team.owner.name,
        role: (m.role === "OWNER" ? "ADMIN" : m.role) as WorkspaceRole,
        /** False when the owner's plan no longer includes team seats, or this member is beyond them. */
        available: limits.teamSeatsLimit > 1 && (await withinSeats(m, limits.teamSeatsLimit)),
      }
    }),
  )

  return [
    { ownerId: userId, name: "Personal", ownerName: me?.name ?? "", role: "OWNER" as WorkspaceRole, available: true },
    ...shared,
  ]
}
