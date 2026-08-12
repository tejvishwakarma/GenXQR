import { z } from "zod"
import { prisma } from "../db/prisma.js"
import { AppError } from "../middleware/error.middleware.js"
import { signAccessToken } from "../utils/jwt.js"
import { hashPassword } from "../utils/password.js"
import { getUserPlanLimits } from "./billing.service.js"
import { sendEmail, buildRenewalReminderEmail, buildExpiredNoticeEmail } from "./email.service.js"
import { env } from "../config/env.js"

type AdminRole = "USER" | "ADMIN" | "SUPER_ADMIN"

export interface PaginationParams {
  page: number
  limit: number
  q?: string
}

// ─── GET /admin-api/users ──────────────────────────────────────────────────────

export async function listUsers({ page, limit, q }: PaginationParams) {
  const skip = (page - 1) * limit

  const where = q
    ? {
      OR: [
        { email: { contains: q, mode: "insensitive" as const } },
        { name: { contains: q, mode: "insensitive" as const } },
      ],
    }
    : {}

  const [total, users] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, email: true, role: true,
        emailVerified: true, createdAt: true, lastLoginAt: true,
        subscription: {
          select: { status: true, plan: { select: { name: true } } },
        },
        _count: { select: { qrCodes: true } },
      },
    }),
  ])

  return { users, total, page, limit, pages: Math.ceil(total / limit) }
}

// ─── GET /admin-api/users/:id ───────────────────────────────────────────────────

export async function getUserDetail(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, email: true, role: true,
      emailVerified: true, createdAt: true, updatedAt: true, lastLoginAt: true,
      avatarUrl: true, googleId: true,
      subscription: {
        select: {
          status: true, trialEndsAt: true, currentPeriodStart: true,
          currentPeriodEnd: true, cancelAtPeriodEnd: true,
          plan: { select: { name: true, displayName: true } },
        },
      },
      invoices: {
        orderBy: { createdAt: "desc" }, take: 10,
        select: { id: true, amount: true, currency: true, status: true, planName: true, createdAt: true },
      },
      _count: { select: { qrCodes: true, apiKeys: true } },
    },
  })

  if (!user) throw new AppError(404, "User not found")

  // Lazily apply trial-expiry downgrade (same logic as getUserPlanLimits) so
  // the admin view is consistent with what the user sees on their billing page.
  let freshSubscription = user.subscription
  if (
    user.subscription?.status === "TRIALING" &&
    user.subscription.trialEndsAt &&
    user.subscription.trialEndsAt < new Date()
  ) {
    await getUserPlanLimits(user.id) // triggers the lazy FREE downgrade in the DB
    freshSubscription = await prisma.subscription.findUnique({
      where: { userId: user.id },
      select: {
        status: true, trialEndsAt: true, currentPeriodStart: true,
        currentPeriodEnd: true, cancelAtPeriodEnd: true,
        plan: { select: { name: true, displayName: true } },
      },
    })
  }

  return { ...user, subscription: freshSubscription }
}

// ─── PATCH /admin-api/users/:id ─────────────────────────────────────────────────

const UpdateUserSchema = z.object({
  role: z.enum(["USER", "ADMIN", "SUPER_ADMIN"]).optional(),
  name: z.string().min(2).max(100).trim().optional(),
})
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>

export async function updateUser(
  adminId: string,
  adminRole: AdminRole,
  targetId: string,
  input: UpdateUserInput,
) {
  const { role, name } = input

  // Prevent self-demotion
  if (targetId === adminId) throw new AppError(400, "Cannot modify your own role")

  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { role: true } })
  if (!target) throw new AppError(404, "User not found")

  // Only SUPER_ADMINs can change SUPER_ADMIN role
  if (target.role === "SUPER_ADMIN" && adminRole !== "SUPER_ADMIN" && role !== undefined) {
    throw new AppError(403, "Only SUPER_ADMINs can modify another SUPER_ADMIN")
  }

  // Only SUPER_ADMINs may assign roles at all. Without this, a plain ADMIN
  // could promote any account (e.g. a sockpuppet USER) to SUPER_ADMIN and escalate.
  if (role !== undefined && adminRole !== "SUPER_ADMIN") {
    throw new AppError(403, "Only SUPER_ADMINs can change user roles")
  }

  const updated = await prisma.user.update({
    where: { id: targetId },
    data: { ...(role && { role }), ...(name && { name }) },
    select: { id: true, name: true, email: true, role: true },
  })

  await prisma.auditLog.create({
    data: {
      userId: adminId,
      action: "admin.user.update",
      category: "admin",
      entityId: targetId,
      entityType: "User",
      metadata: { role, name },
    },
  })

  return updated
}

