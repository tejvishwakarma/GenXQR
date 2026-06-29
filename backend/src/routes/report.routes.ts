import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import { z } from "zod"
import { requireAuth } from "../middleware/auth.middleware.js"
import { apiLimiter } from "../middleware/rateLimit.middleware.js"
import { prisma } from "../db/prisma.js"
import { AppError } from "../middleware/error.middleware.js"
import type { AccessTokenPayload } from "../utils/jwt.js"

const router: IRouter = Router()

function uid(req: Request): string {
  return (req.user as AccessTokenPayload).sub
}

// ─── POST /api/report ─────────────────────────────────────────────────────────
// Submit an abuse report against any QR code (by slug or id)

const SubmitReportSchema = z.object({
  qrSlug:  z.string().min(1).max(64).optional(),
  qrId:    z.string().min(1).max(64).optional(),
  reason:  z.enum(["SPAM", "PHISHING", "INAPPROPRIATE", "COPYRIGHT", "ILLEGAL", "OTHER"]),
  details: z.string().max(1000).optional(),
}).refine((d) => d.qrSlug ?? d.qrId, {
  message: "Either qrSlug or qrId is required",
})

router.post(
  "/",
  requireAuth,
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = SubmitReportSchema.parse(req.body)

      const qr = await prisma.qRCode.findFirst({
        where: body.qrId
          ? { id: body.qrId }
          : { slug: body.qrSlug },
        select: { id: true, userId: true },
      })

      if (!qr) throw new AppError(404, "QR code not found")

      // Users cannot report their own QR codes
      if (qr.userId === uid(req)) {
        throw new AppError(400, "You cannot report your own QR code")
      }

      // One active (unresolved) report per user per QR is enough
      const existing = await prisma.abuseReport.findFirst({
        where: { qrId: qr.id, reportedBy: uid(req), isResolved: false },
      })
      if (existing) {
        throw new AppError(409, "You have already submitted a report for this QR code")
      }

      await prisma.abuseReport.create({
        data: {
          qrId:       qr.id,
          reportedBy: uid(req),
          reason:     body.reason,
          url:        body.details ?? null,
        },
      })

      res.status(201).json({ success: true, message: "Report submitted. Our team will review it shortly." })
    } catch (err) {
      next(err)
    }
  },
)

// ─── GET /api/report/my-qrs ───────────────────────────────────────────────────
// Get abuse reports filed against the authenticated user's own QR codes

router.get(
  "/my-qrs",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = uid(req)

      const reports = await prisma.abuseReport.findMany({
        where: { qrCode: { userId } },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id:         true,
          reason:     true,
          isResolved: true,
          adminNotes: true,
          resolvedAt: true,
          createdAt:  true,
          qrCode: {
            select: { id: true, name: true, slug: true, isActive: true },
          },
        },
      })

      res.json({ success: true, data: reports })
    } catch (err) {
      next(err)
    }
  },
)

export default router
