import express, { type Application } from "express"
import helmet from "helmet"
import cors from "cors"
import cookieParser from "cookie-parser"
import morgan from "morgan"
import passport from "passport"
import path from "path"
import { env } from "./config/env.js"
import { logger } from "./logger/index.js"
import { errorHandler } from "./middleware/error.middleware.js"
import { apiLimiter } from "./middleware/rateLimit.middleware.js"
import router from "./routes/index.js"
import v1Router from "./routes/v1.routes.js"
import scanRouter from "./routes/scan.routes.js"
import widgetRouter from "./routes/widget.routes.js"
import adminRouter from "./routes/admin.routes.js"
import { UPLOAD_BASE } from "./routes/upload.routes.js"

// ─── BigInt → Number for JSON responses (Prisma QRFile.sizeBytes) ─────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(BigInt.prototype as any).toJSON = function () { return Number(this) }

const app: Application = express()

// ─── Trust proxy (for correct IP behind Nginx) ────────────────────────────────
app.set("trust proxy", 1)

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(
  helmet({
    // Relax CSP in dev so the API works with the Vite dev server
    contentSecurityPolicy: env.NODE_ENV === "production",
  }),
)

// ─── CORS ────────────────────────────────────────────────────────────────────
// In dev, accept both http and https variants of the frontend URL so Vite's
// optional HTTPS mode doesn't cause preflight failures.
const allowedOrigins = new Set(
  [env.FRONTEND_URL, env.FRONTEND_URL.replace(/^http:/, "https:"), env.FRONTEND_URL.replace(/^https:/, "http:")]
    .filter(Boolean),
)

// PayU callback routes are server-to-server POSTs — PayU's servers send an
// Origin header that is not our frontend. Bypass CORS for these paths entirely.
// They are protected by HMAC hash verification inside the route handler instead.
const PAYU_CALLBACK_PATHS = new Set([
  "/api/billing/payu-success",
  "/api/billing/payu-failure",
])

app.use((req, res, next) => {
  if (PAYU_CALLBACK_PATHS.has(req.path)) return next()
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (curl, mobile apps, server-to-server)
      if (!origin) return cb(null, true)
      // In development, allow any localhost or private-network origin regardless of port
      if (env.NODE_ENV === "development" && /^https?:\/\/(localhost|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(origin)) return cb(null, true)
      if (allowedOrigins.has(origin)) return cb(null, true)
      cb(new Error(`CORS: origin '${origin}' not allowed`))
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })(req, res, next)
})

// ─── Body parsing ─────────────────────────────────────────────────────────────
// The verify callback saves the raw request buffer for the Razorpay webhook
// route so that HMAC signature verification works against the original bytes.
app.use(
  express.json({
    limit: "1mb",
    verify: (req, _res, buf) => {
      if (
        (req as typeof req & { originalUrl?: string }).originalUrl?.includes(
          "/billing/webhook",
        )
      ) {
        ;(req as typeof req & { rawBody?: string }).rawBody = buf.toString("utf8")
      }
    },
  }),
)
app.use(express.urlencoded({ extended: true, limit: "1mb" }))
app.use(cookieParser())

// ─── HTTP request logging ─────────────────────────────────────────────────────
app.use(
  morgan("combined", {
    stream: { write: (msg: string) => logger.http(msg.trim()) },
    skip: (req) => req.path === "/health",
  }),
)

// ─── Passport (initialise — strategies are registered in route modules) ───────
app.use(passport.initialize())

// ─── Rate limiting ────────────────────────────────────────────────────────────
app.use("/api", apiLimiter)

// ─── API routes ───────────────────────────────────────────────────────────────
app.use("/api", router)

// ─── Developer REST API (API key auth) ───────────────────────────────────────
app.use("/v1", v1Router)

// ─── Admin API (ADMIN / SUPER_ADMIN role required) ────────────────────────────
app.use("/admin-api", adminRouter)

// ─── QR scan resolution — must be registered before the 404 handler ──────────
// /r/:slug → resolves QR scans (redirect or landing page)
app.use("/r", scanRouter)

// ─── Embeddable QR widget — public, no auth ───────────────────────────────────
// /widget.js?slug=<slug>&size=200&container=<elementId>
app.use("/widget.js", widgetRouter)

// ─── Static file serving — uploaded files ─────────────────────────────────────
// Security headers applied before express.static so every uploaded file:
//   • Is downloaded rather than rendered inline (Content-Disposition: attachment)
//   • Has a restrictive CSP preventing any script execution if a browser ignores the above
//   • Gets X-Content-Type-Options: nosniff to prevent MIME-sniffing overrides

// Avatars are an exception — they must render inline inside <img> tags
app.use("/uploads/avatars", (_req, res, next) => {
  res.setHeader("Content-Disposition", "inline")
  res.setHeader("X-Content-Type-Options", "nosniff")
  next()
})
app.use("/uploads/avatars", express.static(path.join(UPLOAD_BASE, "avatars")))

// Applicant CVs share the uploads tree but are NOT public. They are served
// only by GET /admin-api/careers/applications/:id/cv, which authenticates the
// caller first. express.static below would otherwise hand out any CV to anyone
// who guessed a filename, exposing applicants' personal data. Blocked here as
// well as in nginx (deploy/cloudpanel-vhost-nodejs.conf) so neither layer can
// leak them on its own.
app.use("/uploads/cvs", (_req, res) => {
  res.status(404).json({ success: false, error: "Not found" })
})

app.use("/uploads", (_req, res, next) => {
  res.setHeader("Content-Disposition", "attachment")
  res.setHeader("Content-Security-Policy", "default-src 'none'")
  res.setHeader("X-Content-Type-Options", "nosniff")
  next()
})
app.use("/uploads", express.static(UPLOAD_BASE))

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() })
})

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Route not found" })
})

// ─── Global error handler ─────────────────────────────────────────────────────
app.use(errorHandler)

export default app
