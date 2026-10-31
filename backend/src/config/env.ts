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
  // MaxMind GeoLite2 (scan geolocation). Downloaded from MaxMind with these;
  // without them there is no geo data (geo.service.ts). Free account.
  MAXMIND_ACCOUNT_ID: z.string().trim().optional(),
  MAXMIND_LICENSE_KEY: z.string().trim().optional(),
  // Cloudflare Turnstile (bot/abuse protection on register, login, contact).
  // Without the secret key the checks are skipped, so the forms keep working
  // in dev and until the key is set in production (turnstile.service.ts).
  TURNSTILE_SECRET_KEY: z.string().trim().optional(),
  // Custom domains via Cloudflare for SaaS (custom-domain.service.ts). All three
  // are needed; without them adding a domain answers 503 and nothing else changes.
  // Token: Zone > SSL and Certificates > Edit on the genxqr.com zone only.
  CLOUDFLARE_API_TOKEN: z.string().trim().optional(),
  CLOUDFLARE_ZONE_ID: z.string().trim().optional(),
  // The hostname customers CNAME to, e.g. "customers.genxqr.com" — the zone's
  // Cloudflare for SaaS fallback origin.
  CUSTOM_DOMAIN_TARGET: z.string().trim().optional(),
  // Single sign-on with Microsoft Entra ID (sso.service.ts): a multi-tenant app
  // registration ("Accounts in any organizational directory"), redirect URI
  // <BACKEND_URL>/api/auth/sso/callback/microsoft. Without these, Microsoft SSO
  // answers 503. Google SSO reuses GOOGLE_CLIENT_ID/SECRET, with redirect URI
  // <BACKEND_URL>/api/auth/sso/callback/google added to that client.
  MICROSOFT_CLIENT_ID: z.string().trim().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().trim().optional(),
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
  // (PUPPETEER_EXECUTABLE_PATH removed: invoice PDFs are drawn with pdfkit and
  // no longer need a browser. The variable can be deleted from any env file.)
})

export type Env = z.infer<typeof envSchema>

const _parsed = envSchema
  .superRefine((e, ctx) => {
    // The example env's placeholder is 47 characters, so min(32) let a copied
    // .env.example boot production with a public signing key — anyone could
    // then mint admin tokens.
    if (e.NODE_ENV !== "production") return
    for (const key of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"] as const) {
      if (/CHANGE_ME|changeme|your[-_]?secret|placeholder/i.test(e[key])) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} is still the example placeholder` })
      }
    }
    if (e.JWT_ACCESS_SECRET === e.JWT_REFRESH_SECRET) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["JWT_REFRESH_SECRET"], message: "JWT_REFRESH_SECRET must differ from JWT_ACCESS_SECRET" })
    }
  })
  .safeParse(process.env)

if (!_parsed.success) {
  console.error("❌ Invalid environment variables:")
  console.error(JSON.stringify(_parsed.error.flatten().fieldErrors, null, 2))
  process.exit(1)
}

export const env = _parsed.data
