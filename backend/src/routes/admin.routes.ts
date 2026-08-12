/**
 * Admin API Routes — /admin-api/*
 *
 * All routes require the ADMIN or SUPER_ADMIN role (enforced by requireAdmin middleware).
 *
 * GET  /admin-api/dashboard          – platform-wide metrics
 * GET  /admin-api/users              – paginated user list
 * GET  /admin-api/users/:id          – full user detail
 * PATCH /admin-api/users/:id         – update role / suspend
 * PATCH /admin-api/users/:id/plan    – force change subscription plan (SUPER_ADMIN)
 * DELETE /admin-api/users/:id        – GDPR hard-delete
 * POST  /admin-api/users/:id/impersonate – short-lived impersonation token
 * GET  /admin-api/qr-codes           – paginated QR list
 * PATCH /admin-api/qr-codes/:id/deactivate – force deactivate
 * DELETE /admin-api/qr-codes/:id     – hard-delete
 * GET  /admin-api/analytics/signups  – signup trend (30 days)
 * GET  /admin-api/analytics/scans    – platform-wide scan trend (30 days)
 * GET  /admin-api/revenue            – MRR / ARR + recent invoices
 * GET  /admin-api/storage            – storage usage totals + by user
 * POST /admin-api/storage/cleanup-orphans – delete QRFile rows with no parent QR
 * GET  /admin-api/audit              – paginated audit log
 */

import path_mod from "path"
import fs_mod from "fs"
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import { z } from "zod"
import { requireAdmin } from "../middleware/admin.middleware.js"
import { prisma } from "../db/prisma.js"
import { signAccessToken } from "../utils/jwt.js"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { getUserPlanLimits } from "../services/billing.service.js"
import { sendEmail, buildBroadcastEmail } from "../services/email.service.js"
import { hashPassword } from "../utils/password.js"
import { broadcastNotification } from "../services/notification.service.js"
import type { NotificationType } from "@prisma/client"
import { env } from "../config/env.js"
import { redis } from "../redis/client.js"
import { scanQueue } from "../services/scan.service.js"

const router: IRouter = Router()

// Apply admin guard to every route in this file
router.use(requireAdmin)

/** Extract authenticated user ID from the request */
const uid = (req: Request): string => (req.user as unknown as AccessTokenPayload).sub

// ─── Pagination helper ────────────────────────────────────────────────────────

const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().max(200).optional(),
})

// ─── Dashboard metrics ────────────────────────────────────────────────────────

/**
 * GET /admin-api/dashboard
 * Returns an overview of platform-wide KPIs.
 */
router.get(
  "/dashboard",
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const [
        totalUsers,
        activeSubscriptions,
        totalQRCodes,
        scansToday,
        totalScans,
        revenueResult,
        storageResult,
      ] = await prisma.$transaction([
        prisma.user.count(),
        prisma.subscription.count({
          where: { status: { in: ["ACTIVE", "TRIALING"] } },
        }),
        prisma.qRCode.count(),
        prisma.qRScan.count({ where: { scannedAt: { gte: todayStart } } }),
        prisma.qRScan.count(),
        prisma.invoice.aggregate({
          _sum: { amount: true },
          where: {
            status: "paid",
            periodEnd: { gte: new Date() },
          },
        }),
        prisma.qRFile.aggregate({ _sum: { sizeBytes: true } }),
      ])

      // MRR in INR rupees (amounts stored in paise)
      const mrr = Math.round((revenueResult._sum.amount ?? 0) / 100)
      const storageBytes = Number(storageResult._sum.sizeBytes ?? 0)
      const storageGB = parseFloat((storageBytes / 1_073_741_824).toFixed(3))

      // Recent signups — last 5 users (for dashboard activity feed)
      const recentSignups = await prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true, name: true, email: true, createdAt: true,
          subscription: { select: { plan: { select: { name: true, displayName: true } } } },
        },
      })

      res.json({
        success: true,
        data: { totalUsers, activeSubscriptions, totalQRCodes, scansToday, totalScans, mrr, storageGB, recentSignups },
      })
    } catch (err) {
      next(err)
    }
  },
)

// ─── System health ──────────────────────────────────────────────────────────

/**
 * Bounds a probe so a hung/partitioned dependency reports "down" quickly instead
 * of leaving the whole request (and the dashboard UI) hanging on stale data.
 */
function withTimeout<T>(probe: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    probe,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("probe timed out")), ms)),
  ])
}

const HEALTH_PROBE_TIMEOUT_MS = 3000

/**
 * GET /admin-api/system-health
 * Live status of core infrastructure (database, Redis, scan queue) plus API
 * process metrics. SUPER_ADMIN only — exposes internal operational detail.
 * Each probe is isolated so one failure never takes down the whole response.
 */
router.get(
  "/system-health",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const callerRole = (req.user as unknown as AccessTokenPayload).role
      if (callerRole !== "SUPER_ADMIN") {
        res.status(403).json({ success: false, error: "SUPER_ADMIN role required" })
        return
      }

      // Database liveness + round-trip latency
      let database: { status: "up" | "down"; latencyMs: number | null } = { status: "down", latencyMs: null }
      try {
        const start = Date.now()
        await withTimeout(prisma.$queryRaw`SELECT 1`, HEALTH_PROBE_TIMEOUT_MS)
        database = { status: "up", latencyMs: Date.now() - start }
      } catch { /* leave as down */ }

      // Redis liveness + round-trip latency
      let redisHealth: { status: "up" | "down"; latencyMs: number | null } = { status: "down", latencyMs: null }
      try {
        const start = Date.now()
        const pong = await withTimeout(redis.ping(), HEALTH_PROBE_TIMEOUT_MS)
        redisHealth = { status: pong === "PONG" ? "up" : "down", latencyMs: Date.now() - start }
      } catch { /* leave as down */ }

      // Scan queue depth (BullMQ)
      let queue: { status: "up" | "down"; waiting: number; active: number; failed: number; delayed: number } = {
        status: "down", waiting: 0, active: 0, failed: 0, delayed: 0,
      }
      try {
        const counts = await withTimeout(
          scanQueue.getJobCounts("waiting", "active", "failed", "delayed"),
          HEALTH_PROBE_TIMEOUT_MS,
        )
        queue = {
          status: "up",
          waiting: counts["waiting"] ?? 0,
          active: counts["active"] ?? 0,
          failed: counts["failed"] ?? 0,
          delayed: counts["delayed"] ?? 0,
        }
      } catch { /* leave as down */ }

      const mem = process.memoryUsage()
      const toMB = (bytes: number): number => Math.round(bytes / 1_048_576)
      const processInfo = {
        uptimeSec: Math.round(process.uptime()),
        memoryMB: { rss: toMB(mem.rss), heapUsed: toMB(mem.heapUsed), heapTotal: toMB(mem.heapTotal) },
        nodeVersion: process.version,
        environment: env.NODE_ENV,
      }

      // Overall: the database is critical (down => down); any other failure => degraded.
      const overall: "healthy" | "degraded" | "down" =
        database.status === "down"
          ? "down"
          : redisHealth.status === "up" && queue.status === "up"
            ? "healthy"
            : "degraded"

      res.json({
        success: true,
        data: { overall, database, redis: redisHealth, queue, process: processInfo, checkedAt: new Date().toISOString() },
      })
    } catch (err) {
      next(err)
    }
  },
)

