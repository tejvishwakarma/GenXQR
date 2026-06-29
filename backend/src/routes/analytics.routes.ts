import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import { z } from "zod"
import { requireAuth } from "../middleware/auth.middleware.js"
import { prisma } from "../db/prisma.js"
import { getQRAnalytics, getGlobalAnalytics } from "../services/analytics.service.js"
import type { AccessTokenPayload } from "../utils/jwt.js"

const router: IRouter = Router()

const uid = (req: Request): string => (req.user as unknown as AccessTokenPayload).sub

// ─── GET /api/analytics/global — Aggregate analytics across all user QRs ─────

const QuerySchema = z.object({
  days: z
    .string()
    .optional()
    .transform((v) => {
      const n = parseInt(v ?? "30", 10)
      return Number.isFinite(n) && n >= 1 && n <= 365 ? n : 30
    }),
})

router.get(
  "/global",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { days } = QuerySchema.parse(req.query)
      const analytics = await getGlobalAnalytics(uid(req), days)
      res.json({ success: true, data: analytics })
    } catch (err) {
      next(err)
    }
  },
)

// ─── GET /api/analytics/:qrId/csv — Download scan data as CSV ─────────────────

router.get(
  "/:qrId/csv",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const qrIdStr = String(req.params["qrId"] ?? "")

      const qr = await prisma.qRCode.findFirst({
        where: { id: qrIdStr, userId: uid(req) },
        select: { id: true, name: true },
      })
      if (!qr) {
        res.status(404).json({ success: false, error: "QR code not found" })
        return
      }

      const scans = await prisma.qRScan.findMany({
        where: { qrId: qrIdStr },
        orderBy: { scannedAt: "desc" },
        take: 10_000,
        select: {
          scannedAt: true,
          ip: true,
          country: true,
          city: true,
          deviceType: true,
          os: true,
          browser: true,
          referrer: true,
        },
      })

      const escapeCSV = (v: string) => `"${v.replace(/"/g, '""')}"`
      const header = "scannedAt,ip,country,city,deviceType,os,browser,referrer\n"
      const rows = scans
        .map((s) =>
          [
            s.scannedAt.toISOString(),
            s.ip,
            s.country ?? "",
            s.city ?? "",
            s.deviceType,
            s.os ?? "",
            s.browser ?? "",
            escapeCSV(s.referrer ?? ""),
          ].join(","),
        )
        .join("\n")

      const safeName = qr.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60)
      res.setHeader("Content-Type", "text/csv; charset=utf-8")
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}_scans.csv"`)
      res.send(header + rows)
    } catch (err) {
      next(err)
    }
  },
)

// ─── GET /api/analytics/:qrId — Full analytics for one QR code ───────────────

router.get(
  "/:qrId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { qrId } = req.params
      const qrIdStr = String(qrId ?? "")
      const { days } = QuerySchema.parse(req.query)

      // Verify ownership
      const qr = await prisma.qRCode.findFirst({
        where: { id: qrIdStr, userId: uid(req) },
        select: { id: true },
      })

      if (!qr) {
        res.status(404).json({ success: false, error: "QR code not found" })
        return
      }

      const analytics = await getQRAnalytics(qrIdStr, days)
      res.json({ success: true, data: analytics })
    } catch (err) {
      next(err)
    }
  },
)

export default router
