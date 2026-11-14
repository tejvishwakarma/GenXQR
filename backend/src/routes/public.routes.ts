import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import { prisma } from "../db/prisma.js"
import { resolveBrandingForSlug, GENXQR_BRANDING, resolveBrandingForUser } from "../services/branding.service.js"
import { contentHasBlockedLink, scanAvailability } from "../services/scan.service.js"
import { verifyQRUnlock } from "../utils/jwt.js"
import { resolveScanHost } from "../services/custom-domain.service.js"
import { requestHost } from "./scan.routes.js"
import { REPORT_DAYS, getClientReport } from "../services/agency.service.js"
import { AppError } from "../middleware/error.middleware.js"
import { buildIcs, type EventContent } from "../utils/event-calendar.util.js"
import { recordResponse } from "../services/form-response.service.js"
import { formResponseLimiter } from "../middleware/rateLimit.middleware.js"
import { requireTurnstile } from "../middleware/turnstile.middleware.js"

const router: IRouter = Router()

// ─── GET /api/public/qr/:slug — Fetch QR content for landing page rendering ──
// Called by the frontend /l/:slug page AFTER /r/:slug already logged the scan.

const SLUG = /^[a-zA-Z0-9_-]{4,32}$/

/**
 * A code whose scan page may be served to this request: on this host, unlocked
 * if password-protected, and passing the same gate as a scan (scan.service
 * unavailableFor: switched off, outside its dates, over its scan limit or the
 * owner's quota, owner blocked — and links in the content on the destination
 * blocklist). The page content, the event's calendar file and form answers all
 * go through here, so none of them is reachable when the page is not.
 */
async function servableQR(req: Request, slug: string) {
  if (!slug || !SLUG.test(slug)) return { status: "missing" as const }
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
  // …unless the visitor carries the short-lived proof of having entered the
  // password (POST /r/:slug/password → /l/<slug>?access=…).
  // On a customer's own domain only their codes exist (custom-domain.service).
  const host = await resolveScanHost(requestHost(req))
  // A lapsed domain (its owner's plan no longer includes custom domains) serves
  // nothing: scans there are sent to genxqr.com, and treating it as canonical
  // let any account's page — a form, say — be opened under that brand's name.
  const foreign = host.kind === "unknown" || host.kind === "lapsed" || (host.kind === "custom" && qr?.userId !== host.ownerId)

  const access = typeof req.query["access"] === "string" ? req.query["access"] : ""
  const unlocked = qr?.isPasswordProtected === true && access !== "" && verifyQRUnlock(access, slug)
  if (!qr || foreign || (qr.isPasswordProtected && !unlocked)) return { status: "missing" as const }

  const reason = (await scanAvailability(slug)) ?? ((await contentHasBlockedLink(qr.content?.data)) ? "blocked" : null)
  if (reason) return { status: "unavailable" as const, reason, qr }
  return { status: "ok" as const, qr }
}

// ─── GET /api/public/qr/:slug — Fetch QR content for landing page rendering ──
// Called by the frontend /l/:slug page AFTER /r/:slug already logged the scan.

router.get(
  "/qr/:slug",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const found = await servableQR(req, String(req.params["slug"] ?? ""))
      if (found.status === "missing") {
        res.status(404).json({ success: false, error: "QR code not found" })
        return
      }
      // The reason, never the content, so the page can show the expired notice.
      if (found.status === "unavailable") {
        res.json({ success: true, data: { slug: found.qr.slug, isActive: false, unavailableReason: found.reason } })
        return
      }
      const qr = found.qr

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
 * GET /api/public/qr/:slug/calendar.ics — an EVENT code's event for Apple
 * Calendar / Outlook (the scan page's "Add to calendar"). Same gate as the page.
 */
router.get("/qr/:slug/calendar.ics", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const found = await servableQR(req, String(req.params["slug"] ?? ""))
    if (found.status !== "ok" || found.qr.type !== "EVENT") {
      res.status(404).json({ success: false, error: "Event not found" })
      return
    }
    const ics = buildIcs(found.qr.content?.data as unknown as EventContent, found.qr.id)
    res.setHeader("Content-Type", "text/calendar; charset=utf-8")
    res.setHeader("Content-Disposition", 'inline; filename="event.ics"')
    res.setHeader("Cache-Control", "no-store")
    res.send(ics)
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/public/qr/:slug/responses — an answer to a FORM code's form, from
 * its scan page. Same gate as the page, rate-limited per IP, Turnstile when on.
 */
router.post("/qr/:slug/responses", formResponseLimiter, requireTurnstile, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const found = await servableQR(req, String(req.params["slug"] ?? ""))
    if (found.status !== "ok" || found.qr.type !== "FORM") {
      res.status(404).json({ success: false, error: "This form isn't available." })
      return
    }
    const { qr } = found
    const answers = (req.body as { answers?: unknown } | undefined)?.answers
    await recordResponse({ id: qr.id, name: qr.name, userId: qr.userId, content: (qr.content?.data ?? {}) as Record<string, unknown> }, answers)
    res.status(201).json({ success: true })
  } catch (err) {
    next(err)
  }
})

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
        res.json({ success: true, data: GENXQR_BRANDING })
        return
      }
      // On a customer's own domain the page is theirs, whatever slug is asked
      // for: never show another account's name or logo under their brand.
      const host = await resolveScanHost(requestHost(req))
      if (host.kind === "custom") {
        res.json({ success: true, data: await resolveBrandingForUser(host.ownerId) })
        return
      }
      if (host.kind === "unknown" || host.kind === "lapsed") {
        res.json({ success: true, data: GENXQR_BRANDING })
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
        // An agency's clients are its accounts, not businesses that signed up.
        prisma.user.count({ where: { managedClient: { is: null } } }),
        prisma.qRCode.aggregate({
          _count: { id: true },
          _sum: { scanCount: true },
        }),
      ])

      res.json({
        qrCodesGenerated: qrStats._count.id,
        activeBusinesses: userCount,
        totalScans: qrStats._sum.scanCount ?? 0,
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

/**
 * GET /api/public/report/:token?days=30 — an agency's share report for one
 * client (agency.service.ts getClientReport). Aggregates only; carries the
 * agency's brand. The token is the only key, 32 random bytes.
 */
router.get(
  "/report/:token",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = String(req.params["token"])
      if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new AppError(404, "Report not found.")
      const days = Number(req.query["days"] ?? 30)
      if (!(REPORT_DAYS as readonly number[]).includes(days)) throw new AppError(422, "days must be 7, 30 or 90")
      res.setHeader("Cache-Control", "no-store")
      res.setHeader("X-Robots-Tag", "noindex")
      res.json({ success: true, data: await getClientReport(token, days) })
    } catch (err) {
      next(err)
    }
  },
)

export default router
