import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import { z } from "zod"
import { staticQRLimiter } from "../middleware/rateLimit.middleware.js"
import { redis } from "../redis/client.js"
import { prisma } from "../db/prisma.js"

const router: IRouter = Router()

// ─── Validation Schema ────────────────────────────────────────────────────────

const StaticQRSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("url"),
    url: z.string().url("Invalid URL").max(2048),
  }),
  z.object({
    type: z.literal("wifi"),
    ssid: z.string().min(1, "SSID is required").max(64),
    password: z.string().max(128).default(""),
    security: z.enum(["WPA", "WEP", "nopass"]).default("WPA"),
    hidden: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("whatsapp"),
    phone: z
      .string()
      .regex(/^\+?[1-9]\d{6,14}$/, "Invalid phone number (e.g. +919876543210)"),
    message: z.string().max(1024).default(""),
  }),
  z.object({
    type: z.literal("instagram"),
    username: z
      .string()
      .regex(/^[a-zA-Z0-9._]{1,30}$/, "Invalid Instagram username"),
  }),
])

type StaticQRInput = z.infer<typeof StaticQRSchema>

// ─── QR Data Builder ──────────────────────────────────────────────────────────

function buildQRData(input: StaticQRInput): string {
  switch (input.type) {
    case "url":
      return input.url

    case "wifi":
      // RFC-compliant WiFi QR format
      return `WIFI:T:${input.security};S:${input.ssid};P:${input.password};H:${input.hidden};;`

    case "whatsapp": {
      const phone = input.phone.replace(/\D/g, "")
      const query = input.message
        ? `?text=${encodeURIComponent(input.message)}`
        : ""
      return `https://wa.me/${phone}${query}`
    }

    case "instagram":
      return `https://instagram.com/${input.username}`

    default:
      throw new Error(`Unsupported QR type: ${(input as { type: string }).type}`)
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/static/generate
 * Rate-limited: 10 req/min per IP.
 * Returns the QR data string for client-side rendering.
 * Also writes a StaticQRGeneration row for popularity analytics (fire-and-forget).
 */
router.post(
  "/generate",
  staticQRLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = StaticQRSchema.parse(req.body)
      const qrData = buildQRData(input)

      // Persist generation — non-blocking, never delays response
      prisma.staticQRGeneration
        .create({ data: { type: input.type, ip: req.ip ?? null } })
        .catch(() => { /* intentionally swallowed */ })

      res.json({ success: true, data: { qrData, type: input.type } })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * GET /api/static/rate-limit-check
 * Returns remaining requests within the current window for this IP.
 */
router.get(
  "/rate-limit-check",
  async (req: Request, res: Response): Promise<void> => {
    const ip = req.ip ?? "unknown"
    const key = `rl:static_qr:${ip}`
    const count = await redis.get(key)
    const used = parseInt(count ?? "0", 10)
    const remaining = Math.max(0, 10 - used)

    res.json({
      success: true,
      data: { remaining, limit: 10, isLimited: remaining === 0 },
    })
  },
)

export default router
