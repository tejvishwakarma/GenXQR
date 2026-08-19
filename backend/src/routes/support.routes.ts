/**
 * User-facing Support Ticket Routes — /api/support/*
 *
 * POST /api/support/tickets  – authenticated user creates a ticket
 * GET  /api/support/tickets  – authenticated user lists their own tickets
 */

import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { requireAuth } from "../middleware/auth.middleware.js"
import { contactLimiter } from "../middleware/rateLimit.middleware.js"
import { prisma } from "../db/prisma.js"
import { logger } from "../logger/index.js"
import { AppError } from "../middleware/error.middleware.js"
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
/**
 * Public contact form (POST /api/support/contact).
 *
 * Separate from /tickets, which requires a login and creates a SupportTicket row.
 * SupportTicket.userId is non-nullable, so an anonymous enquiry cannot be stored
 * as one without a schema change; this path notifies support by email instead and
 * confirms receipt to the sender. Both sends are recorded in EmailLog, so there is
 * still a durable trail visible under Admin → Email.
 */
/**
 * Records a contact enquiry in EmailLog.
 *
 * sendEmail itself does not log — only a handful of callers do — so this has to be
 * explicit. `to` holds the visitor's address rather than the support inbox: it is
 * the useful key when someone later asks "did our reply go anywhere?".
 */
async function logContactEmail(
  to: string,
  subject: string,
  status: "sent" | "failed",
  error: string | null,
): Promise<void> {
  try {
    await prisma.emailLog.create({
      data: {
        to,
        subject,
        template: "contact-form",
        status,
        error,
        provider: env.RESEND_API_KEY ? "resend" : env.SMTP_HOST ? "smtp" : "console",
      },
    })
  } catch (err) {
    // Never fail a delivered enquiry because the audit row would not write.
    logger.warn("Could not write contact EmailLog row", { error: String(err) })
  }
}

const ContactSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName:  z.string().trim().max(80).optional().default(""),
  email:     z.string().trim().email("Enter a valid email address").max(200),
  category:  z.enum(["general", "sales", "technical", "billing"]).default("general"),
  message:   z.string().trim().min(20, "Please provide more detail (at least 20 characters)").max(5000),
  /**
   * Honeypot. Hidden from people by CSS, so a human never fills it and a bot that
   * fills every field does. Filled submissions are accepted and silently dropped —
   * answering 200 tells the bot nothing about why nothing happened.
   */
  company:   z.string().max(200).optional().default(""),
})

const CONTACT_CATEGORY_LABEL: Record<string, string> = {
  general:   "General Inquiry",
  sales:     "Sales & Enterprise",
  technical: "Technical Support",
  billing:   "Billing Question",
}

router.post(
  "/contact",
  contactLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = ContactSchema.parse(req.body)

      if (input.company.trim() !== "") {
        logger.info("Contact form honeypot triggered", { ip: req.ip })
        res.json({ success: true })
        return
      }

      const name = `${input.firstName} ${input.lastName}`.trim()
      // Not a ticket id — there is no ticket. A short reference so a reply can be
      // tied back to this submission in the email log.
      const reference = randomUUID()
      const label = CONTACT_CATEGORY_LABEL[input.category] ?? input.category
      const subject = `${label} — ${name}`

      // Awaited deliberately: if support never receives this, the visitor must be
      // told rather than thanked. The alternative — answering 200 and logging —
      // loses enquiries silently, which is the worse failure for a contact form.
      try {
        await sendEmail({
        to:      ADMIN_SUPPORT_EMAIL,
        subject: `[Contact] ${subject}`,
        html:    buildSupportTicketAdminEmail({
          userName:  name,
          userEmail: input.email,
          ticketId:  reference,
          subject,
          category:  label,
          message:   input.message,
          adminUrl:  `${env.FRONTEND_URL}/admin/support`,
        }),
        // Lets support hit reply and reach the sender, rather than replying to us.
        replyTo: input.email,
        })
        await logContactEmail(input.email, `[Contact] ${subject}`, "sent", null)
      } catch (mailErr) {
        // The real cause (unverified domain, provider outage, bad key) is for us,
        // not the visitor — but they get a route that still works.
        logger.error("Contact form email failed to send", {
          error: String(mailErr),
          category: input.category,
        })
        // Recorded even on failure: a lost enquiry with no trace is the worst
        // outcome, and Admin -> Email is where someone would go looking.
        await logContactEmail(input.email, `[Contact] ${subject}`, "failed", String(mailErr))
        res.status(502).json({
          success: false,
          error: `We could not send your message right now. Please email us directly at ${ADMIN_SUPPORT_EMAIL}.`,
        })
        return
      }

      // Confirmation is best-effort: the enquiry has already reached support, so a
      // bounce on the visitor's own address must not report the form as failed.
      void sendEmail({
        to:      input.email,
        subject: "We've received your message — GenXQR",
        html:    buildSupportTicketConfirmationEmail({
          userName: input.firstName,
          ticketId: reference,
          subject,
          category: label,
        }),
      }).catch((err: unknown) => {
        logger.warn("Contact confirmation email failed", { error: String(err) })
      })

      res.json({ success: true })
    } catch (err) {
      next(err)
    }
  },
)

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
          // The opening message is also the first entry in the conversation.
          // Written in the same create so a ticket can never exist with an empty
          // thread — the migration backfilled old tickets, and this covers new
          // ones. `message` is kept in step for anything still reading the column.
          messages: {
            create: { authorId: userId, isStaff: false, body: input.message },
          },
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
            // The submitter should be able to re-read what they sent, and see when
            // it was closed. adminNotes stays out — it is internal.
            message: true, resolvedAt: true,
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

