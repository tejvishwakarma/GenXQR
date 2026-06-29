import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import { z } from "zod"
import { env } from "../config/env.js"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { requireAuth } from "../middleware/auth.middleware.js"
import { prisma } from "../db/prisma.js"
import { getUserPlanLimits } from "../services/billing.service.js"
import { sendEmail } from "../services/email.service.js"
import { generateSecureToken, hashToken } from "../utils/crypto.js"

const router: IRouter = Router()

type TeamRole = "admin" | "editor" | "viewer"

const LegacyTeamStateSchema = z.object({
  members: z.array(z.object({
    userId: z.string().min(1),
    role: z.enum(["admin", "editor", "viewer"]),
    joinedAt: z.string().min(1),
  })).optional(),
  invites: z.array(z.object({
    id: z.string().min(1),
    email: z.string().email().max(320),
    role: z.enum(["admin", "editor", "viewer"]),
    invitedAt: z.string().min(1),
    lastSentAt: z.string().min(1),
    resendCount: z.number().int().nonnegative(),
    tokenHash: z.string().min(1).nullable().optional(),
    acceptedAt: z.string().min(1).nullable().optional(),
  })).optional(),
}).passthrough()

function legacyTeamStateKey(ownerId: string): string {
  return `team_invites:${ownerId}`
}

function parseLegacyTeamState(raw: string | null): {
  members: Array<{ userId: string; role: TeamRole; joinedAt: string }>
  invites: Array<{ id: string; email: string; role: TeamRole; invitedAt: string; lastSentAt: string; resendCount: number; tokenHash: string | null; acceptedAt: string | null }>
} {
  if (!raw) return { members: [], invites: [] }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      const shaped = LegacyTeamStateSchema.safeParse({ invites: parsed })
      if (!shaped.success) return { members: [], invites: [] }
      return {
        members: [],
        invites: (shaped.data.invites ?? []).map((invite) => ({
          ...invite,
          tokenHash: invite.tokenHash ?? null,
          acceptedAt: invite.acceptedAt ?? null,
        })),
      }
    }

    const shaped = LegacyTeamStateSchema.safeParse(parsed)
    if (!shaped.success) return { members: [], invites: [] }
    return {
      members: shaped.data.members ?? [],
      invites: (shaped.data.invites ?? []).map((invite) => ({
        ...invite,
        tokenHash: invite.tokenHash ?? null,
        acceptedAt: invite.acceptedAt ?? null,
      })),
    }
  } catch {
    return { members: [], invites: [] }
  }
}

function safeDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function uid(req: Request): string {
  return (req.user as AccessTokenPayload).sub
}

function apiRoleFromDb(role: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER"): TeamRole {
  if (role === "ADMIN" || role === "OWNER") return "admin"
  if (role === "EDITOR") return "editor"
  return "viewer"
}

function dbRoleFromApi(role: TeamRole): "ADMIN" | "EDITOR" | "VIEWER" {
  if (role === "admin") return "ADMIN"
  if (role === "editor") return "EDITOR"
  return "VIEWER"
}

async function getOrCreateOwnedTeam(ownerId: string) {
  const existing = await prisma.team.findFirst({ where: { ownerId }, select: { id: true, ownerId: true } })
  if (existing) {
    await migrateLegacyTeamStateIfNeeded(ownerId, existing.id)
    return existing
  }

  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { name: true } })
  const name = owner?.name ? `${owner.name}'s Team` : "My Team"
  const created = await prisma.team.create({ data: { ownerId, name }, select: { id: true, ownerId: true } })
  await migrateLegacyTeamStateIfNeeded(ownerId, created.id)
  return created
}