// ─── Users ────────────────────────────────────────────────────────────────────

/**
 * GET /admin-api/users?page=1&limit=20&q=<search>
 * Paginated list of all users with plan and subscription info.
 */
router.get(
  "/users",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, limit, q } = PaginationSchema.parse(req.query)
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

      res.json({ success: true, data: users, meta: { total, page, limit, pages: Math.ceil(total / limit) } })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * GET /admin-api/users/:id
 * Full detail for a single user.
 */
router.get(
  "/users/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params["id"] as string },
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

      if (!user) {
        res.status(404).json({ success: false, error: "User not found" })
        return
      }

      // Lazily apply trial-expiry downgrade (same logic as getUserPlanLimits)
      // so the admin view is consistent with what the user sees on their billing page.
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

      res.json({ success: true, data: { ...user, subscription: freshSubscription } })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * PATCH /admin-api/users/:id
 * Update a user's role or suspend them.
 * Admins cannot promote themselves or demote SUPER_ADMINs (unless they are also SUPER_ADMIN).
 */
router.patch(
  "/users/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminId = uid(req)
      const adminPayload = req.user as unknown as AccessTokenPayload
      const targetId = req.params["id"] as string

      const UpdateSchema = z.object({
        role: z.enum(["USER", "ADMIN", "SUPER_ADMIN"]).optional(),
        name: z.string().min(2).max(100).trim().optional(),
      })

      const { role, name } = UpdateSchema.parse(req.body)

      // Prevent self-demotion
      if (targetId === adminId) {
        res.status(400).json({ success: false, error: "Cannot modify your own role" })
        return
      }

      const target = await prisma.user.findUnique({ where: { id: targetId }, select: { role: true } })
      if (!target) {
        res.status(404).json({ success: false, error: "User not found" })
        return
      }

      // Only SUPER_ADMINs can change SUPER_ADMIN role
      if (
        target.role === "SUPER_ADMIN" &&
        adminPayload.role !== "SUPER_ADMIN" &&
        role !== undefined
      ) {
        res.status(403).json({ success: false, error: "Only SUPER_ADMINs can modify another SUPER_ADMIN" })
        return
      }

      // Only SUPER_ADMINs may assign roles at all. Without this, a plain ADMIN could
      // promote any account (e.g. a sockpuppet USER) to SUPER_ADMIN and escalate.
      if (role !== undefined && adminPayload.role !== "SUPER_ADMIN") {
        res.status(403).json({ success: false, error: "Only SUPER_ADMINs can change user roles" })
        return
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

      res.json({ success: true, data: updated })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * PATCH /admin-api/users/:id/plan
 * Force-set a user's plan (SUPER_ADMIN only).
 */
router.patch(
  "/users/:id/plan",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const caller = req.user as unknown as AccessTokenPayload
      if (caller.role !== "SUPER_ADMIN") {
        res.status(403).json({ success: false, error: "SUPER_ADMIN role required" })
        return
      }

      const targetId = req.params["id"] as string
      const BodySchema = z.object({
        planName: z.enum(["FREE", "STARTER", "PRO", "BUSINESS", "ENTERPRISE"]),
      })
      const { planName } = BodySchema.parse(req.body)

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

      if (!targetUser) {
        res.status(404).json({ success: false, error: "User not found" })
        return
      }

      if (!targetPlan) {
        res.status(400).json({ success: false, error: "Invalid target plan" })
        return
      }

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
          userId: caller.sub,
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

      res.json({
        success: true,
        data: {
          userId: targetUser.id,
          plan: { name: targetPlan.name, displayName: targetPlan.displayName },
        },
      })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * DELETE /admin-api/users/:id
 * GDPR-compliant hard-delete of a user and all their data (cascade).
 * Only SUPER_ADMIN can delete ADMIN+ users.
 */
router.delete(
  "/users/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminId = uid(req)
      const adminPayload = req.user as unknown as AccessTokenPayload
      const targetId = req.params["id"] as string

      if (targetId === adminId) {
        res.status(400).json({ success: false, error: "Cannot delete yourself" })
        return
      }

      const target = await prisma.user.findUnique({ where: { id: targetId }, select: { role: true, email: true } })
      if (!target) {
        res.status(404).json({ success: false, error: "User not found" })
        return
      }

      if (target.role !== "USER" && adminPayload.role !== "SUPER_ADMIN") {
        res.status(403).json({ success: false, error: "Only SUPER_ADMINs can delete admin users" })
        return
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

      res.json({ success: true, message: "User deleted" })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * POST /admin-api/users/:id/impersonate
 * Issues a short-lived (15-minute) access token for the target user.
 * Only SUPER_ADMINs may impersonate.
 */
router.post(
  "/users/:id/impersonate",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminPayload = req.user as unknown as AccessTokenPayload
      if (adminPayload.role !== "SUPER_ADMIN") {
        res.status(403).json({ success: false, error: "Only SUPER_ADMINs can impersonate users" })
        return
      }

      const targetId = req.params["id"] as string
      const target = await prisma.user.findUnique({
        where: { id: targetId },
        select: { id: true, email: true, role: true },
      })

      if (!target) {
        res.status(404).json({ success: false, error: "User not found" })
        return
      }

      // Impersonation is for support/debugging as a regular customer, not for
      // one privileged admin to act as another — allowing that would let a
      // SUPER_ADMIN silently assume another admin's identity, attributing
      // their actions to the impersonated admin in the audit log instead of
      // the true actor.
      if (target.role !== "USER") {
        await prisma.auditLog.create({
          data: {
            userId: adminPayload.sub,
            action: "admin.user.impersonate.denied",
            category: "admin",
            entityId: targetId,
            entityType: "User",
            metadata: { targetEmail: target.email, targetRole: target.role },
          },
        })
        res.status(403).json({ success: false, error: "Cannot impersonate an admin account" })
        return
      }

      // 15-minute impersonation token
      const impersonationToken = signAccessToken({
        sub: target.id,
        email: target.email,
        role: target.role as "USER" | "ADMIN" | "SUPER_ADMIN",
      })

      await prisma.auditLog.create({
        data: {
          userId: adminPayload.sub,
          action: "admin.user.impersonate",
          category: "admin",
          entityId: targetId,
          entityType: "User",
          metadata: { targetEmail: target.email },
        },
      })

      res.json({ success: true, data: { token: impersonationToken, expiresInSeconds: 900 } })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * POST /admin-api/users/:id/verify-email
 * Force-verify a user's email address (SUPER_ADMIN only).
 */
router.post(
  "/users/:id/verify-email",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const caller = req.user as unknown as AccessTokenPayload
      if (caller.role !== "SUPER_ADMIN") {
        res.status(403).json({ success: false, error: "Only SUPER_ADMINs can force-verify accounts" })
        return
      }

      const targetId = req.params["id"] as string
      const target = await prisma.user.findUnique({
        where: { id: targetId },
        select: { id: true, email: true, emailVerified: true },
      })
      if (!target) {
        res.status(404).json({ success: false, error: "User not found" })
        return
      }
      if (target.emailVerified) {
        res.json({ success: true, message: "Email already verified" })
        return
      }

      await prisma.user.update({
        where: { id: targetId },
        data: { emailVerified: true },
      })

      await prisma.auditLog.create({
        data: {
          userId: caller.sub,
          action: "admin.user.verify_email",
          category: "admin",
          entityId: targetId,
          entityType: "User",
          metadata: { targetEmail: target.email },
        },
      })

      res.json({ success: true, message: "Email verified successfully" })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * POST /admin-api/users/:id/password
 * Force-set a user's password (SUPER_ADMIN only).
 */
router.post(
  "/users/:id/password",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const caller = req.user as unknown as AccessTokenPayload
      if (caller.role !== "SUPER_ADMIN") {
        res.status(403).json({ success: false, error: "Only SUPER_ADMINs can change user passwords" })
        return
      }

      const targetId = req.params["id"] as string
      const { password } = z.object({
        password: z.string().min(8, "Password must be at least 8 characters"),
      }).parse(req.body)

      const target = await prisma.user.findUnique({
        where: { id: targetId },
        select: { id: true, email: true, role: true },
      })
      if (!target) {
        res.status(404).json({ success: false, error: "User not found" })
        return
      }

      const passwordHash = await hashPassword(password)
      await prisma.user.update({
        where: { id: targetId },
        data: { passwordHash },
      })

      await prisma.auditLog.create({
        data: {
          userId: caller.sub,
          action: "admin.user.password_change",
          category: "admin",
          entityId: targetId,
          entityType: "User",
          metadata: { targetEmail: target.email },
        },
      })

      res.json({ success: true, message: "Password updated successfully" })
    } catch (err) {
      next(err)
    }
  },
)

// ─── QR Codes ─────────────────────────────────────────────────────────────────

/**
 * GET /admin-api/qr-codes?page=1&limit=20&q=<search>
 */
router.get(
  "/qr-codes",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, limit, q } = PaginationSchema.parse(req.query)
      const skip = (page - 1) * limit

      const where = q
        ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { slug: { contains: q, mode: "insensitive" as const } },
          ],
        }
        : {}

      const [total, codes] = await prisma.$transaction([
        prisma.qRCode.count({ where }),
        prisma.qRCode.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          select: {
            id: true, name: true, slug: true, type: true, category: true,
            isActive: true, scanCount: true, createdAt: true,
            user: { select: { id: true, name: true, email: true } },
          },
        }),
      ])

      res.json({ success: true, data: codes, meta: { total, page, limit, pages: Math.ceil(total / limit) } })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * PATCH /admin-api/qr-codes/:id/deactivate
 * Force-deactivate a QR code (e.g. abuse / DMCA).
 */
router.patch(
  "/qr-codes/:id/deactivate",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const qrId = req.params["id"] as string
      const qr = await prisma.qRCode.findUnique({ where: { id: qrId }, select: { id: true } })
      if (!qr) {
        res.status(404).json({ success: false, error: "QR code not found" })
        return
      }

      await prisma.qRCode.update({ where: { id: qrId }, data: { isActive: false } })

      await prisma.auditLog.create({
        data: {
          userId: uid(req),
          action: "admin.qr.deactivate",
          category: "admin",
          entityId: qrId,
          entityType: "QRCode",
        },
      })

      res.json({ success: true, message: "QR code deactivated" })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * DELETE /admin-api/qr-codes/:id
 * Permanently delete a QR code.
 */
router.delete(
  "/qr-codes/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const qrId = req.params["id"] as string
      const qr = await prisma.qRCode.findUnique({ where: { id: qrId }, select: { id: true } })
      if (!qr) {
        res.status(404).json({ success: false, error: "QR code not found" })
        return
      }

      await prisma.qRCode.delete({ where: { id: qrId } })

      await prisma.auditLog.create({
        data: {
          userId: uid(req),
          action: "admin.qr.delete",
          category: "admin",
          entityId: qrId,
          entityType: "QRCode",
        },
      })

      res.json({ success: true, message: "QR code deleted" })
    } catch (err) {
      next(err)
    }
  },
)

// ─── Analytics ────────────────────────────────────────────────────────────────

/**
 * GET /admin-api/analytics/signups?days=30
 * Daily signup counts for the last N days.
 */
router.get(
  "/analytics/signups",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const days = Math.min(Number(req.query["days"] ?? 30), 365)
      const since = new Date(Date.now() - days * 86_400_000)

      const rows = await prisma.user.groupBy({
        by: ["createdAt"],
        where: { createdAt: { gte: since } },
        _count: { id: true },
        orderBy: { createdAt: "asc" },
      })

      // Bucket into calendar dates
      const buckets: Record<string, number> = {}
      for (const row of rows) {
        const date = row.createdAt.toISOString().slice(0, 10)
        buckets[date] = (buckets[date] ?? 0) + row._count.id
      }

      const series = Object.entries(buckets).map(([date, count]) => ({ date, count }))
      res.json({ success: true, data: series })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * GET /admin-api/analytics/scans?days=30
 * Daily platform-wide scan counts for the last N days.
 */
router.get(
  "/analytics/scans",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const days = Math.min(Number(req.query["days"] ?? 30), 365)
      const since = new Date(Date.now() - days * 86_400_000)

      const rows = await prisma.qRScanDaily.groupBy({
        by: ["date"],
        where: { date: { gte: since } },
        _sum: { count: true },
        orderBy: { date: "asc" },
      })

      const series = rows.map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        count: r._sum.count ?? 0,
      }))

      res.json({ success: true, data: series })
    } catch (err) {
      next(err)
    }
  },
)