// ─── PATCH /admin-api/users/:id/plan ────────────────────────────────────────────

export async function changePlan(
  callerRole: AdminRole,
  callerId: string,
  targetId: string,
  planName: "FREE" | "STARTER" | "PRO" | "BUSINESS" | "ENTERPRISE",
) {
  if (callerRole !== "SUPER_ADMIN") throw new AppError(403, "SUPER_ADMIN role required")

  const [targetUser, targetPlan] = await Promise.all([
    prisma.user.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        email: true,
        subscription: { select: { id: true, plan: { select: { name: true } } } },
      },
    }),
    prisma.plan.findUnique({ where: { name: planName } }),
  ])

  if (!targetUser) throw new AppError(404, "User not found")
  if (!targetPlan) throw new AppError(400, "Invalid target plan")

  const now = new Date()
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate())

  await prisma.subscription.upsert({
    where: { userId: targetUser.id },
    update: {
      planId: targetPlan.id,
      status: "ACTIVE",
      trialEndsAt: null,
      cancelAtPeriodEnd: false,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
    create: {
      userId: targetUser.id,
      planId: targetPlan.id,
      status: "ACTIVE",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
  })

  await prisma.auditLog.create({
    data: {
      userId: callerId,
      action: "admin.user.plan.change",
      category: "admin",
      entityId: targetUser.id,
      entityType: "User",
      metadata: {
        email: targetUser.email,
        fromPlan: targetUser.subscription?.plan.name ?? null,
        toPlan: planName,
      },
    },
  })

  return {
    userId: targetUser.id,
    plan: { name: targetPlan.name, displayName: targetPlan.displayName },
  }
}

// ─── DELETE /admin-api/users/:id ────────────────────────────────────────────────

export async function deleteUser(adminId: string, adminRole: AdminRole, targetId: string): Promise<void> {
  if (targetId === adminId) throw new AppError(400, "Cannot delete yourself")

  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { role: true, email: true } })
  if (!target) throw new AppError(404, "User not found")

  if (target.role !== "USER" && adminRole !== "SUPER_ADMIN") {
    throw new AppError(403, "Only SUPER_ADMINs can delete admin users")
  }

  await prisma.user.delete({ where: { id: targetId } })

  // Block the deleted email. Increment blockCount on each deletion.
  // After 3 blocks the entry becomes permanently banned and cannot be removed.
  const blockEntry = await prisma.blocklist.upsert({
    where: { type_value: { type: "email", value: target.email } },
    create: {
      type: "email",
      value: target.email,
      reason: "account_deleted_by_admin",
      addedBy: adminId,
      isActive: true,
      blockCount: 1,
      isPermanent: false,
    },
    update: {
      isActive: true,
      reason: "account_deleted_by_admin",
      addedBy: adminId,
      blockCount: { increment: 1 },
    },
  })
  // Escalate to permanent ban once threshold is reached
  if (blockEntry.blockCount >= 3) {
    await prisma.blocklist.update({
      where: { id: blockEntry.id },
      data: { isPermanent: true },
    })
  }

  await prisma.auditLog.create({
    data: {
      userId: adminId,
      action: "admin.user.delete",
      category: "admin",
      entityId: targetId,
      entityType: "User",
      metadata: { email: target.email },
    },
  })
}

// ─── POST /admin-api/users/:id/impersonate ──────────────────────────────────────

