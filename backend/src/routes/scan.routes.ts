import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { prisma } from "../db/prisma.js"
import { resolveQRScan } from "../services/scan.service.js"
import { env } from "../config/env.js"
import { logger } from "../logger/index.js"
import { authLimiter } from "../middleware/rateLimit.middleware.js"

const router: IRouter = Router()

// ─── Security: escape pixel IDs before embedding in HTML/JS ─────────────────
// Pixel IDs (FB, GA, GTM) are user-supplied. Even though the schema enforces a
// safe regex format, we apply a second escaping layer here so that any value
// that somehow bypasses Zod cannot break out of a JS string literal.
function escapeForJS(s: string): string {
  return s.replace(/['"\\<>&]/g, (c) =>
    ({ "'": "\\'", '"': '\\"', "\\": "\\\\", "<": "\\x3c", ">": "\\x3e", "&": "\\x26" }[c] ?? c),
  )
}

// ─── Helper: extract real client IP ───────────────────────────────────────────

function getClientIP(req: Request): string {
  // trust proxy=1 is set in app.ts, so Express correctly resolves req.ip from
  // the last untrusted X-Forwarded-For entry. Reading the header directly would
  // allow client IP spoofing by prepending arbitrary values to the header.
  return req.ip ?? "0.0.0.0"
}

// ─── GET /r/:slug — Main scan resolution endpoint ────────────────────────────

router.get(
  "/:slug",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const slug = String(req.params["slug"] ?? "")
      if (!slug || !/^[a-zA-Z0-9_-]{4,32}$/.test(slug)) {
        res.status(404).send("Not found")
        return
      }

      const ip = getClientIP(req)
      const uaHeader = req.headers["user-agent"]
      const ua = typeof uaHeader === "string" ? uaHeader : undefined
      const refHeader = req.headers["referer"] ?? req.headers["referrer"]
      const ref = typeof refHeader === "string" ? refHeader : undefined

      const resolution = await resolveQRScan(slug, ip, ua, ref)

      // Never let a scan response be cached. The whole premise of a dynamic QR is
      // that its destination can change after the code is printed, so a cached
      // redirect is a wrong answer with a long life: a phone that scanned before a
      // smart-routing rule, an A/B test or an edited URL was added will keep going
      // to the old destination, and the owner sees their change "not working" with
      // no way to tell why. Set before the switch so every branch is covered —
      // redirect, pixel trampoline, landing page, password and expired alike.
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
      res.setHeader("Pragma", "no-cache")   // for HTTP/1.0 proxies still in the path
      res.setHeader("Expires", "0")

      switch (resolution.action) {
        case "redirect":
          // Validate destination is a safe URL before redirecting
          if (!resolution.url.startsWith("http://") && !resolution.url.startsWith("https://")) {
            res.status(400).send("Invalid destination URL")
            return
          }
          res.redirect(302, resolution.url)
          break

        case "pixel_redirect": {
          // Serve a small HTML trampoline that fires tracking pixels,
          // then redirects immediately via window.location.
          const { url, fbPixelId, gaId, gtmId } = resolution
          if (!url.startsWith("http://") && !url.startsWith("https://")) {
            res.status(400).send("Invalid destination URL")
            return
          }
          // escapeForJS correctly escapes backslash, quotes, and angle brackets so
          // the URL cannot break out of the single-quoted JS string literal below.
          const escapedUrl = escapeForJS(url)
          // escapeForJS is the defence-in-depth layer; format is already enforced by the
          // Zod schema on these fields, but we escape here too for belt-and-suspenders.
          const safeGaId   = gaId       ? escapeForJS(gaId)       : null
          const safeGtmId  = gtmId      ? escapeForJS(gtmId)      : null
          const safeFbId   = fbPixelId  ? escapeForJS(fbPixelId)  : null
          const gaSnippet = safeGaId
            ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(safeGaId)}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${safeGaId}');</script>`
            : ""
          const gtmSnippet = safeGtmId
            ? `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${safeGtmId}');</script>`
            : ""
          const fbSnippet = safeFbId
            ? `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${safeFbId}');fbq('track','PageView');</script>`
            : ""
          res.setHeader("Content-Type", "text/html; charset=utf-8")
          res.send(`<!DOCTYPE html><html><head><meta charset="utf-8">
${gaSnippet}${gtmSnippet}${fbSnippet}
<script>setTimeout(function(){window.location.replace('${escapedUrl}');},150);</script>
</head><body></body></html>`)
          break
        }

        case "landing":
          // Redirect to the frontend landing page
          res.redirect(302, `${env.FRONTEND_URL}/l/${slug}`)
          break

        case "password":
          res.redirect(302, `${env.FRONTEND_URL}/r/${slug}/password`)
          break

        case "expired": {
          const fallback = resolution.fallbackUrl
          if (fallback && (fallback.startsWith("http://") || fallback.startsWith("https://"))) {
            res.redirect(302, fallback)
          } else {
            res.redirect(302, `${env.FRONTEND_URL}/r/${slug}/expired?reason=${resolution.reason}`)
          }
          break
        }

        default:
          res.status(404).send("Not found")
      }
    } catch (err) {
      next(err)
    }
  },
)