// ─── Revenue ──────────────────────────────────────────────────────────────────

/**
 * GET /admin-api/revenue?page=1&limit=20
 * MRR/ARR summary plus paginated invoice list.
 */
router.get(
  "/revenue",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, limit } = PaginationSchema.parse(req.query)
      const skip = (page - 1) * limit

      const [mrrResult, arrResult, total, invoices] = await prisma.$transaction([
        // MRR = sum of active subscriptions' current-period amounts (normalised to monthly)
        prisma.invoice.aggregate({
          _sum: { amount: true },
          where: {
            status: "paid",
            periodEnd: { gte: new Date() },
            billingCycle: "monthly",
          },
        }),
        prisma.invoice.aggregate({
          _sum: { amount: true },
          where: {
            status: "paid",
            periodEnd: { gte: new Date() },
            billingCycle: "yearly",
          },
        }),
        prisma.invoice.count(),
        prisma.invoice.findMany({
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          select: {
            id: true, amount: true, currency: true, status: true,
            planName: true, billingCycle: true, createdAt: true,
            user: { select: { id: true, name: true, email: true } },
          },
        }),
      ])

      const mrr = Math.round((mrrResult._sum.amount ?? 0) / 100) +
        Math.round((arrResult._sum.amount ?? 0) / 100 / 12)
      const arr = mrr * 12

      res.json({
        success: true,
        data: { mrr, arr, invoices },
        meta: { total, page, limit, pages: Math.ceil(total / limit) },
      })
    } catch (err) {
      next(err)
    }
  },
)