export async function impersonateUser(adminId: string, adminRole: AdminRole, targetId: string) {
  if (adminRole !== "SUPER_ADMIN") throw new AppError(403, "Only SUPER_ADMINs can impersonate users")

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, email: true, role: true },
  })
  if (!target) throw new AppError(404, "User not found")

  // Impersonation is for support/debugging as a regular customer, not for one
  // privileged admin to act as another — allowing that would let a SUPER_ADMIN
  // silently assume another admin's identity, attributing their actions to the
  // impersonated admin in the audit log instead of the true actor.
  if (target.role !== "USER") {
    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: "admin.user.impersonate.denied",
        category: "admin",
        entityId: targetId,
        entityType: "User",
        metadata: { targetEmail: target.email, targetRole: target.role },
      },
    })
    throw new AppError(403, "Cannot impersonate an admin account")
  }

  // 15-minute impersonation token
  const impersonationToken = signAccessToken({
    sub: target.id,
    email: target.email,
    role: target.role as AdminRole,
  })

  await prisma.auditLog.create({
    data: {
      userId: adminId,
      action: "admin.user.impersonate",
      category: "admin",
      entityId: targetId,
      entityType: "User",
      metadata: { targetEmail: target.email },
    },
  })

  return { token: impersonationToken, expiresInSeconds: 900 }
}

// ─── POST /admin-api/users/:id/verify-email ─────────────────────────────────────

export async function forceVerifyEmail(callerRole: AdminRole, callerId: string, targetId: string) {
  if (callerRole !== "SUPER_ADMIN") throw new AppError(403, "Only SUPER_ADMINs can force-verify accounts")

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, email: true, emailVerified: true },
  })
  if (!target) throw new AppError(404, "User not found")
  if (target.emailVerified) return { message: "Email already verified" }

  await prisma.user.update({ where: { id: targetId }, data: { emailVerified: true } })

  await prisma.auditLog.create({
    data: {
      userId: callerId,
      action: "admin.user.verify_email",
      category: "admin",
      entityId: targetId,
      entityType: "User",
      metadata: { targetEmail: target.email },
    },
  })

  return { message: "Email verified successfully" }
}

// ─── POST /admin-api/users/:id/password ─────────────────────────────────────────

export async function forceSetPassword(callerRole: AdminRole, callerId: string, targetId: string, password: string) {
  if (callerRole !== "SUPER_ADMIN") throw new AppError(403, "Only SUPER_ADMINs can change user passwords")

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, email: true, role: true },
  })
  if (!target) throw new AppError(404, "User not found")

  const passwordHash = await hashPassword(password)
  await prisma.user.update({ where: { id: targetId }, data: { passwordHash } })

  await prisma.auditLog.create({
    data: {
      userId: callerId,
      action: "admin.user.password_change",
      category: "admin",
      entityId: targetId,
      entityType: "User",
      metadata: { targetEmail: target.email },
    },
  })
}

// ─── POST /admin-api/users/:id/send-reminder ────────────────────────────────────

export async function sendManualReminder(callerRole: AdminRole, targetId: string) {
  if (callerRole !== "SUPER_ADMIN") throw new AppError(403, "SUPER_ADMIN role required")

  const user = await prisma.user.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      name: true,
      email: true,
      subscription: {
        select: {
          currentPeriodEnd: true,
          trialEndsAt: true,
          status: true,
          plan: { select: { displayName: true } },
        },
      },
    },
  })

  if (!user) throw new AppError(404, "User not found")
  if (!user.subscription) throw new AppError(400, "User has no active subscription")

  const now = new Date()
  const paymentUrl = `${env.FRONTEND_URL}/app/billing`
  const sub = user.subscription
  const planName = sub.plan.displayName

  // Determine expiry date — for trialing users use trialEndsAt, otherwise currentPeriodEnd
  const expiryDate = sub.status === "TRIALING" && sub.trialEndsAt ? sub.trialEndsAt : sub.currentPeriodEnd

  const msLeft = expiryDate.getTime() - now.getTime()
  const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24))
  const expired = daysLeft <= 0

  const expiryDateStr = expiryDate.toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric",
  })

  const html = expired
    ? buildExpiredNoticeEmail(user.name ?? "there", planName, paymentUrl)
    : buildRenewalReminderEmail(user.name ?? "there", daysLeft, planName, expiryDateStr, paymentUrl)

  const subject = expired
    ? `Your ${planName} plan has expired — GenXQR`
    : `Your ${planName} plan expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""} — GenXQR`

  await sendEmail({ to: user.email, subject, html })

  await prisma.emailLog.create({
    data: {
      userId: user.id,
      to: user.email,
      subject,
      template: expired ? "manual-expired-notice" : "manual-renewal-reminder",
      status: "sent",
      provider: "admin-manual",
    },
  })

  return { message: `Reminder sent to ${user.email}` }
}
