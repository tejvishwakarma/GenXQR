import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import { prisma } from "../db/prisma.js"

const router: IRouter = Router()

// ─── GET /api/public/qr/:slug — Fetch QR content for landing page rendering ──
// Called by the frontend /l/:slug page AFTER /r/:slug already logged the scan.

router.get(
  "/qr/:slug",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const slug = String(req.params["slug"] ?? "")
      if (!slug || !/^[a-zA-Z0-9_-]{4,32}$/.test(slug)) {
        res.status(404).json({ success: false, error: "QR code not found" })
        return
      }

      const qr = await prisma.qRCode.findUnique({
        where: { slug },
        select: {
          id: true,
          type: true,
          name: true,
          slug: true,
          isActive: true,
          isPasswordProtected: true,
          activeFrom: true,
          activeUntil: true,
          scanLimit: true,
          scanCount: true,
          content: { select: { data: true } },
          design: {
            select: {
              primaryColor: true,
              secondaryColor: true,
              backgroundColor: true,
              foregroundColor: true,
              dotStyle: true,
              cornerSquareStyle: true,
              cornerDotStyle: true,
              logoUrl: true,
              frameStyle: true,
              frameText: true,
              frameColor: true,
              fontTitle: true,
              fontBody: true,
              welcomeScreenUrl: true,
            },
          },
          files: {
            select: {
              id: true,
              fileType: true,
              fileName: true,
              fileUrl: true,
              mimeType: true,
            },
          },
        },
      })

      // Password-protected QRs must never serve content from this unauthenticated
      // endpoint. Content is only released after a successful password check via
      // POST /r/:slug/password. Returning 404 here avoids leaking the protected
      // destination/credentials to anyone who knows the slug.
      if (!qr || !qr.isActive || qr.isPasswordProtected) {
        res.status(404).json({ success: false, error: "QR code not found" })
        return
      }

      // Return minimal data — no password hash, no userId
      res.json({
        success: true,
        data: {
          id: qr.id,
          type: qr.type,
          name: qr.name,
          slug: qr.slug,
          isActive: qr.isActive,
          content: qr.content?.data ?? {},
          design: qr.design ?? {},
          files: qr.files,
        },
      })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * GET /api/public/stats
 * Returns aggregate platform statistics for the marketing homepage.
 * No authentication required.
 */
router.get(
  "/stats",
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const [userCount, qrStats] = await Promise.all([
        prisma.user.count(),
        prisma.qRCode.aggregate({
          _count: { id: true },
          _sum: { scanCount: true },
        }),
      ])

      res.json({
        qrCodesGenerated: qrStats._count.id,
        activeBusinesses: userCount,
        totalScans: qrStats._sum.scanCount ?? 0,
        uptimeSla: 99.9,
      })
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  "/site-content",
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rows = await prisma.platformSetting.findMany({
        where: { key: { in: ["changelog_sections", "careers_sections"] } },
      })

      const map = new Map(rows.map((row) => [row.key, row.value]))

      const defaultChangelog = [
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
      ]

      const defaultCareers = [
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
      ]

      const parseJsonArray = <T,>(raw: string | undefined, fallback: T[]): T[] => {
        if (!raw) return fallback
        try {
          const parsed = JSON.parse(raw) as unknown
          return Array.isArray(parsed) ? (parsed as T[]) : fallback
        } catch {
          return fallback
        }
      }

      res.json({
        success: true,
        data: {
          changelog: parseJsonArray(map.get("changelog_sections"), defaultChangelog),
          careers: parseJsonArray(map.get("careers_sections"), defaultCareers),
        },
      })
    } catch (err) {
      next(err)
    }
  },
)

export default router