// ─── Additional Analytics Endpoints ──────────────────────────────────────────

/**
 * GET /admin-api/analytics/static-qr?days=30
 * Static QR generation counts by type from the StaticQRGeneration table.
 */
router.get(
  "/analytics/static-qr",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const days = Math.min(Number(req.query["days"] ?? 30), 365)
      const since = new Date(Date.now() - days * 86_400_000)

      const rows = await prisma.staticQRGeneration.groupBy({
        by: ["type"],
        where: { createdAt: { gte: since } },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
      })

      const totalGenerations = await prisma.staticQRGeneration.count({
        where: { createdAt: { gte: since } },
      })

      const series = rows.map((r) => ({
        type: r.type,
        count: (r._count as { id: number }).id,
      }))

      res.json({ success: true, data: { series, total: totalGenerations, days } })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * GET /admin-api/analytics/revenue-trend?days=90
 * Daily paid invoice totals for the last N days.
 */
router.get(
  "/analytics/revenue-trend",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const days = Math.min(Number(req.query["days"] ?? 90), 365)
      const since = new Date(Date.now() - days * 86_400_000)

      const rows = await prisma.invoice.findMany({
        where: { status: "paid", createdAt: { gte: since } },
        select: { createdAt: true, amount: true },
        orderBy: { createdAt: "asc" },
      })

      // Bucket into calendar dates
      const buckets: Record<string, number> = {}
      for (const row of rows) {
        const date = row.createdAt.toISOString().slice(0, 10)
        buckets[date] = (buckets[date] ?? 0) + Math.round(row.amount / 100)
      }

      const series = Object.entries(buckets).map(([date, amount]) => ({ date, amount }))
      res.json({ success: true, data: series })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * GET /admin-api/analytics/plan-breakdown
 * Count of active subscriptions per plan.
 */
router.get(
  "/analytics/plan-breakdown",
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rows = await prisma.subscription.groupBy({
        by: ["planId"],
        where: { status: { in: ["ACTIVE", "TRIALING"] } },
        _count: { userId: true },
      })

      // Resolve plan names
      const planIds = rows.map((r) => r.planId)
      const plans = await prisma.plan.findMany({
        where: { id: { in: planIds } },
        select: { id: true, name: true, displayName: true },
      })
      const planMap = Object.fromEntries(plans.map((p) => [p.id, p]))

      const series = rows.map((r) => ({
        planName: planMap[r.planId]?.name ?? "UNKNOWN",
        displayName: planMap[r.planId]?.displayName ?? r.planId,
        count: (r._count as { userId: number }).userId,
      }))

      res.json({ success: true, data: series })
    } catch (err) {
      next(err)
    }
  },
)

// ─── Storage ──────────────────────────────────────────────────────────────────

/**
 * GET /admin-api/storage
 * Platform-wide storage usage totals + top-10 users by storage.
 */
