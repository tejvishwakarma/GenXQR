/**
 * GET /widget.js
 *
 * Serves a self-contained JavaScript snippet that renders a QR code SVG
 * into a page element. Designed for third-party website embedding:
 *
 *   <div id="my-qr"></div>
 *   <script src="https://yourapp.com/widget.js?slug=abc123&container=my-qr" async></script>
 *
 * If `container` is omitted the script inserts the QR directly after itself
 * (i.e. into the <script> tag's parentElement).
 *
 * Query parameters
 * ─────────────────
 *  slug       (required) – public QR code slug
 *  size       (optional) – SVG width/height in px, 100–1000, default 200
 *  container  (optional) – ID of the DOM element to insert the QR into
 *
 * Security notes
 * ──────────────
 *  • slug is validated against the DB; only active QR codes are served.
 *  • size is clamped to [100, 1000] to prevent ridiculous values.
 *  • container is validated as a safe identifier to prevent XSS injection.
 *  • All user-supplied values that appear in the JS output are JSON-encoded.
 *  • No auth required (the /r/:slug redirect URL is already public).
 */

import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import { z } from "zod"
import QRCode from "qrcode"
import { prisma } from "../db/prisma.js"

const router: IRouter = Router()

const WidgetQuerySchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/, "Invalid slug"),
  size: z.coerce
    .number()
    .int()
    .min(100)
    .max(1000)
    .default(200),
  container: z
    .string()
    .max(64)
    .regex(/^[a-zA-Z0-9_-]*$/, "Invalid container ID")
    .optional(),
})

/**
 * GET /widget.js
 */
router.get(
  "/",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = WidgetQuerySchema.safeParse(req.query)
      if (!parsed.success) {
        res.status(400).type("text/javascript").send(
          `console.error("GenXQR widget: invalid parameters — ${parsed.error.issues[0]?.message ?? "bad request"}");`,
        )
        return
      }

      const { slug, size, container } = parsed.data

      // Resolve slug → active QR in DB (slug is public; only serve active QRs)
      const qr = await prisma.qRCode.findFirst({
        where: { slug, isActive: true },
        select: { id: true, slug: true },
      })

      if (!qr) {
        res.status(404).type("text/javascript").send(
          `console.error("GenXQR widget: QR code '${slug}' not found or is inactive.");`,
        )
        return
      }

      const host = process.env["APP_URL"] ?? `${req.protocol}://${req.host}`
      const encodedUrl = `${host}/r/${qr.slug}`

      const svg = await QRCode.toString(encodedUrl, {
        type: "svg",
        errorCorrectionLevel: "H",
        margin: 2,
        width: size,
      })

      // JSON-encode both values before embedding in JS to prevent XSS
      const svgJson = JSON.stringify(svg)
      const containerJson = container ? JSON.stringify(container) : "null"

      // Minimal self-executing bundle — no external dependencies
      const js = `(function(){
  var svg=${svgJson};
  var containerId=${containerJson};
  var target=containerId?document.getElementById(containerId):null;
  if(!target&&typeof document.currentScript!=='undefined'&&document.currentScript){
    target=document.currentScript.parentElement;
  }
  if(target){
    var wrapper=document.createElement('div');
    wrapper.className='GenXQR-widget';
    wrapper.innerHTML=svg;
    var svgEl=wrapper.querySelector('svg');
    if(svgEl){svgEl.setAttribute('width','${size}');svgEl.setAttribute('height','${size}');}
    target.appendChild(wrapper);
  }else{
    console.warn('GenXQR widget: could not find a container element. Pass container="your-element-id".');
  }
})();`

      // 1-hour cache — the widget content is stable unless the QR is updated
      res
        .setHeader("Content-Type", "text/javascript; charset=utf-8")
        .setHeader("Cache-Control", "public, max-age=3600")
        .setHeader("X-Content-Type-Options", "nosniff")
        .send(js)
    } catch (err) {
      next(err)
    }
  },
)

export default router
