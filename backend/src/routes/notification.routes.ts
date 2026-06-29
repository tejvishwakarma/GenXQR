import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import { z } from "zod"
import { requireAuth } from "../middleware/auth.middleware.js"
import type { AccessTokenPayload } from "../utils/jwt.js"
import {
  getUserNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearReadNotifications,
  clearAllNotifications,
  NOTIFICATION_PAGE_LIMIT,
} from "../services/notification.service.js"

const router: IRouter = Router()

function uid(req: Request): string {
  return (req.user as AccessTokenPayload).sub
}

const PaginationSchema = z.object({
  limit:  z.coerce.number().int().min(1).max(100).default(NOTIFICATION_PAGE_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
})

// ─── GET /api/notifications — paginated list + unread count ───────────────────

router.get(
  "/",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { limit, offset } = PaginationSchema.parse(req.query)
      const result = await getUserNotifications(uid(req), limit, offset)
      res.json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },
)

// ─── GET /api/notifications/unread-count — lightweight badge endpoint ─────────

router.get(
  "/unread-count",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const count = await getUnreadCount(uid(req))
      res.json({ success: true, data: { count } })
    } catch (err) {
      next(err)
    }
  },
)

// ─── PATCH /api/notifications/:id/read — mark single as read ─────────────────

router.patch(
  "/:id/read",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const notification = await markNotificationRead(uid(req), String(req.params.id))
      if (!notification) {
        res.status(404).json({ success: false, error: "Notification not found" })
        return
      }
      res.json({ success: true, data: notification })
    } catch (err) {
      next(err)
    }
  },
)

// ─── PATCH /api/notifications/read-all — mark all as read ────────────────────

router.patch(
  "/read-all",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const count = await markAllNotificationsRead(uid(req))
      res.json({ success: true, data: { markedRead: count } })
    } catch (err) {
      next(err)
    }
  },
)

// ─── DELETE /api/notifications/:id — delete a single notification ─────────────

router.delete(
  "/:id",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const deleted = await deleteNotification(uid(req), String(req.params.id))
      if (!deleted) {
        res.status(404).json({ success: false, error: "Notification not found" })
        return
      }
      res.json({ success: true, message: "Notification deleted" })
    } catch (err) {
      next(err)
    }
  },
)

// ─── DELETE /api/notifications/clear-read — bulk delete all read ──────────────

router.delete(
  "/clear-read",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const count = await clearReadNotifications(uid(req))
      res.json({ success: true, data: { deleted: count } })
    } catch (err) {
      next(err)
    }
  },
)

// ─── DELETE /api/notifications — clear ALL notifications for the user ─────────

router.delete(
  "/",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const count = await clearAllNotifications(uid(req))
      res.json({ success: true, data: { deleted: count } })
    } catch (err) {
      next(err)
    }
  },
)

export default router