router.get(
  "/storage",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const [totalResult, byType, topUsers] = await prisma.$transaction([
        prisma.qRFile.aggregate({ _sum: { sizeBytes: true } }),
        prisma.qRFile.groupBy({
          by: ["fileType"],
          _sum: { sizeBytes: true },
          _count: { id: true },
          orderBy: { _sum: { sizeBytes: "desc" } },
        }),
        prisma.qRFile.groupBy({
          by: ["qrId"],
          _sum: { sizeBytes: true },
          orderBy: { _sum: { sizeBytes: "desc" } },
          take: 10,
        }),
      ])

      const totalBytes = Number(totalResult._sum.sizeBytes ?? 0)

      const byTypeFormatted = byType.map((row) => ({
        type: row.fileType,
        count: (row._count as { id?: number })?.id ?? 0,
        bytes: Number((row._sum as { sizeBytes?: bigint | null })?.sizeBytes ?? 0),
      }))

      res.json({
        success: true,
        data: {
          totalBytes,
          totalGB: parseFloat((totalBytes / 1_073_741_824).toFixed(3)),
          byType: byTypeFormatted,
          topQRsByStorage: topUsers.map((r) => ({
            qrId: r.qrId,
            bytes: Number((r._sum as { sizeBytes?: bigint | null })?.sizeBytes ?? 0),
          })),
        },
      })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * POST /admin-api/storage/cleanup-orphans
 * Deletes QRFile rows whose parent QRCode no longer exists.
 * Only SUPER_ADMIN may run this.
 */
router.post(
  "/storage/cleanup-orphans",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminPayload = req.user as unknown as AccessTokenPayload
      if (adminPayload.role !== "SUPER_ADMIN") {
        res.status(403).json({ success: false, error: "Only SUPER_ADMINs can run storage cleanup" })
        return
      }

      // Cascade deletion means true orphans are rare, but we use a raw query
      // to find any QRFile rows whose parent QR has been hard-deleted externally.
      const orphanRows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT f.id FROM qr_files f
        LEFT JOIN qr_codes qr ON qr.id = f.qr_id
        WHERE qr.id IS NULL
      `

      const ids = orphanRows.map((o) => o.id)

      if (ids.length === 0) {
        res.json({ success: true, data: { deleted: 0 } })
        return
      }

      await prisma.qRFile.deleteMany({ where: { id: { in: ids } } })

      await prisma.auditLog.create({
        data: {
          userId: uid(req),
          action: "admin.storage.cleanup",
          category: "admin",
          metadata: { deletedCount: ids.length },
        },
      })

      res.json({ success: true, data: { deleted: ids.length } })
    } catch (err) {
      next(err)
    }
  },
)

// ─── Audit Log ────────────────────────────────────────────────────────────────

/**
 * GET /admin-api/audit
 * Query params: page, limit, q (action text), category, userId, userEmail, dateFrom, dateTo, ip
 */
router.get(
  "/audit",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, limit } = PaginationSchema.parse(req.query)
      const q = req.query["q"] as string | undefined
      const category = req.query["category"] as string | undefined
      const userId = req.query["userId"] as string | undefined
      const userEmail = req.query["userEmail"] as string | undefined
      const dateFrom = req.query["dateFrom"] as string | undefined
      const dateTo = req.query["dateTo"] as string | undefined
      const ip = req.query["ip"] as string | undefined
      const skip = (page - 1) * limit

      // Build dynamic where clause
      const where: Record<string, unknown> = {}
      if (q) where["action"] = { contains: q, mode: "insensitive" }
      if (userId) where["userId"] = userId
      if (ip) where["ip"] = { contains: ip }

      // Category filter: match explicit category field OR legacy "system" rows whose
      // action starts with the category prefix (e.g. "admin." for category "admin").
      // This handles rows written before the category column was enforced.
      if (category) {
        where["OR"] = [
          { category },
          { category: "system", action: { startsWith: `${category}.`, mode: "insensitive" } },
        ]
      }

      // Date range
      if (dateFrom || dateTo) {
        where["createdAt"] = {
          ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
          ...(dateTo ? { lte: new Date(new Date(dateTo).setHours(23, 59, 59, 999)) } : {}),
        }
      }

      // Filter by user email (requires join-style where)
      if (userEmail) {
        where["user"] = { email: { contains: userEmail, mode: "insensitive" } }
      }

      const [total, logs] = await prisma.$transaction([
        prisma.auditLog.count({ where }),
        prisma.auditLog.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          select: {
            id: true, action: true, category: true, entityId: true, entityType: true,
            metadata: true, ip: true, userAgent: true, createdAt: true,
            user: { select: { id: true, name: true, email: true } },
          },
        }),
      ])

      res.json({ success: true, data: logs, meta: { total, page, limit, pages: Math.ceil(total / limit) } })
    } catch (err) {
      next(err)
    }
  },
)

// ─── Subscriptions ────────────────────────────────────────────────────────────

/**
 * GET /admin-api/subscriptions?page&limit&status&plan
 */
router.get(
  "/subscriptions",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, limit } = PaginationSchema.parse(req.query)
      const status = req.query["status"] as string | undefined
      const plan = req.query["plan"] as string | undefined
      const skip = (page - 1) * limit

      const where: Record<string, unknown> = {}
      if (status) where["status"] = status
      if (plan) where["plan"] = { name: plan }

      const [total, subs] = await prisma.$transaction([
        prisma.subscription.count({ where }),
        prisma.subscription.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          select: {
            id: true, status: true, trialEndsAt: true,
            currentPeriodStart: true, currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            createdAt: true, updatedAt: true,
            plan: { select: { name: true, displayName: true, priceMonthlyINR: true } },
            user: { select: { id: true, name: true, email: true } },
          },
        }),
      ])

      // Attach last reminder sent for each subscription
      const subIds = subs.map((s) => s.id)
      const lastReminders = await prisma.renewalReminder.findMany({
        where: { subscriptionId: { in: subIds } },
        orderBy: { sentAt: "desc" },
        select: { subscriptionId: true, reminderType: true, sentAt: true, status: true },
      })

      // Keep only the most-recent reminder per subscription
      const lastReminderMap = new Map<string, { reminderType: string; sentAt: Date; status: string }>()
      for (const r of lastReminders) {
        if (!lastReminderMap.has(r.subscriptionId)) {
          lastReminderMap.set(r.subscriptionId, { reminderType: r.reminderType, sentAt: r.sentAt, status: r.status })
        }
      }

      const data = subs.map((s) => ({
        ...s,
        lastReminder: lastReminderMap.get(s.id) ?? null,
      }))

      res.json({ success: true, data, meta: { total, page, limit, pages: Math.ceil(total / limit) } })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * POST /admin-api/subscriptions/send-reminders
 * Body: { subscriptionIds: string[] }
 * Sends a manual renewal reminder email to the owners of each subscription.
 */
router.post(
  "/subscriptions/send-reminders",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const callerPayload = req.user as unknown as AccessTokenPayload
      if (callerPayload.role !== "SUPER_ADMIN") {
        res.status(403).json({ success: false, error: "SUPER_ADMIN role required" })
        return
      }

      const { subscriptionIds } = z.object({
        subscriptionIds: z.array(z.string()).min(1).max(200),
      }).parse(req.body)

      const { sendManualReminders } = await import("../services/renewal-reminder.service.js")
      const result = await sendManualReminders(subscriptionIds)

      res.json({ success: true, ...result })
    } catch (err) {
      next(err)
    }
  },
)

// ─── Payments ─────────────────────────────────────────────────────────────────

/**
 * GET /admin-api/payments?page&limit&status
 */
router.get(
  "/payments",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, limit } = PaginationSchema.parse(req.query)
      const status = req.query["status"] as string | undefined
      const skip = (page - 1) * limit

      const where: Record<string, unknown> = {}
      if (status) where["status"] = status

      const [total, invoices] = await prisma.$transaction([
        prisma.invoice.count({ where }),
        prisma.invoice.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          select: {
            id: true, amount: true, currency: true, status: true,
            planName: true, billingCycle: true, periodStart: true,
            periodEnd: true, createdAt: true,
            payuPaymentId: true, payuTxnId: true,
            user: { select: { id: true, name: true, email: true } },
          },
        }),
      ])

      res.json({ success: true, data: invoices, meta: { total, page, limit, pages: Math.ceil(total / limit) } })
    } catch (err) {
      next(err)
    }
  },
)

// ─── Abuse & Moderation ───────────────────────────────────────────────────────

/**
 * GET /admin-api/abuse/reports?page&limit&resolved=false
 */
router.get(
  "/abuse/reports",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, limit } = PaginationSchema.parse(req.query)
      const resolvedParam = req.query["resolved"]
      const skip = (page - 1) * limit

      const where: Record<string, unknown> = {}
      if (resolvedParam !== undefined) where["isResolved"] = resolvedParam === "true"

      const [total, reports] = await prisma.$transaction([
        prisma.abuseReport.count({ where }),
        prisma.abuseReport.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          select: {
            id: true, reason: true, url: true, reportedBy: true,
            isResolved: true, adminNotes: true, resolvedAt: true, resolvedBy: true, createdAt: true,
            qrCode: { select: { id: true, name: true, slug: true, isActive: true, userId: true } },
          },
        }),
      ])

      // Enrich with reporter + QR-owner user data (no schema relation — batch lookup)
      const userIds = new Set<string>()
      reports.forEach((r) => {
        if (r.reportedBy) userIds.add(r.reportedBy)
        if (r.qrCode.userId) userIds.add(r.qrCode.userId)
        if (r.resolvedBy) userIds.add(r.resolvedBy)
      })
      const users = userIds.size
        ? await prisma.user.findMany({
          where: { id: { in: [...userIds] } },
          select: { id: true, name: true, email: true },
        })
        : []
      const userMap = Object.fromEntries(users.map((u) => [u.id, u]))

      const enriched = reports.map((r) => ({
        ...r,
        reporter: r.reportedBy ? (userMap[r.reportedBy] ?? null) : null,
        qrOwner: r.qrCode.userId ? (userMap[r.qrCode.userId] ?? null) : null,
        resolvedByUser: r.resolvedBy ? (userMap[r.resolvedBy] ?? null) : null,
      }))

      res.json({ success: true, data: enriched, meta: { total, page, limit, pages: Math.ceil(total / limit) } })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * POST /admin-api/abuse/reports/:id/resolve
 */
router.post(
  "/abuse/reports/:id/resolve",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { adminNotes } = z.object({ adminNotes: z.string().max(2000).optional() }).parse(req.body)
      const updated = await prisma.abuseReport.update({
        where: { id: req.params["id"] as string },
        data: { isResolved: true, resolvedAt: new Date(), resolvedBy: uid(req), adminNotes },
      })
      res.json({ success: true, data: updated })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * GET /admin-api/abuse/blocklist?page&limit&type
 */
router.get(
  "/abuse/blocklist",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, limit } = PaginationSchema.parse(req.query)
      const type = req.query["type"] as string | undefined
      const skip = (page - 1) * limit

      const where: Record<string, unknown> = { isActive: true }
      if (type) where["type"] = type

      const [total, entries] = await prisma.$transaction([
        prisma.blocklist.count({ where }),
        prisma.blocklist.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" } }),
      ])

      res.json({ success: true, data: entries, meta: { total, page, limit, pages: Math.ceil(total / limit) } })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * POST /admin-api/abuse/blocklist
 */
router.post(
  "/abuse/blocklist",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const BlocklistSchema = z.object({
        type: z.enum(["domain", "ip", "email", "user"]),
        value: z.string().min(1).max(500),
        reason: z.string().max(500).optional(),
      })
      const { type, value, reason } = BlocklistSchema.parse(req.body)
      const entry = await prisma.blocklist.upsert({
        where: { type_value: { type, value } },
        update: { isActive: true, reason, addedBy: uid(req) },
        create: { type, value, reason, addedBy: uid(req), isActive: true },
      })
      res.status(201).json({ success: true, data: entry })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * DELETE /admin-api/abuse/blocklist/:id
 * Soft-unblocks an entry. Permanently banned entries (blockCount >= 3) cannot be removed.
 * Only SUPER_ADMIN can override a permanent ban.
 */
router.delete(
  "/abuse/blocklist/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const entry = await prisma.blocklist.findUnique({
        where: { id: req.params["id"] as string },
        select: { isPermanent: true },
      })
      if (!entry) {
        res.status(404).json({ success: false, error: "Entry not found" })
        return
      }
      const adminPayload = req.user as unknown as { role: string }
      if (entry.isPermanent && adminPayload.role !== "SUPER_ADMIN") {
        res.status(403).json({ success: false, error: "Permanent bans can only be lifted by a SUPER_ADMIN" })
        return
      }
      await prisma.blocklist.update({
        where: { id: req.params["id"] as string },
        data: { isActive: false, ...(entry.isPermanent ? { isPermanent: false } : {}) },
      })
      res.json({ success: true })
    } catch (err) {
      next(err)
    }
  },
)

// ─── Email Logs ───────────────────────────────────────────────────────────────

/**
 * GET /admin-api/email/logs?page&limit&status
 */
router.get(
  "/email/logs",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, limit, q } = PaginationSchema.parse(req.query)
      const status = req.query["status"] as string | undefined
      const skip = (page - 1) * limit

      const where: Record<string, unknown> = {}
      if (status) where["status"] = status
      if (q) where["to"] = { contains: q, mode: "insensitive" }

      const [total, logs] = await prisma.$transaction([
        prisma.emailLog.count({ where }),
        prisma.emailLog.findMany({
          where,
          skip,
          take: limit,
          orderBy: { sentAt: "desc" },
          select: { id: true, to: true, subject: true, template: true, status: true, error: true, provider: true, sentAt: true },
        }),
      ])

      res.json({ success: true, data: logs, meta: { total, page, limit, pages: Math.ceil(total / limit) } })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * POST /admin-api/email/broadcast – SUPER_ADMIN only
 * Sends a bulk email to a segment of users.
 */
router.post(
  "/email/broadcast",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const callerPayload = req.user as unknown as AccessTokenPayload
      if (callerPayload.role !== "SUPER_ADMIN") {
        res.status(403).json({ success: false, error: "SUPER_ADMIN role required" })
        return
      }

      const BroadcastSchema = z.object({
        subject: z.string().min(1).max(200),
        body: z.string().min(1).max(50000),
        segment: z.enum(["all", "free", "paid", "trialing", "past_due"]).default("all"),
        testEmail: z.string().email().optional(),
        bodyFormat: z.enum(["text", "html"]).default("text"),
      })
      const { subject, body, segment, testEmail, bodyFormat } = BroadcastSchema.parse(req.body)

      const html = buildBroadcastEmail(subject, body, bodyFormat === "html")

      // If testEmail is provided, send to a single address as a preview
      if (testEmail) {
        let status = "sent"
        let error: string | null = null
        try {
          await sendEmail({ to: testEmail, subject, html })
        } catch (e) {
          status = "failed"
          error = e instanceof Error ? e.message : "Send failed"
        }
        await prisma.emailLog.create({
          data: { to: testEmail, subject, template: "broadcast", status, provider: "admin-broadcast", error },
        })
        res.json({ success: true, sent: status === "sent" ? 1 : 0, preview: true })
        return
      }

      // Collect recipients based on segment
      const subWhere =
        segment === "all" ? undefined :
          segment === "free" ? { is: null } :
            segment === "trialing" ? { is: { status: "TRIALING" } } :
              segment === "past_due" ? { is: { status: "PAST_DUE" } } :
        /* paid */               { is: { status: "ACTIVE" } }

      const users = await prisma.user.findMany({
        where: { subscription: subWhere as never },
        select: { email: true },
      })

      // Send emails and track results
      const results = await Promise.allSettled(
        users.map((u) => sendEmail({ to: u.email, subject, html })),
      )

      await prisma.emailLog.createMany({
        data: users.map((u, i) => ({
          to: u.email,
          subject,
          template: "broadcast",
          status: results[i].status === "fulfilled" ? "sent" : "failed",
          error: results[i].status === "rejected"
            ? ((results[i] as PromiseRejectedResult).reason as Error)?.message ?? "Send failed"
            : null,
          provider: "admin-broadcast",
        })),
        skipDuplicates: true,
      })

      const sent = results.filter((r) => r.status === "fulfilled").length
      res.json({ success: true, sent, total: users.length })
    } catch (err) {
      next(err)
    }
  },
)

// ─── Platform Settings ────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: Record<string, string> = {
  maintenance_mode: "false",
  signup_enabled: "true",
  static_qr_enabled: "true",
  max_qr_per_user: "50",
  free_scan_limit: "1000",
  support_email: "riftqr07@gmail.com",
  changelog_sections: JSON.stringify([
    {
      version: "v1.9.0",
      date: "March 2026",
      title: "Marketing page refresh",
      items: [
        "Redesigned Features, About, and Use Cases pages",
        "Added Cookie Policy, GDPR, Careers, and Changelog routes",
        "Improved route scroll-to-top behavior",
      ],
      icon: "sparkles",
    },
  ]),
  careers_sections: JSON.stringify([
    {
      title: "Senior Frontend Engineer",
      type: "Full-time · Remote",
      desc: "Build polished, performant product experiences across dashboard and marketing surfaces.",
    },
    {
      title: "Backend Platform Engineer",
      type: "Full-time · Remote",
      desc: "Scale core services for analytics, routing, and campaign reliability.",
    },
    {
      title: "Product Designer",
      type: "Full-time · Hybrid",
      desc: "Shape user journeys from first impression to daily usage with strong UX craft.",
    },
  ]),
}

/**
 * GET /admin-api/settings
 */
router.get(
  "/settings",
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rows = await prisma.platformSetting.findMany()
      const settings: Record<string, string> = { ...DEFAULT_SETTINGS }
      for (const row of rows) settings[row.key] = row.value
      res.json({ success: true, data: settings })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * PATCH /admin-api/settings – SUPER_ADMIN only
 */
router.patch(
  "/settings",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const callerPayload = req.user as unknown as AccessTokenPayload
      if (callerPayload.role !== "SUPER_ADMIN") {
        res.status(403).json({ success: false, error: "SUPER_ADMIN role required" })
        return
      }

      const updates = z.record(z.string(), z.string()).parse(req.body)
      const allowedKeys = new Set(Object.keys(DEFAULT_SETTINGS))

      await prisma.$transaction(
        Object.entries(updates)
          .filter(([k]) => allowedKeys.has(k))
          .map(([key, value]) =>
            prisma.platformSetting.upsert({
              where: { key },
              update: { value },
              create: { key, value },
            }),
          ),
      )

      const rows = await prisma.platformSetting.findMany()
      const settings: Record<string, string> = { ...DEFAULT_SETTINGS }
      for (const row of rows) settings[row.key] = row.value
      res.json({ success: true, data: settings })
    } catch (err) {
      next(err)
    }
  },
)

// ─── Support Tickets ──────────────────────────────────────────────────────────

/**
 * GET /admin-api/support/tickets/count
 * Returns the count of OPEN tickets for the sidebar badge.
 */
router.get(
  "/support/tickets/count",
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const count = await prisma.supportTicket.count({
        where: { status: "OPEN" },
      })
      res.json({ success: true, data: { count } })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * GET /admin-api/support/tickets?page&limit&status&priority
 */
router.get(
  "/support/tickets",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, limit, q } = PaginationSchema.parse(req.query)
      const status = req.query["status"] as string | undefined
      const priority = req.query["priority"] as string | undefined
      const skip = (page - 1) * limit

      const where: Record<string, unknown> = {}
      if (status) where["status"] = status
      if (priority) where["priority"] = priority
      if (q) {
        where["OR"] = [
          { subject: { contains: q, mode: "insensitive" } },
          { message: { contains: q, mode: "insensitive" } },
        ]
      }

      const [total, tickets] = await prisma.$transaction([
        prisma.supportTicket.count({ where }),
        prisma.supportTicket.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          select: {
            id: true, subject: true, status: true, priority: true,
            assignedTo: true, createdAt: true, updatedAt: true,
            user: { select: { id: true, name: true, email: true } },
          },
        }),
      ])

      res.json({ success: true, data: tickets, meta: { total, page, limit, pages: Math.ceil(total / limit) } })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * GET /admin-api/support/tickets/:id
 */
router.get(
  "/support/tickets/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ticket = await prisma.supportTicket.findUnique({
        where: { id: req.params["id"] as string },
        include: { user: { select: { id: true, name: true, email: true } } },
      })
      if (!ticket) {
        res.status(404).json({ success: false, error: "Ticket not found" })
        return
      }
      res.json({ success: true, data: ticket })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * PATCH /admin-api/support/tickets/:id
 * Update ticket status, priority, assignee, or admin notes.
 */
router.patch(
  "/support/tickets/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const TicketUpdateSchema = z.object({
        status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
        priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
        assignedTo: z.string().max(200).optional(),
        adminNotes: z.string().max(5000).optional(),
      })
      const data = TicketUpdateSchema.parse(req.body)
      const extra: Record<string, unknown> = {}
      if (data.status === "RESOLVED" || data.status === "CLOSED") extra["resolvedAt"] = new Date()

      const updated = await prisma.supportTicket.update({
        where: { id: req.params["id"] as string },
        data: { ...data, ...extra },
      })
      res.json({ success: true, data: updated })
    } catch (err) {
      next(err)
    }
  },
)

// ─── Per-user payment reminder ────────────────────────────────────────────────

/**
 * POST /admin-api/users/:id/send-reminder
 * Sends a manual payment reminder email to a single user.
 * Uses the renewal-reminder template if expiry is in the future,
 * or the expired-notice template if the period has already passed.
 * SUPER_ADMIN only.
 */
router.post(
  "/users/:id/send-reminder",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const callerPayload = req.user as unknown as AccessTokenPayload
      if (callerPayload.role !== "SUPER_ADMIN") {
        res.status(403).json({ success: false, error: "SUPER_ADMIN role required" })
        return
      }

      const userId = req.params["id"] as string

      const user = await prisma.user.findUnique({
        where: { id: userId },
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

      if (!user) {
        res.status(404).json({ success: false, error: "User not found" })
        return
      }

      if (!user.subscription) {
        res.status(400).json({ success: false, error: "User has no active subscription" })
        return
      }

      const { buildRenewalReminderEmail: buildRenewal, buildExpiredNoticeEmail: buildExpired } =
        await import("../services/email.service.js")

      const now = new Date()
      const paymentUrl = `${(await import("../config/env.js")).env.FRONTEND_URL}/app/billing`
      const sub = user.subscription
      const planName = sub.plan.displayName

      // Determine expiry date — for trialing users use trialEndsAt, otherwise currentPeriodEnd
      const expiryDate = sub.status === "TRIALING" && sub.trialEndsAt
        ? sub.trialEndsAt
        : sub.currentPeriodEnd

      const msLeft = expiryDate.getTime() - now.getTime()
      const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24))
      const expired = daysLeft <= 0

      const expiryDateStr = expiryDate.toLocaleDateString("en-IN", {
        day: "numeric", month: "long", year: "numeric",
      })

      const html = expired
        ? buildExpired(user.name ?? "there", planName, paymentUrl)
        : buildRenewal(user.name ?? "there", daysLeft, planName, expiryDateStr, paymentUrl)

      const subject = expired
        ? `Your ${planName} plan has expired — GenXQR`
        : `Your ${planName} plan expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""} — GenXQR`

      await (await import("../services/email.service.js")).sendEmail({ to: user.email, subject, html })

      // Log it
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

      res.json({ success: true, message: `Reminder sent to ${user.email}` })
    } catch (err) {
      next(err)
    }
  },
)

// ─── Job Postings CRUD ────────────────────────────────────────────────────────

const JobPostingSchema = z.object({
  title: z.string().min(2).max(200),
  department: z.string().max(100).optional(),
  location: z.string().max(100).optional(),
  type: z.string().max(100),          // e.g. "Full-time · Remote"
  description: z.string().min(20).max(10000),
  status: z.enum(["OPEN", "PAUSED", "FILLED", "CLOSED"]).optional(),
})

/**
 * GET /admin-api/careers/jobs
 * List all job postings (all statuses) for the admin dashboard.
 */
router.get(
  "/careers/jobs",
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const jobs = await prisma.jobPosting.findMany({
        orderBy: { postedAt: "desc" },
      })
      res.json({ success: true, data: jobs })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * POST /admin-api/careers/jobs
 * Create a new job posting (defaults to OPEN status).
 */
router.post(
  "/careers/jobs",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = JobPostingSchema.parse(req.body)
      const job = await prisma.jobPosting.create({
        data: {
          title: parsed.title,
          department: parsed.department,
          location: parsed.location,
          type: parsed.type,
          description: parsed.description,
          status: (parsed.status as "OPEN" | "PAUSED" | "FILLED" | "CLOSED") ?? "OPEN",
        },
      })
      res.status(201).json({ success: true, data: job })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * PATCH /admin-api/careers/jobs/:id
 * Update any fields of a job posting, including status.
 * Setting status to FILLED/CLOSED automatically removes it from the public page.
 */
router.patch(
  "/careers/jobs/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params["id"] ?? "")
      const parsed = JobPostingSchema.partial().parse(req.body)
      const job = await prisma.jobPosting.update({
        where: { id },
        data: parsed as {
          title?: string; department?: string; location?: string;
          type?: string; description?: string;
          status?: "OPEN" | "PAUSED" | "FILLED" | "CLOSED"
        },
      })
      res.json({ success: true, data: job })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * DELETE /admin-api/careers/jobs/:id
 * Permanently delete a job posting.
 */
router.delete(
  "/careers/jobs/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params["id"] ?? "")
      await prisma.jobPosting.delete({ where: { id } })
      res.json({ success: true })
    } catch (err) {
      next(err)
    }
  },
)

// ─── Job Applications ─────────────────────────────────────────────────────────


/**
 * GET /admin-api/careers/applications/count
 * Returns count of NEW (unreviewed) applications for the sidebar/tab badge.
 */
router.get(
  "/careers/applications/count",
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const count = await prisma.jobApplication.count({ where: { status: "NEW" } })
      res.json({ success: true, data: { count } })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * GET /admin-api/careers/applications/:id/cv
 * Securely stream the stored CV file to the admin.
 * Path-traversal protection mirrors upload.routes.ts pattern.
 */
router.get(
  "/careers/applications/:id/cv",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const app = await prisma.jobApplication.findUnique({
        where: { id: String(req.params["id"] ?? "") },
        select: { cvPath: true, cvFilename: true, cvMimeType: true },
      })

      if (!app) {
        res.status(404).json({ success: false, error: "Application not found." })
        return
      }
      if (!app.cvPath) {
        res.status(404).json({ success: false, error: "CV not available (submitted before storage was enabled)." })
        return
      }

      // Path-traversal protection
      const UPLOAD_BASE = path_mod.join(process.cwd(), "uploads")
      const resolved = path_mod.resolve(app.cvPath)
      if (!resolved.startsWith(UPLOAD_BASE + path_mod.sep) && resolved !== UPLOAD_BASE) {
        res.status(400).json({ success: false, error: "Invalid file path." })
        return
      }

      if (!fs_mod.existsSync(resolved)) {
        res.status(404).json({ success: false, error: "CV file not found on server." })
        return
      }

      res.setHeader("Content-Type", app.cvMimeType ?? "application/octet-stream")
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(app.cvFilename)}"`)
      res.setHeader("Cache-Control", "private, no-cache")
      fs_mod.createReadStream(resolved).pipe(res)
    } catch (err) {
      next(err)
    }
  },
)

