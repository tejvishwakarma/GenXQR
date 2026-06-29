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
  PAYU_MERCHANT_KEY: z.string().optional(),
  PAYU_MERCHANT_SALT: z.string().optional(),
  PAYU_BASE_URL: z.string().default("https://test.payu.in/_payment"),
  // Base URL PayU POSTs callbacks to. Must be publicly reachable.
  // Dev:  http://localhost:3001  (direct backend — bypasses Vite proxy)
  // Prod: https://genxqr.in    (Nginx proxies /api/* to backend)
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