async function migrateLegacyTeamStateIfNeeded(ownerId: string, teamId: string): Promise<void> {
  const legacyKey = legacyTeamStateKey(ownerId)
  const row = await prisma.platformSetting.findUnique({ where: { key: legacyKey }, select: { value: true } })
  if (!row) return

  const legacy = parseLegacyTeamState(row.value)
  const memberRows = legacy.members
    .map((member) => ({
      teamId,
      userId: member.userId,
      role: dbRoleFromApi(member.role),
      joinedAt: safeDate(member.joinedAt) ?? new Date(),
    }))

  const inviteRows = legacy.invites
    .filter((invite) => typeof invite.tokenHash === "string" && invite.tokenHash.length > 0)
    .map((invite) => ({
      id: invite.id,
      teamId,
      email: invite.email.toLowerCase(),
      role: dbRoleFromApi(invite.role),
      invitedBy: ownerId,
      token: invite.tokenHash!,
      createdAt: safeDate(invite.invitedAt) ?? new Date(),
      lastSentAt: safeDate(invite.lastSentAt) ?? (safeDate(invite.invitedAt) ?? new Date()),
      resendCount: invite.resendCount,
      acceptedAt: safeDate(invite.acceptedAt),
    }))

  await prisma.$transaction([
    memberRows.length > 0
      ? prisma.teamMember.createMany({ data: memberRows, skipDuplicates: true })
      : prisma.teamMember.createMany({ data: [], skipDuplicates: true }),
    inviteRows.length > 0
      ? prisma.teamInvite.createMany({ data: inviteRows, skipDuplicates: true })
      : prisma.teamInvite.createMany({ data: [], skipDuplicates: true }),
    prisma.platformSetting.delete({ where: { key: legacyKey } }),
  ])
}

async function getTeamForUserOverview(userId: string): Promise<{ teamId: string; ownerId: string }> {
  const owned = await prisma.team.findFirst({ where: { ownerId: userId }, select: { id: true, ownerId: true } })
  if (owned) return { teamId: owned.id, ownerId: owned.ownerId }

  const membership = await prisma.teamMember.findFirst({
    where: { userId },
    select: { teamId: true, team: { select: { ownerId: true } } },
  })
  if (membership) return { teamId: membership.teamId, ownerId: membership.team.ownerId }

  const created = await getOrCreateOwnedTeam(userId)
  return { teamId: created.id, ownerId: created.ownerId }
}

function buildInviteUrl(token: string): string {
  return `${env.FRONTEND_URL}/invite/${encodeURIComponent(token)}`
}

async function sendTeamInviteEmail(ownerName: string, inviteEmail: string, role: TeamRole, inviteUrl: string): Promise<void> {
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1)
  await sendEmail({
    to: inviteEmail,
    subject: `${ownerName} invited you to GenXQR`,
    html: `
      <div style="font-family:sans-serif;max-width:620px;margin:0 auto;padding:24px;line-height:1.5">
        <h2 style="margin:0 0 8px;color:#7c3aed">You're invited to GenXQR</h2>
        <p style="margin:0 0 12px;color:#333">${ownerName} invited you as <strong>${roleLabel}</strong> to collaborate on QR projects.</p>
        <p style="margin:0 0 12px;color:#555">Use the secure invite link below. After you sign up or sign in with <strong>${inviteEmail}</strong>, you'll be able to join the team.</p>
        <a href="${inviteUrl}"
           style="display:inline-block;padding:10px 18px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
          Accept Team Invite
        </a>
      </div>
    `,
    text: `${ownerName} invited you to GenXQR as ${roleLabel}. Open ${inviteUrl} and sign in with ${inviteEmail}.`,
  })
}

async function findInviteByToken(rawToken: string) {
  const tokenHash = hashToken(rawToken)
  return prisma.teamInvite.findFirst({
    where: {
      token: tokenHash,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
      expiresAt: true,
      acceptedAt: true,
      teamId: true,
      team: {
        select: {
          ownerId: true,
          owner: { select: { name: true, email: true } },
        },
      },
    },
  })
}