/**
 * GET /admin-api/careers/applications
 * List all received job applications with optional filters.
 */
router.get(
  "/careers/applications",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, limit, q } = PaginationSchema.parse(req.query)
      const status = req.query["status"] as string | undefined
      const jobId = req.query["jobId"] as string | undefined
      const skip = (page - 1) * limit

      const where: Record<string, unknown> = {}
      if (status) where["status"] = status
      if (jobId) where["jobId"] = jobId
      if (q) {
        where["OR"] = [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { jobTitle: { contains: q, mode: "insensitive" } },
        ]
      }

      const [total, applications] = await Promise.all([
        prisma.jobApplication.count({ where }),
        prisma.jobApplication.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
          select: {
            id: true,
            jobTitle: true,
            name: true,
            email: true,
            phone: true,
            linkedin: true,
            experience: true,
            cvFilename: true,
            status: true,
            createdAt: true,
            notes: true,
            job: { select: { id: true, title: true, status: true } },
          },
        }),
      ])

      res.json({
        success: true,
        data: applications,
        meta: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * PATCH /admin-api/careers/applications/:id
 * Update application status and/or recruiter notes.
 */
router.patch(
  "/careers/applications/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params["id"] ?? "")
      const { status, notes } = req.body as { status?: string; notes?: string }

      const updated = await prisma.jobApplication.update({
        where: { id },
        data: {
          ...(status ? { status: status as "NEW" | "REVIEWING" | "SHORTLISTED" | "REJECTED" | "HIRED" } : {}),
          ...(notes !== undefined ? { notes } : {}),
        },
      })
      res.json({ success: true, data: updated })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * DELETE /admin-api/careers/applications/:id
 * Permanently delete an application record.
 */
router.delete(
  "/careers/applications/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params["id"] ?? "")
      await prisma.jobApplication.delete({ where: { id } })
      res.json({ success: true })
    } catch (err) {
      next(err)
    }
  },
)

// ─── POST /admin-api/notifications/broadcast ─────────────────────────────────
// Sends an in-app notification to a user segment (or a single user by ID).

const BroadcastNotificationSchema = z.object({
  segment: z.string().min(1),
  type: z.enum(["SYSTEM", "FEATURE", "BILLING", "LIMIT", "TEAM"]),
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(2000),
  actionUrl: z.string().url().optional().or(z.literal("")),
})

router.post(
  "/notifications/broadcast",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = BroadcastNotificationSchema.parse(req.body)
      const result = await broadcastNotification({
        segment: parsed.segment,
        type: parsed.type as NotificationType,
        title: parsed.title,
        body: parsed.body,
        actionUrl: parsed.actionUrl || undefined,
      })
      res.json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },
)

export default router
