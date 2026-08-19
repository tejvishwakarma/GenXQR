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

import fs_mod from "fs"
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import { z } from "zod"
import { env } from "../config/env.js"
import { logger } from "../logger/index.js"
import { sendEmail, buildTicketReplyEmail } from "../services/email.service.js"
import { requireAdmin } from "../middleware/admin.middleware.js"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { broadcastNotification } from "../services/notification.service.js"
import * as AdminUsersService from "../services/admin-users.service.js"
import * as AdminPlatformService from "../services/admin-platform.service.js"
import * as AdminModerationService from "../services/admin-moderation.service.js"
import * as AdminSupportService from "../services/admin-support.service.js"
import * as AdminCouponsService from "../services/admin-coupons.service.js"
import { logAudit } from "../services/audit.service.js"
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
      const { reports, meta } = await AdminModerationService.listAbuseReports(
        { page, limit },
        req.query["resolved"],
      )
      res.json({ success: true, data: reports, meta })
    } catch (err) {
      next(err)
    }
  },
)

const ResolveReportSchema = z.object({ adminNotes: z.string().max(2000).optional() })

/**
 * POST /admin-api/abuse/reports/:id/resolve
 */
router.post(
  "/abuse/reports/:id/resolve",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { adminNotes } = ResolveReportSchema.parse(req.body)
      const updated = await AdminModerationService.resolveAbuseReport(
        uid(req),
        req.params["id"] as string,
        adminNotes,
      )
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
      const { entries, meta } = await AdminModerationService.listBlocklist(
        { page, limit },
        req.query["type"] as string | undefined,
      )
      res.json({ success: true, data: entries, meta })
    } catch (err) {
      next(err)
    }
  },
)

const BlocklistSchema = z.object({
  type: z.enum(["domain", "ip", "email", "user"]),
  value: z.string().min(1).max(500),
  reason: z.string().max(500).optional(),
})

/**
 * POST /admin-api/abuse/blocklist
 */
router.post(
  "/abuse/blocklist",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { type, value, reason } = BlocklistSchema.parse(req.body)
      const entry = await AdminModerationService.addToBlocklist(uid(req), type, value, reason)
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
      const adminPayload = req.user as unknown as AccessTokenPayload
      await AdminModerationService.removeFromBlocklist(adminPayload.role, req.params["id"] as string)
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
      const { logs, meta } = await AdminModerationService.listEmailLogs(
        { page, limit, q },
        req.query["status"] as string | undefined,
      )
      res.json({ success: true, data: logs, meta })
    } catch (err) {
      next(err)
    }
  },
)

const BroadcastSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(50000),
  segment: z.enum(["all", "free", "paid", "trialing", "past_due"]).default("all"),
  testEmail: z.string().email().optional(),
  bodyFormat: z.enum(["text", "html"]).default("text"),
})

/**
 * POST /admin-api/email/broadcast – SUPER_ADMIN only
 * Sends a bulk email to a segment of users.
 */
router.post(
  "/email/broadcast",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const callerPayload = req.user as unknown as AccessTokenPayload
      const input = BroadcastSchema.parse(req.body)
      const result = await AdminModerationService.sendBroadcast(callerPayload.role, input)
      res.json({ success: true, ...result })
    } catch (err) {
      next(err)
    }
  },
)

// ─── Platform Settings ────────────────────────────────────────────────────────

/**
 * GET /admin-api/settings
 */
router.get(
  "/settings",
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await AdminModerationService.getSettings()
      res.json({ success: true, data })
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
      const updates = z.record(z.string(), z.string()).parse(req.body)
      const data = await AdminModerationService.updateSettings(callerPayload.role, updates)
      res.json({ success: true, data })
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
      const count = await AdminSupportService.countOpenTickets()
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
      const { tickets, meta } = await AdminSupportService.listTickets(
        { page, limit, q },
        req.query["status"] as string | undefined,
        req.query["priority"] as string | undefined,
      )
      res.json({ success: true, data: tickets, meta })
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
      const ticket = await AdminSupportService.getTicket(req.params["id"] as string)
      res.json({ success: true, data: ticket })
    } catch (err) {
      next(err)
    }
  },
)

const TicketReplySchema = z.object({
  body: z.string().trim().min(2, "Write a reply first").max(5000),
})

/**
 * POST /admin-api/support/tickets/:id/messages
 * Staff reply, which also emails the customer so they do not have to be watching
 * the dashboard to learn they have an answer.
 */
router.post(
  "/support/tickets/:id/messages",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminId = (req.user as unknown as AccessTokenPayload).sub
      const input = TicketReplySchema.parse(req.body)
      const ticketId = req.params["id"] as string
      const { message, ticket } = await AdminSupportService.addStaffReply(ticketId, adminId, input.body)

      // Best-effort: the reply is stored and visible in the customer's dashboard,
      // so a mail failure must not turn a saved answer into an error.
      if (ticket.user?.email) {
        void sendEmail({
          to: ticket.user.email,
          subject: `Re: ${ticket.subject} — GenXQR`,
          html: buildTicketReplyEmail({
            userName: ticket.user.name ?? "there",
            subject: ticket.subject,
            reply: input.body,
            ticketUrl: `${env.FRONTEND_URL}/app/support/${ticket.id}`,
            shortId: ticket.id.slice(0, 8).toUpperCase(),
          }),
        }).catch((err: unknown) => {
          logger.warn("Ticket reply email failed", { error: String(err), ticketId })
        })
      }

      res.status(201).json({ success: true, data: message })
    } catch (err) {
      next(err)
    }
  },
)

const TicketUpdateSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  assignedTo: z.string().max(200).optional(),
  adminNotes: z.string().max(5000).optional(),
})

/**
 * PATCH /admin-api/support/tickets/:id
 * Update ticket status, priority, assignee, or admin notes.
 */
router.patch(
  "/support/tickets/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = TicketUpdateSchema.parse(req.body)
      const updated = await AdminSupportService.updateTicket(req.params["id"] as string, data)
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
      const jobs = await AdminSupportService.listJobs()
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
      const job = await AdminSupportService.createJob(parsed)
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
      const parsed = JobPostingSchema.partial().parse(req.body)
      const job = await AdminSupportService.updateJob(String(req.params["id"] ?? ""), parsed)
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
      await AdminSupportService.deleteJob(String(req.params["id"] ?? ""))
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
      const count = await AdminSupportService.countNewApplications()
      res.json({ success: true, data: { count } })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * GET /admin-api/careers/applications/:id/cv
 * Securely stream the stored CV file to the admin. The service resolves and
 * path-traversal-validates the file; the streaming stays here as it's an
 * HTTP-response concern.
 */
router.get(
  "/careers/applications/:id/cv",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const cv = await AdminSupportService.resolveApplicationCV(String(req.params["id"] ?? ""))
      res.setHeader("Content-Type", cv.mimeType)
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(cv.filename)}"`)
      res.setHeader("Cache-Control", "private, no-cache")
      fs_mod.createReadStream(cv.path).pipe(res)
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
      const { applications, meta } = await AdminSupportService.listApplications(
        { page, limit, q },
        req.query["status"] as string | undefined,
        req.query["jobId"] as string | undefined,
      )
      res.json({ success: true, data: applications, meta })
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
      const { status, notes } = req.body as { status?: string; notes?: string }
      const updated = await AdminSupportService.updateApplication(
        String(req.params["id"] ?? ""),
        status,
        notes,
      )
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
      await AdminSupportService.deleteApplication(String(req.params["id"] ?? ""))
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

// ─── Coupons ───────────────────────────────────────────────────────────────────
//
// Discount codes: the admin sets the code and what it is worth. Customers can
// only quote a code — every amount is derived server-side in coupon.service from
// these records (see POST /api/billing/validate-coupon).
//
// Amounts are handled in PAISE throughout, matching plan prices and invoices, so
// nothing has to round between layers.

/** Accepts an ISO date string or null; anything unparseable is rejected. */
const NullableDate = z
  .union([z.string().datetime(), z.string().length(0), z.null()])
  .optional()
  .transform((v) => (v ? new Date(v) : null))

const CouponBodySchema = z.object({
  code: z.string().trim().min(3).max(40),
  description: z.string().trim().max(200).nullish(),
  discountType: z.enum(["PERCENTAGE", "FIXED"]),
  discountValue: z.coerce.number().int().positive(),
  maxDiscountPaise: z.coerce.number().int().positive().nullish(),
  minOrderPaise: z.coerce.number().int().nonnegative().nullish(),
  applicablePlans: z.array(z.enum(["STARTER", "PRO", "BUSINESS"])).optional(),
  applicableCycles: z.array(z.enum(["monthly", "yearly"])).optional(),
  maxRedemptions: z.coerce.number().int().positive().nullish(),
  maxRedemptionsPerUser: z.coerce.number().int().positive().optional(),
  validFrom: NullableDate,
  validUntil: NullableDate,
  isActive: z.boolean().optional(),
})

router.get(
  "/coupons",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const includeInactive = req.query["includeInactive"] === "true"
      res.json({ success: true, data: await AdminCouponsService.listCoupons({ includeInactive }) })
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  "/coupons/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({ success: true, data: await AdminCouponsService.getCoupon(String(req.params["id"])) })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  "/coupons",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = CouponBodySchema.parse(req.body)
      const adminId = (req.user as AccessTokenPayload).sub
      const coupon = await AdminCouponsService.createCoupon(body, adminId)

      logAudit({
        userId: adminId,
        action: "admin.coupon.create",
        category: "admin",
        entityId: coupon.id,
        entityType: "Coupon",
        // Discount codes affect revenue, so who created what is worth recording.
        metadata: { code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue },
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      })

      res.status(201).json({ success: true, data: coupon })
    } catch (err) {
      next(err)
    }
  },
)

router.put(
  "/coupons/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = CouponBodySchema.parse(req.body)
      const id = String(req.params["id"])
      const coupon = await AdminCouponsService.updateCoupon(id, body)
      const adminId = (req.user as AccessTokenPayload).sub

      logAudit({
        userId: adminId,
        action: "admin.coupon.update",
        category: "admin",
        entityId: id,
        entityType: "Coupon",
        metadata: { code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue },
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      })

      res.json({ success: true, data: coupon })
    } catch (err) {
      next(err)
    }
  },
)

router.delete(
  "/coupons/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params["id"])
      const result = await AdminCouponsService.deleteCoupon(id)
      const adminId = (req.user as AccessTokenPayload).sub

      logAudit({
        userId: adminId,
        action: result.deleted ? "admin.coupon.delete" : "admin.coupon.deactivate",
        category: "admin",
        entityId: id,
        entityType: "Coupon",
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      })

      res.json({
        success: true,
        // A coupon that has been redeemed is deactivated rather than deleted —
        // its redemptions are the audit trail for discounted money.
        message: result.deleted ? "Coupon deleted." : "Coupon has redemptions, so it was deactivated instead of deleted.",
      })
    } catch (err) {
      next(err)
    }
  },
)

export default router