async function buildTeamOverview(userId: string) {
  const { teamId, ownerId } = await getTeamForUserOverview(userId)

  const [owner, planInfo, memberRows, inviteRows] = await Promise.all([
    prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true, name: true, email: true, createdAt: true, lastLoginAt: true },
    }),
    getUserPlanLimits(ownerId),
    prisma.teamMember.findMany({
      where: { teamId },
      select: {
        joinedAt: true,
        role: true,
        user: { select: { id: true, name: true, email: true, lastLoginAt: true } },
      },
      orderBy: { joinedAt: "asc" },
    }),
    prisma.teamInvite.findMany({
      where: { teamId, acceptedAt: null },
      select: { id: true, email: true, role: true, createdAt: true, lastSentAt: true, resendCount: true },
      orderBy: { createdAt: "desc" },
    }),
  ])

  if (!owner) throw new Error("User not found")

  const members = [
    {
      id: owner.id,
      name: owner.name,
      email: owner.email,
      role: "admin" as const,
      joined: owner.createdAt.toISOString(),
      lastActive: owner.lastLoginAt?.toISOString() ?? null,
    },
    ...memberRows
      .filter((row) => row.user.id !== owner.id)
      .map((row) => ({
        id: row.user.id,
        name: row.user.name,
        email: row.user.email,
        role: apiRoleFromDb(row.role),
        joined: row.joinedAt.toISOString(),
        lastActive: row.user.lastLoginAt?.toISOString() ?? null,
      })),
  ]

  const pendingInvites = inviteRows.map((invite) => ({
    id: invite.id,
    email: invite.email,
    role: apiRoleFromDb(invite.role),
    invitedAt: invite.createdAt.toISOString(),
    lastSentAt: invite.lastSentAt.toISOString(),
    resendCount: invite.resendCount,
  }))

  return {
    members,
    pendingInvites,
    seats: {
      used: members.length + pendingInvites.length,
      limit: planInfo.limits.teamSeatsLimit,
    },
  }
}

const CreateInviteSchema = z.object({
  email: z.string().email().max(320),
  role: z.enum(["admin", "editor", "viewer"]),
})

router.get("/", requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const overview = await buildTeamOverview(uid(req))
    res.json({ success: true, data: overview })
  } catch (err) {
    next(err)
  }
})

router.get("/invites/token/:token", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rawToken = req.params["token"] as string
    const match = await findInviteByToken(rawToken)
    if (!match || match.acceptedAt) {
      res.status(404).json({ success: false, error: "Invite not found, expired, or already used" })
      return
    }

    res.json({
      success: true,
      data: {
        owner: {
          name: match.team.owner.name,
          email: match.team.owner.email,
        },
        invite: {
          email: match.email,
          role: apiRoleFromDb(match.role),
          invitedAt: match.createdAt.toISOString(),
        },
      },
    })
  } catch (err) {
    next(err)
  }
})

