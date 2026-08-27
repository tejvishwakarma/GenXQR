import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import { prisma } from "../db/prisma.js"
import { resolveBrandingForSlug, resolveBrandingForUser } from "../services/branding.service.js"

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
          // Selected only to resolve the owner's plan for the branding decision.
          // Never returned — see the response below.
          userId: true,
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

      /**
       * Whether the landing page shows "Powered by GenXQR".
       *
       * Exposed as a BOOLEAN, never the plan name. This endpoint is public and
       * unauthenticated, so anyone holding a slug can call it; returning the
       * owner's tier would leak what a customer pays from a URL printed on a
       * poster. The boolean tells the page what to render and nothing else.
       *
       * whiteLabel is true on BUSINESS and ENTERPRISE. It has been sold on the
       * pricing page since launch and, until now, removed nothing — there was no
       * branding on landing pages for it to take away, so those customers were
       * paying for a feature indistinguishable from the free tier.
       *
       * Fails towards showing branding: an ownerless QR (userId is nullable) or
       * a lookup that throws both leave showBranding true. Wrongly branding a
       * Business customer's page is a visible, reportable annoyance; wrongly
       * un-branding everyone's is a silent loss of both the attribution and the
       * paid feature's meaning.
       */
      const branding = await resolveBrandingForUser(qr.userId)

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
          branding,
        },
      })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * GET /api/public/branding/:slug
 *
 * Whose name the scan-facing pages should carry. Returns branding and NOTHING
 * else — no destination, no content, no owner identity.
 *
 * It exists separately from /qr/:slug because the pages that need it are exactly
 * the ones that must not receive content: the password gate (content is released
 * only after the password is verified) and the expired notice (the QR is
 * inactive). Reusing /qr/:slug would have meant relaxing the 404 those rely on.
 *
 * Always 200, even for an unknown slug — it answers "what should I render",
 * and every answer including the fallback is safe to give away. A 404 here
 * would also turn the endpoint into an oracle for which slugs exist.
 */
router.get(
  "/branding/:slug",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const slug = String(req.params["slug"] ?? "")
      if (!slug || !/^[a-zA-Z0-9_-]{4,32}$/.test(slug)) {
        res.json({ success: true, data: { mode: "genxqr", name: null, logoUrl: null } })
        return
      }
      res.json({ success: true, data: await resolveBrandingForSlug(slug) })
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