// ─── Ticket conversation (customer side) ──────────────────────────────────────

const ReplySchema = z.object({
  body: z.string().trim().min(2, "Write a reply first").max(5000),
})

/**
 * Loads a ticket the caller is allowed to see, or throws.
 *
 * Ownership is checked in the same query rather than fetched-then-compared, so
 * there is no window in which the wrong ticket is in hand, and a miss is
 * indistinguishable from "does not exist" — a stranger cannot probe for valid ids.
 */
async function requireOwnTicket(ticketId: string, userId: string) {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, userId },
    select: { id: true, subject: true, status: true, category: true, priority: true, createdAt: true, resolvedAt: true },
  })
  if (!ticket) throw new AppError(404, "Ticket not found")
  return ticket
}

/** GET /api/support/tickets/:id — one ticket with its whole conversation. */
router.get(
  "/tickets/:id",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req.user as unknown as AccessTokenPayload).sub
      const ticket = await requireOwnTicket(String(req.params["id"]), userId)

      const messages = await prisma.ticketMessage.findMany({
        where: { ticketId: ticket.id },
        orderBy: { createdAt: "asc" },
        // authorId is deliberately not exposed: the customer needs to know whether
        // a message came from staff, not which staff account wrote it.
        select: { id: true, body: true, isStaff: true, createdAt: true },
      })

      res.json({ success: true, data: { ...ticket, messages } })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * POST /api/support/tickets/:id/reopen — customer says it is not fixed after all.
 *
 * Only from RESOLVED. CLOSED is terminal on purpose: it is the state that lets
 * support end a thread for good, and if it could be reopened it would mean nothing
 * different from RESOLVED. A customer with a new problem raises a new ticket, which
 * also keeps one ticket to one issue rather than a thread that runs for months.
 */
router.post(
  "/tickets/:id/reopen",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req.user as unknown as AccessTokenPayload).sub
      const ticket = await requireOwnTicket(String(req.params["id"]), userId)

      if (ticket.status === "CLOSED") {
        throw new AppError(409, "This ticket is closed. Please raise a new ticket instead.")
      }
      if (ticket.status !== "RESOLVED") {
        throw new AppError(409, "This ticket is already open.")
      }

      const updated = await prisma.supportTicket.update({
        where: { id: ticket.id },
        // resolvedAt is cleared so the ticket stops claiming a resolution date that
        // no longer holds, and so it does not read as resolved in either UI.
        data: { status: "OPEN", resolvedAt: null },
        select: { id: true, status: true, resolvedAt: true },
      })

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      })

      // Support needs to know it is back in the queue; best-effort, since the state
      // change has already been saved and is visible to both sides.
      void sendEmail({
        to: ADMIN_SUPPORT_EMAIL,
        subject: `[Support] Reopened: ${ticket.subject}`,
        html: buildSupportTicketAdminEmail({
          userName: user?.name ?? "Customer",
          userEmail: user?.email ?? "unknown",
          ticketId: ticket.id,
          subject: ticket.subject,
          category: ticket.category,
          message: "The customer reopened this ticket — it was not resolved.",
          adminUrl: `${env.FRONTEND_URL}/admin/support`,
        }),
        replyTo: user?.email,
      }).catch((err: unknown) => {
        logger.warn("Ticket reopen notification failed", { error: String(err), ticketId: ticket.id })
      })

      res.json({ success: true, data: updated })
    } catch (err) {
      next(err)
    }
  },
)

/** POST /api/support/tickets/:id/messages — customer adds to the conversation. */
router.post(
  "/tickets/:id/messages",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req.user as unknown as AccessTokenPayload).sub
      const ticket = await requireOwnTicket(String(req.params["id"]), userId)
      const input = ReplySchema.parse(req.body)

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      })

      // A resolved or closed ticket does not accept replies. Reopening is its own
      // deliberate action (see below), because a reply that silently reopens leaves
      // the customer unsure whether anyone is coming back to it, and quietly pulls
      // finished work back into the queue. This mirrors how Zendesk, Freshdesk and
      // Intercom all treat a solved conversation.
      if (ticket.status === "RESOLVED") {
        throw new AppError(409, "This ticket is resolved. Reopen it to continue the conversation.")
      }
      if (ticket.status === "CLOSED") {
        throw new AppError(409, "This ticket is closed. Please raise a new ticket instead.")
      }

      const message = await prisma.ticketMessage.create({
        data: { ticketId: ticket.id, authorId: userId, isStaff: false, body: input.body },
        select: { id: true, body: true, isStaff: true, createdAt: true },
      })
      await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { updatedAt: new Date() },
      })

      // Best-effort: the reply is already saved and visible in the app, so a mail
      // failure must not report it as lost.
      void sendEmail({
        to: ADMIN_SUPPORT_EMAIL,
        subject: `[Support] Re: ${ticket.subject}`,
        html: buildSupportTicketAdminEmail({
          userName: user?.name ?? "Customer",
          userEmail: user?.email ?? "unknown",
          ticketId: ticket.id,
          subject: ticket.subject,
          category: ticket.category,
          message: input.body,
          adminUrl: `${env.FRONTEND_URL}/admin/support`,
        }),
        replyTo: user?.email,
      }).catch((err: unknown) => {
        logger.warn("Ticket reply notification failed", { error: String(err), ticketId: ticket.id })
      })

      res.status(201).json({ success: true, data: message })
    } catch (err) {
      next(err)
    }
  },
)

export default router