router.post("/invites", requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = uid(req)
    const parsed = CreateInviteSchema.parse(req.body)
    const [owner, team] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } }),
      getOrCreateOwnedTeam(userId),
    ])

    if (!owner) {
      res.status(404).json({ success: false, error: "User not found" })
      return
    }

    if (team.ownerId !== userId) {
      res.status(403).json({ success: false, error: "Only the team owner can invite members" })
      return
    }

    const planInfo = await getUserPlanLimits(userId)

    const normalizedEmail = parsed.email.toLowerCase()
    if (normalizedEmail === owner.email.toLowerCase()) {
      res.status(400).json({ success: false, error: "You are already part of this team" })
      return
    }

    const existingMemberUser = await prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } })
    if (existingMemberUser) {
      const alreadyMember = await prisma.teamMember.findFirst({
        where: { teamId: team.id, userId: existingMemberUser.id },
        select: { id: true },
      })
      if (alreadyMember) {
        res.status(409).json({ success: false, error: "This user is already a team member" })
        return
      }
    }

    const alreadyPending = await prisma.teamInvite.findFirst({
      where: { teamId: team.id, email: normalizedEmail, acceptedAt: null },
      select: { id: true },
    })
    if (alreadyPending) {
      res.status(409).json({ success: false, error: "This email already has a pending invite" })
      return
    }

    const [memberCount, pendingInviteCount] = await Promise.all([
      prisma.teamMember.count({ where: { teamId: team.id } }),
      prisma.teamInvite.count({ where: { teamId: team.id, acceptedAt: null } }),
    ])

    const seatUsed = 1 + memberCount + pendingInviteCount
    if (seatUsed >= planInfo.limits.teamSeatsLimit) {
      res.status(403).json({ success: false, error: "Team seat limit reached for your current plan" })
      return
    }

    const rawToken = generateSecureToken()
    const inviteExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000) // 7 days

    const createdInvite = await prisma.teamInvite.create({
      data: {
        teamId: team.id,
        email: normalizedEmail,
        role: dbRoleFromApi(parsed.role),
        invitedBy: userId,
        token: hashToken(rawToken),
        lastSentAt: new Date(),
        expiresAt: inviteExpiry,
      },
      select: { id: true, email: true, role: true, createdAt: true, lastSentAt: true, resendCount: true },
    })

    await sendTeamInviteEmail(owner.name, createdInvite.email, apiRoleFromDb(createdInvite.role), buildInviteUrl(rawToken))

    await prisma.auditLog.create({
      data: {
        userId,
        action: "team.invite.create",
        category: "team",
        entityType: "TeamInvite",
        entityId: createdInvite.id,
        metadata: { email: createdInvite.email, role: apiRoleFromDb(createdInvite.role) },
      },
    })

    res.status(201).json({
      success: true,
      message: "Invite sent",
      data: {
        id: createdInvite.id,
        email: createdInvite.email,
        role: apiRoleFromDb(createdInvite.role),
        invitedAt: createdInvite.createdAt.toISOString(),
        lastSentAt: createdInvite.lastSentAt.toISOString(),
        resendCount: createdInvite.resendCount,
      },
    })
  } catch (err) {
    next(err)
  }
})

router.post("/invites/:id/resend", requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = uid(req)
    const inviteId = req.params["id"] as string

    const [owner, team] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
      getOrCreateOwnedTeam(userId),
    ])

    if (!owner) {
      res.status(404).json({ success: false, error: "User not found" })
      return
    }

    if (team.ownerId !== userId) {
      res.status(403).json({ success: false, error: "Only the team owner can resend invites" })
      return
    }

    const existing = await prisma.teamInvite.findFirst({
      where: { id: inviteId, teamId: team.id, acceptedAt: null },
      select: { id: true, email: true, role: true, resendCount: true },
    })

    if (!existing) {
      res.status(404).json({ success: false, error: "Invite not found" })
      return
    }

    const rawToken = generateSecureToken()
    const inviteExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000) // reset to 7 days from now

    const updatedInvite = await prisma.teamInvite.update({
      where: { id: existing.id },
      data: {
        token: hashToken(rawToken),
        resendCount: existing.resendCount + 1,
        lastSentAt: new Date(),
        expiresAt: inviteExpiry,
      },
      select: { id: true, email: true, role: true, createdAt: true, lastSentAt: true, resendCount: true },
    })

    await sendTeamInviteEmail(owner.name, updatedInvite.email, apiRoleFromDb(updatedInvite.role), buildInviteUrl(rawToken))

    await prisma.auditLog.create({
      data: {
        userId,
        action: "team.invite.resend",
        category: "team",
        entityType: "TeamInvite",
        entityId: updatedInvite.id,
        metadata: { email: updatedInvite.email },
      },
    })

    res.json({
      success: true,
      message: "Invite resent",
      data: {
        id: updatedInvite.id,
        email: updatedInvite.email,
        role: apiRoleFromDb(updatedInvite.role),
        invitedAt: updatedInvite.createdAt.toISOString(),
        lastSentAt: updatedInvite.lastSentAt.toISOString(),
        resendCount: updatedInvite.resendCount,
      },
    })
  } catch (err) {
    next(err)
  }
})

