import { z } from "zod"

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z
    .string()
    .default("3001")
    .transform((v) => parseInt(v, 10)),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().optional(),
  GOOGLE_DRIVE_REDIRECT_URI: z.string().optional(),
  FRONTEND_URL: z.string().default("http://localhost:5173"),
  RESEND_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : undefined)),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default("GenXQR <no-reply@genxqr.com>"),
  // ─── Cashfree Payments (the only payment gateway) ───────────────────────────
  // App ID and Secret Key from the Cashfree merchant dashboard. The secret key
  // doubles as the webhook signing key — Cashfree does not issue a separate one.
  CASHFREE_APP_ID: z.string().optional(),
  CASHFREE_SECRET_KEY: z.string().optional(),
  // Sandbox: https://sandbox.cashfree.com/pg   Production: https://api.cashfree.com/pg
  CASHFREE_API_BASE: z.string().default("https://sandbox.cashfree.com/pg"),
  // Cashfree pins request AND response shape to this header, so it is pinned
  // explicitly rather than left to the account default. Confirm the value your
  // merchant account is provisioned for before going live — the API reference
  // and the older integration guide disagree (2026-01-01 vs 2025-01-01).
  CASHFREE_API_VERSION: z.string().default("2026-01-01"),
  // Public origin the browser is returned to, and that Cashfree posts webhooks
  // to. Must be publicly reachable in production.
  // Dev:  http://localhost:3001  (direct backend — bypasses Vite proxy)
  // Prod: https://genxqr.com    (Nginx proxies /api/* to backend)
  BACKEND_URL: z.string().default("http://localhost:3001"),
  // Override Puppeteer's bundled Chromium — required on ARM servers (Oracle Cloud Ampere).
  // Set to /usr/bin/chromium-browser on Ubuntu ARM64.
  PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>

const _parsed = envSchema.safeParse(process.env)

if (!_parsed.success) {
  console.error("❌ Invalid environment variables:")
  console.error(JSON.stringify(_parsed.error.flatten().fieldErrors, null, 2))
  process.exit(1)
}

export const env = _parsed.data