// ─── POST /r/:slug/password — Verify password for protected QR ───────────────

const PasswordSchema = z.object({
  password: z.string().min(1).max(128),
})

router.post(
  "/:slug/password",
  authLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const slug = String(req.params["slug"] ?? "")
      if (!slug || !/^[a-zA-Z0-9_-]{4,32}$/.test(slug)) {
        res.status(404).json({ success: false, error: "QR code not found" })
        return
      }

      const parsed = PasswordSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ success: false, error: "Password is required" })
        return
      }

      const qr = await prisma.qRCode.findUnique({
        where: { slug: String(slug) },
        select: {
          id: true,
          isActive: true,
          isPasswordProtected: true,
          passwordHash: true,
          type: true,
          content: { select: { data: true } },
        },
      })

      if (!qr || !qr.isActive) {
        res.status(404).json({ success: false, error: "QR code not found or inactive" })
        return
      }

      if (!qr.isPasswordProtected || !qr.passwordHash) {
        res.status(400).json({ success: false, error: "QR code is not password protected" })
        return
      }

      const valid = await bcrypt.compare(parsed.data.password, qr.passwordHash)
      if (!valid) {
        res.status(401).json({ success: false, error: "Incorrect password" })
        return
      }

      // Determine destination after successful password verification
      const REDIRECT_TYPES = new Set(["URL", "WHATSAPP", "INSTAGRAM", "FACEBOOK"])
      const content = (qr.content as { data?: Record<string, unknown> } | null)?.data ?? {}

      let destination: string | null = null

      if (REDIRECT_TYPES.has(qr.type)) {
        switch (qr.type) {
          case "URL": {
            const raw = typeof content.url === "string" ? content.url.trim() : null
            if (raw) {
              if (/^https?:\/\//i.test(raw)) {
                destination = raw
              } else if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
                destination = `https://${raw}`
              }
            }
            break
          }
          case "WHATSAPP": {
            const phone = String(content.phone ?? "").replace(/\D/g, "")
            const msg = content.message ? `?text=${encodeURIComponent(String(content.message))}` : ""
            destination = phone ? `https://wa.me/${phone}${msg}` : null
            break
          }
          case "INSTAGRAM":
            destination = typeof content.username === "string"
              ? `https://instagram.com/${content.username}`
              : null
            break
          case "FACEBOOK": {
            const raw = typeof (content.pageUrl ?? content.url) === "string"
              ? String(content.pageUrl ?? content.url).trim() : null
            if (raw) {
              if (/^https?:\/\//i.test(raw)) {
                destination = raw
              } else if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
                // Only prepend https:// if the value has no scheme at all (not javascript:, data:, etc.)
                destination = `https://${raw}`
              }
            }
            break
          }
        }
      }

      if (!destination) {
        destination = `${env.FRONTEND_URL}/l/${slug}`
      }

      res.json({ success: true, data: { destination } })
    } catch (err) {
      next(err)
    }
  },
)

export default router
