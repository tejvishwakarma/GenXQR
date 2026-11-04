import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import { z } from "zod"
import { requireAuth } from "../middleware/auth.middleware.js"
import { requireWorkspacePermission, withWorkspace, wsOwner } from "../middleware/workspace.middleware.js"
import { prisma } from "../db/prisma.js"
import { getQRAnalytics, getGlobalAnalytics, listScans } from "../services/analytics.service.js"
import { csvCell } from "../utils/csv-cell.util.js"
import { maskIp } from "../utils/mask-ip.util.js"

const router: IRouter = Router()


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
  withWorkspace,
  requireWorkspacePermission("qr:view"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { days } = QuerySchema.parse(req.query)
      const { placeId } = z.object({ placeId: z.string().min(1).max(40).optional() }).parse(req.query)
      const analytics = await getGlobalAnalytics(wsOwner(req), days, placeId)
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
  withWorkspace,
  requireWorkspacePermission("qr:view"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const qrIdStr = String(req.params["qrId"] ?? "")

      const qr = await prisma.qRCode.findFirst({
        where: { id: qrIdStr, userId: wsOwner(req) },
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
          place: { select: { name: true } },
        },
      })

      // Every cell through csvCell: referrer, OS and browser come from the
      // scanner's own request headers.
      const header = "scannedAt,ip,country,city,deviceType,os,browser,referrer,place\n"
      const rows = scans
        .map((s) =>
          [s.scannedAt.toISOString(), maskIp(s.ip), s.country, s.city, s.deviceType, s.os, s.browser, s.referrer, s.place?.name ?? null]
            .map(csvCell)
            .join(","),
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

// ─── GET /api/analytics/:qrId/scans — One page of the scan log ───────────────

const ScanLogQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  // Instants, so the browser decides where its local day starts and ends.
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
})

router.get(
  "/:qrId/scans",
  requireAuth,
  withWorkspace,
  requireWorkspacePermission("qr:view"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const qrIdStr = String(req.params["qrId"] ?? "")
      const { page, limit, from, to } = ScanLogQuery.parse(req.query)
      const qr = await prisma.qRCode.findFirst({ where: { id: qrIdStr, userId: wsOwner(req) }, select: { id: true } })
      if (!qr) {
        res.status(404).json({ success: false, error: "QR code not found" })
        return
      }
      const result = await listScans(qrIdStr, { page, limit, from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined })
      res.json({ success: true, ...result })
    } catch (err) {
      next(err)
    }
  },
)

// ─── GET /api/analytics/:qrId — Full analytics for one QR code ───────────────

router.get(
  "/:qrId",
  requireAuth,
  withWorkspace,
  requireWorkspacePermission("qr:view"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { qrId } = req.params
      const qrIdStr = String(qrId ?? "")
      const { days } = QuerySchema.parse(req.query)

      // Verify ownership
      const qr = await prisma.qRCode.findFirst({
        where: { id: qrIdStr, userId: wsOwner(req) },
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
