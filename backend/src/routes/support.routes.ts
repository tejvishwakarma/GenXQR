/**
 * User-facing Support Ticket Routes — /api/support/*
 *
 * POST /api/support/tickets  – authenticated user creates a ticket
 * GET  /api/support/tickets  – authenticated user lists their own tickets
 */

import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import { z } from "zod"
import { requireAuth } from "../middleware/auth.middleware.js"
import { prisma } from "../db/prisma.js"
import { env } from "../config/env.js"
import type { AccessTokenPayload } from "../utils/jwt.js"
import {
  sendEmail,
  buildSupportTicketAdminEmail,
  buildSupportTicketConfirmationEmail,
} from "../services/email.service.js"

const router: IRouter = Router()

const ADMIN_SUPPORT_EMAIL = "support@genxqr.com"

const CreateTicketSchema = z.object({
  subject:  z.string().min(5, "Subject must be at least 5 characters").max(200),
  message:  z.string().min(20, "Please provide more detail (at least 20 characters)").max(5000),
  category: z.enum(["billing", "technical", "feature_request", "other"]).default("other"),
})

/**
 * POST /api/support/tickets
 * Creates a support ticket and sends admin + user emails.
 */
router.post(
  "/tickets",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req.user as unknown as AccessTokenPayload).sub
      const input = CreateTicketSchema.parse(req.body)

      // Fetch user info for emails
      const user = await prisma.user.findUnique({
        where:  { id: userId },
        select: { id: true, name: true, email: true },
      })
      if (!user) {
        res.status(404).json({ success: false, error: "User not found" })
        return
      }

      // Create ticket
      const ticket = await prisma.supportTicket.create({
        data: {
          userId,
          subject:  input.subject,
          message:  input.message,
          category: input.category,
        },
      })

      const adminUrl = `${env.FRONTEND_URL}/admin/support`

      // Send admin notification — non-blocking
      sendEmail({
        to:      ADMIN_SUPPORT_EMAIL,
        subject: `[Support] ${input.subject}`,
        html:    buildSupportTicketAdminEmail({
          userName:  user.name,
          userEmail: user.email,
          ticketId:  ticket.id,
          subject:   input.subject,
          category:  input.category,
          message:   input.message,
          adminUrl,
        }),
      }).catch(() => { /* fire-and-forget */ })

      // Send user confirmation — non-blocking
      sendEmail({
        to:      user.email,
        subject: `Support ticket received — GenXQR`,
        html:    buildSupportTicketConfirmationEmail({
          userName: user.name,
          ticketId: ticket.id,
          subject:  input.subject,
          category: input.category,
        }),
      }).catch(() => { /* fire-and-forget */ })

      res.status(201).json({
        success: true,
        message: "Ticket submitted successfully. We'll be in touch soon.",
        data: {
          id:        ticket.id,
          shortId:   ticket.id.slice(0, 8).toUpperCase(),
          subject:   ticket.subject,
          category:  ticket.category,
          status:    ticket.status,
          createdAt: ticket.createdAt,
        },
      })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * GET /api/support/tickets
 * Returns the authenticated user's own tickets (newest first).
 */
router.get(
  "/tickets",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req.user as unknown as AccessTokenPayload).sub
      const limit  = Math.min(Number(req.query["limit"] ?? 20), 50)
      const page   = Math.max(Number(req.query["page"] ?? 1), 1)
      const skip   = (page - 1) * limit

      const [total, tickets] = await prisma.$transaction([
        prisma.supportTicket.count({ where: { userId } }),
        prisma.supportTicket.findMany({
          where:   { userId },
          skip,
          take:    limit,
          orderBy: { createdAt: "desc" },
          select: {
            id: true, subject: true, category: true,
            status: true, priority: true,
            createdAt: true, updatedAt: true,
          },
        }),
      ])

      res.json({
        success: true,
        data: tickets,
        meta: { total, page, limit, pages: Math.ceil(total / limit) },
      })
    } catch (err) {
      next(err)
    }
  },
)

export default router
