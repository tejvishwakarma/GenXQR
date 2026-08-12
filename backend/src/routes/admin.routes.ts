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
import type { AccessTokenPayload } from "../utils/jwt.js"
import { sendEmail, buildBroadcastEmail } from "../services/email.service.js"
import { broadcastNotification } from "../services/notification.service.js"
import * as AdminUsersService from "../services/admin-users.service.js"
import * as AdminPlatformService from "../services/admin-platform.service.js"
import type { NotificationType } from "@prisma/client"

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
      const data = await AdminPlatformService.getDashboardMetrics()
      res.json({ success: true, data })
    } catch (err) {
      next(err)
    }
  },
)

// ─── System health ──────────────────────────────────────────────────────────

/**
 * GET /admin-api/system-health
 * Live status of core infrastructure (database, Redis, scan queue) plus API
 * process metrics. SUPER_ADMIN only — exposes internal operational detail.
 */
router.get(
  "/system-health",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const callerRole = (req.user as unknown as AccessTokenPayload).role
      const data = await AdminPlatformService.getSystemHealth(callerRole)
      res.json({ success: true, data })
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
      const { users, total, pages } = await AdminUsersService.listUsers({ page, limit, q })
      res.json({ success: true, data: users, meta: { total, page, limit, pages } })
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
      const data = await AdminUsersService.getUserDetail(req.params["id"] as string)
      res.json({ success: true, data })
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
const UpdateUserSchema = z.object({
  role: z.enum(["USER", "ADMIN", "SUPER_ADMIN"]).optional(),
  name: z.string().min(2).max(100).trim().optional(),
})

router.patch(
  "/users/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminPayload = req.user as unknown as AccessTokenPayload
      const input = UpdateUserSchema.parse(req.body)
      const updated = await AdminUsersService.updateUser(
        uid(req),
        adminPayload.role,
        req.params["id"] as string,
        input,
      )
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
const ChangePlanSchema = z.object({
  planName: z.enum(["FREE", "STARTER", "PRO", "BUSINESS", "ENTERPRISE"]),
})

router.patch(
  "/users/:id/plan",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const caller = req.user as unknown as AccessTokenPayload
      const { planName } = ChangePlanSchema.parse(req.body)
      const data = await AdminUsersService.changePlan(caller.role, caller.sub, req.params["id"] as string, planName)
      res.json({ success: true, data })
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
      const adminPayload = req.user as unknown as AccessTokenPayload
      await AdminUsersService.deleteUser(uid(req), adminPayload.role, req.params["id"] as string)
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
      const data = await AdminUsersService.impersonateUser(
        adminPayload.sub,
        adminPayload.role,
        req.params["id"] as string,
      )
      res.json({ success: true, data })
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
      const { message } = await AdminUsersService.forceVerifyEmail(
        caller.role,
        caller.sub,
        req.params["id"] as string,
      )
      res.json({ success: true, message })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * POST /admin-api/users/:id/password
 * Force-set a user's password (SUPER_ADMIN only).
 */
const SetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
})

router.post(
  "/users/:id/password",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const caller = req.user as unknown as AccessTokenPayload
      const { password } = SetPasswordSchema.parse(req.body)
      await AdminUsersService.forceSetPassword(caller.role, caller.sub, req.params["id"] as string, password)
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
      const { codes, meta } = await AdminPlatformService.listQRCodes({ page, limit, q })
      res.json({ success: true, data: codes, meta })
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
      await AdminPlatformService.deactivateQRCode(uid(req), req.params["id"] as string)
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
      await AdminPlatformService.deleteQRCode(uid(req), req.params["id"] as string)
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
      const data = await AdminPlatformService.getSignupTrend(req.query["days"])
      res.json({ success: true, data })
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
      const data = await AdminPlatformService.getScanTrend(req.query["days"])
      res.json({ success: true, data })
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
      const { data, meta } = await AdminPlatformService.getRevenue({ page, limit })
      res.json({ success: true, data, meta })
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
      const data = await AdminPlatformService.getStaticQRAnalytics(req.query["days"])
      res.json({ success: true, data })
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
      const data = await AdminPlatformService.getRevenueTrend(req.query["days"])
      res.json({ success: true, data })
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
      const data = await AdminPlatformService.getPlanBreakdown()
      res.json({ success: true, data })
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
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await AdminPlatformService.getStorageUsage()
      res.json({ success: true, data })
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
      const data = await AdminPlatformService.cleanupOrphanedFiles(uid(req), adminPayload.role)
      res.json({ success: true, data })
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
      const { logs, meta } = await AdminPlatformService.getAuditLog({
        page,
        limit,
        q: req.query["q"] as string | undefined,
        category: req.query["category"] as string | undefined,
        userId: req.query["userId"] as string | undefined,
        userEmail: req.query["userEmail"] as string | undefined,
        dateFrom: req.query["dateFrom"] as string | undefined,
        dateTo: req.query["dateTo"] as string | undefined,
        ip: req.query["ip"] as string | undefined,
      })
      res.json({ success: true, data: logs, meta })
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
      const { data, meta } = await AdminPlatformService.listSubscriptions(
        { page, limit },
        req.query["status"] as string | undefined,
        req.query["plan"] as string | undefined,
      )
      res.json({ success: true, data, meta })
    } catch (err) {
      next(err)
    }
  },
)

const SendRemindersSchema = z.object({
  subscriptionIds: z.array(z.string()).min(1).max(200),
})

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
      const { subscriptionIds } = SendRemindersSchema.parse(req.body)
      const result = await AdminPlatformService.sendSubscriptionReminders(callerPayload.role, subscriptionIds)
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
      const { invoices, meta } = await AdminPlatformService.listPayments(
        { page, limit },
        req.query["status"] as string | undefined,
      )
      res.json({ success: true, data: invoices, meta })
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
      const { message } = await AdminUsersService.sendManualReminder(callerPayload.role, req.params["id"] as string)
      res.json({ success: true, message })
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