router.delete("/invites/:id", requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = uid(req)
    const inviteId = req.params["id"] as string

    const team = await getOrCreateOwnedTeam(userId)
    if (team.ownerId !== userId) {
      res.status(403).json({ success: false, error: "Only the team owner can cancel invites" })
      return
    }

    const target = await prisma.teamInvite.findFirst({
      where: { id: inviteId, teamId: team.id, acceptedAt: null },
      select: { id: true, email: true },
    })

    if (!target) {
      res.status(404).json({ success: false, error: "Invite not found" })
      return
    }

    await prisma.teamInvite.delete({ where: { id: target.id } })

    await prisma.auditLog.create({
      data: {
        userId,
        action: "team.invite.cancel",
        category: "team",
        entityType: "TeamInvite",
        entityId: inviteId,
        metadata: { email: target.email },
      },
    })

    res.json({ success: true, message: "Invite cancelled" })
  } catch (err) {
    next(err)
  }
})

router.post("/invites/token/:token/accept", requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rawToken = req.params["token"] as string
    const currentUserId = uid(req)
    const currentUser = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { id: true, email: true, name: true },
    })

    if (!currentUser) {
      res.status(404).json({ success: false, error: "User not found" })
      return
    }

    const match = await findInviteByToken(rawToken)
    if (!match) {
      res.status(404).json({ success: false, error: "Invite not found or has expired" })
      return
    }
    if (match.acceptedAt) {
      res.status(409).json({ success: false, error: "This invite has already been accepted" })
      return
    }

    if (currentUser.email.toLowerCase() !== match.email.toLowerCase()) {
      res.status(403).json({ success: false, error: "This invite was sent to a different email address" })
      return
    }

    if (currentUser.id === match.team.ownerId) {
      res.status(400).json({ success: false, error: "Team owner cannot accept their own invite" })
      return
    }

    const alreadyMember = await prisma.teamMember.findFirst({
      where: { teamId: match.teamId, userId: currentUser.id },
      select: { id: true },
    })
    if (alreadyMember) {
      res.status(409).json({ success: false, error: "You are already part of this team" })
      return
    }

    const ownerPlan = await getUserPlanLimits(match.team.ownerId)
    const [memberCount, pendingInviteCount] = await Promise.all([
      prisma.teamMember.count({ where: { teamId: match.teamId } }),
      prisma.teamInvite.count({ where: { teamId: match.teamId, acceptedAt: null } }),
    ])
    const seatsUsed = 1 + memberCount + pendingInviteCount
    if (seatsUsed > ownerPlan.limits.teamSeatsLimit) {
      res.status(403).json({ success: false, error: "Team seat limit reached for this team" })
      return
    }

    const acceptedAt = new Date()
    try {
      await prisma.$transaction([
        prisma.teamMember.create({
          data: {
            teamId: match.teamId,
            userId: currentUser.id,
            role: match.role === "OWNER" ? "ADMIN" : match.role,
            joinedAt: acceptedAt,
          },
        }),
        prisma.teamInvite.update({
          where: { id: match.id },
          data: { acceptedAt },
        }),
      ])
    } catch (e) {
      const code = (e as { code?: unknown } | null)?.code
      if (code === "P2002") {
        res.status(409).json({ success: false, error: "You are already part of this team" })
        return
      }
      throw e
    }

    await prisma.auditLog.create({
      data: {
        userId: match.team.ownerId,
        action: "team.invite.accept",
        category: "team",
        entityType: "TeamInvite",
        entityId: match.id,
        metadata: {
          inviteEmail: match.email,
          acceptedByUserId: currentUser.id,
          acceptedByEmail: currentUser.email,
        },
      },
    })

    res.json({
      success: true,
      message: `Joined ${match.team.owner.name}'s team successfully`,
      data: {
        owner: { name: match.team.owner.name, email: match.team.owner.email },
        role: apiRoleFromDb(match.role),
      },
    })
  } catch (err) {
    next(err)
  }
})

export default router
