# GenXQR — Project Memory File

> **Purpose:** This file is the single authoritative reference for the GenXQR codebase. Read this file first — do NOT scan the entire repo before making changes. Every architectural decision, data model, API surface, and file-tree detail you need is documented here.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Monorepo Layout](#2-monorepo-layout)
3. [Technology Stack](#3-technology-stack)
4. [Environment Variables](#4-environment-variables)
5. [Backend Architecture](#5-backend-architecture)
   - 5.1 [Entry Point & Server Startup](#51-entry-point--server-startup)
   - 5.2 [Express App Configuration](#52-express-app-configuration)
   - 5.3 [Route Map — All API Endpoints](#53-route-map--all-api-endpoints)
   - 5.4 [Middleware Stack](#54-middleware-stack)
   - 5.5 [Services Layer](#55-services-layer)
   - 5.6 [BullMQ Workers](#56-bullmq-workers)
   - 5.7 [Redis Client](#57-redis-client)
6. [Database Schema (Prisma / PostgreSQL)](#6-database-schema-prisma--postgresql)
   - 6.1 [Enums](#61-enums)
   - 6.2 [Models & Relationships](#62-models--relationships)
7. [Authentication System](#7-authentication-system)
8. [Billing System (PayU)](#8-billing-system-payu)
9. [File Upload & Storage](#9-file-upload--storage)
10. [QR Code Engine](#10-qr-code-engine)
11. [Frontend Architecture](#11-frontend-architecture)
    - 11.1 [Routing & Layouts](#111-routing--layouts)
    - 11.2 [All Pages — File Map](#112-all-pages--file-map)
    - 11.3 [Components](#113-components)
    - 11.4 [API Client (`lib/api.ts`)](#114-api-client-libapits)
    - 11.5 [Hooks](#115-hooks)
    - 11.6 [i18n (Internationalization)](#116-i18n-internationalization)
12. [Admin Panel](#12-admin-panel)
13. [Team Management](#13-team-management)
14. [Analytics](#14-analytics)
15. [Webhooks](#15-webhooks)
16. [PWA & Service Worker](#16-pwa--service-worker)
17. [Production Deployment](#17-production-deployment)
18. [Dev Scripts & Commands](#18-dev-scripts--commands)
19. [Key Design Patterns & Conventions](#19-key-design-patterns--conventions)
20. [Known Gotchas & Non-Obvious Decisions](#20-known-gotchas--non-obvious-decisions)

---

## 1. Project Overview

**GenXQR** is a full-stack SaaS QR code management platform available at `genxqr.com`.

**Core value proposition:**
- Create **static** and **dynamic** QR codes for URLs, PDFs, videos, vCards, WiFi credentials, social media profiles, business cards, app downloads, image galleries, audio (MP3), menus, WhatsApp, Instagram, Facebook, and coupons.
- Dynamic QR codes have editable destinations, scan tracking with geolocation/device/browser analytics, A/B testing, smart routing rules (by time, device, geo), password protection, scan limits, expiry dates, and custom landing pages.
- Plans: FREE → STARTER → PRO → BUSINESS → ENTERPRISE (gated by `plan-gate.middleware.ts`).
- Team workspaces with OWNER / ADMIN / EDITOR / VIEWER roles.
- Public REST developer API authenticated with API keys (`/v1/...`).
- Admin panel for super-admins to manage users, subscriptions, revenue, abuse, email broadcasts, platform settings.

---

## 2. Monorepo Layout

```
genx-qr/                         ← Repository root
├── backend/                      ← Node.js / Express API
│   ├── prisma/
│   │   ├── schema.prisma         ← Single source of truth for DB schema
│   │   ├── seed.mjs              ← Seeds plan table + super admin user
│   │   └── migrations/           ← Auto-generated Prisma migration files
│   ├── scripts/
│   │   ├── update-geo-db.mjs     ← Downloads MaxMind GeoLite2 DB
│   │   └── vault-setup.sh        ← One-time HashiCorp Vault config (prod secrets)
│   ├── src/
│   │   ├── index.ts              ← Server entry: DB connect, workers, listen
│   │   ├── app.ts                ← Express app: middleware, routes, static files
│   │   ├── config/env.ts         ← Zod-validated env schema
│   │   ├── db/prisma.ts          ← Prisma client singleton
│   │   ├── redis/client.ts       ← ioredis client singleton
│   │   ├── logger/               ← Winston logger (console + file)
│   │   ├── middleware/           ← auth, admin, apikey, error, rate-limit, plan-gate
│   │   ├── routes/               ← One file per feature domain
│   │   ├── services/             ← Business logic, one file per domain
│   │   ├── types/                ← Shared TS type declarations
│   │   ├── utils/                ← Small pure helpers
│   │   └── workers/              ← BullMQ scan + renewal-reminder workers
│   ├── data/                     ← MaxMind .mmdb geo database (gitignored)
│   ├── uploads/                  ← User-uploaded files (served at /uploads/*)
│   ├── .env                      ← Actual secrets (gitignored)
│   └── .env.example              ← Reference for every required variable
├── frontend/                     ← React 19 SPA (Vite + TypeScript + Tailwind)
│   ├── public/                   ← Static assets, manifest.json, robots.txt
│   ├── src/
│   │   ├── main.tsx              ← React entry, QueryClientProvider, i18n init
│   │   ├── App.tsx               ← BrowserRouter + all route definitions
│   │   ├── index.css             ← Global Tailwind base styles + custom tokens
│   │   ├── assets/               ← Bundled images/icons
│   │   ├── components/
│   │   │   ├── layout/           ← MarketingLayout, DashboardLayout, AdminLayout, Navbar, Footer
│   │   │   ├── ui/               ← badge, button, card, input, select, social-icon, LanguageSwitcher
│   │   │   ├── admin/            ← Admin-specific UI components
│   │   │   └── SEOMeta.tsx       ← react-helmet-async wrapper
│   │   ├── hooks/                ← useTheme, useSubscription, usePlatformStats, useCountUp
│   │   ├── i18n/index.ts         ← i18next setup (HTTP backend + browser detector)
│   │   ├── lib/
│   │   │   ├── api.ts            ← All API functions + TypeScript interfaces (~1700 lines)
│   │   │   └── utils.ts          ← cn() helper (clsx + tailwind-merge)
│   │   └── pages/
│   │       ├── auth/             ← Login, Signup, ForgotPassword, ResetPassword, VerifyEmail, InviteAccept
│   │       ├── marketing/        ← Public marketing + legal pages (17 files)
│   │       ├── dashboard/        ← Authenticated app pages (17 files)
│   │       ├── admin/            ← Admin panel pages (18 files)
│   │       ├── landing/          ← Dynamic QR landing page (LandingPage.tsx + templates/)
│   │       ├── scan/             ← PasswordPage, ExpiredPage
│   │       └── static-qr/       ← StaticGeneratePage (guest-accessible QR creator)
│   ├── vite.config.ts            ← Vite 7 + React plugin + PWA plugin + proxy rules
│   ├── tailwind.config.js        ← Tailwind custom colors, fonts, animations
│   └── postcss.config.js
├── integrations/                 ← Third-party platform integrations
│   ├── zapier/                   ← Zapier app (TypeScript, zapier-platform-core)
│   │   └── src/                  ← 4 triggers + 4 actions + auth + utils
│   ├── make/                     ← Make (Integromat) app (pure JSON manifests)
│   │   ├── app.json              ← App metadata
│   │   └── src/                  ← connections, modules, rpcs, webhooks
│   └── n8n/                      ← n8n community node (TypeScript npm package)
│       ├── credentials/          ← GenXQRApi.credentials.ts
│       └── nodes/GenXQR/        ← GenXQR.node.ts + GenXQRTrigger.node.ts
├── package.json                  ← Root workspace (pnpm) — scripts for both packages
├── pnpm-workspace.yaml           ← Declares backend/* and frontend/* workspaces
├── ecosystem.config.cjs          ← PM2 cluster config for production
├── nginx.conf                    ← Nginx config for genxqr.com
├── dev.ps1                       ← PowerShell dev launcher (opens terminals for FE + BE)
└── dev.bat                       ← Windows batch launcher shortcut
```

---

## 3. Technology Stack

### Backend
| Layer | Technology |
|---|---|
| Runtime | Node.js (ESM, TypeScript compiled with `tsx` in dev, `tsc` for prod) |
| Framework | Express 4 |
| ORM | Prisma 5 (PostgreSQL) |
| Cache / Queue | Redis (ioredis) + BullMQ |
| Auth | JWT (access 15m + refresh 30d via HttpOnly cookie) + Passport (Google OAuth 2.0) |
| Passwords | bcryptjs |
| Email | Resend (primary) + Nodemailer SMTP (fallback) |
| File uploads | Multer (disk storage) |
| QR generation | `qrcode` npm package |
| Geo lookup | MaxMind GeoLite2 via `maxmind` |
| CSV parsing | `csv-parse` |
| ZIP archives | `archiver` |
| Google Drive | `googleapis` |
| Payments | PayU (Indian payment gateway) |
| Validation | Zod |
| Logging | Winston |
| HTTP logging | Morgan |
| Security | Helmet, express-rate-limit, rate-limit-redis |
| Process manager | PM2 (production) |

### Frontend
| Layer | Technology |
|---|---|
| Framework | React 19 |
| Build tool | Vite 7 |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 3 + tailwindcss-animate |
| Routing | React Router DOM 7 |
| Server state | TanStack Query (React Query) v5 |
| Forms | React Hook Form + Zod resolvers |
| UI primitives | Radix UI (Avatar, Dialog, DropdownMenu, Label, Progress, ScrollArea, Select, Separator, Slot, Switch, Tabs, Tooltip) |
| Icons | Lucide React |
| Charts | Recharts |
| QR rendering | `qr-code-styling` (client-side canvas rendering) |
| QR scanning | `jsqr` (camera-based scanner) |
| i18n | i18next + react-i18next (HTTP backend + browser detector) |
| SEO | react-helmet-async |
| PWA | vite-plugin-pwa (Workbox, autoUpdate, offline cache) |
| File archiving | JSZip |
| Social icons | simple-icons |

---

## 4. Environment Variables

All required variables — see `backend/.env.example` for full reference.

```bash
# Application
NODE_ENV=development
PORT=3001

# Database (PostgreSQL)
DATABASE_URL="postgresql://GenXQR:password@localhost:5432/GenXQR?schema=public"

# Redis (BullMQ + rate limiting)
REDIS_URL="redis://localhost:6379"

# JWT
JWT_ACCESS_SECRET="<64-char hex secret>"
JWT_REFRESH_SECRET="<different 64-char hex secret>"
JWT_ACCESS_EXPIRES_IN="15m"       # default
JWT_REFRESH_EXPIRES_IN="30d"      # default

# Google OAuth (optional — disables Google login if omitted)
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_CALLBACK_URL="http://localhost:3001/api/auth/google/callback"
GOOGLE_DRIVE_REDIRECT_URI=""

# Frontend (CORS allowlist)
FRONTEND_URL="http://localhost:5173"

# Email — Option 1: Resend
RESEND_API_KEY=""
# Email — Option 2: SMTP (fallback)
SMTP_HOST=""
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASS=""
EMAIL_FROM="GenXQR <no-reply@genxqr.com>"

# Payments (PayU — Indian gateway)
PAYU_MERCHANT_KEY=""
PAYU_MERCHANT_SALT=""
PAYU_BASE_URL="https://test.payu.in/_payment"  # change to secure.payu.in for live
```

### Frontend `.env.local`
```bash
VITE_API_URL=""                   # empty = same-origin (proxy handles it in dev)
VITE_PUBLIC_BASE_URL=""           # e.g. "https://192.168.1.x:5173" for LAN QR scan testing
```

---

## 5. Backend Architecture

### 5.1 Entry Point & Server Startup

**`backend/src/index.ts`** — startup sequence:
1. Connect PostgreSQL via Prisma
2. Connect Redis
3. Start BullMQ workers (`scan.worker` + `renewal-reminder.worker`)
4. Start Express HTTP server on `PORT` (default `3001`)
5. Register graceful shutdown on `SIGTERM` / `SIGINT`

### 5.2 Express App Configuration

**`backend/src/app.ts`**:
- `trust proxy 1` — correct IPs behind Nginx
- Helmet (CSP disabled in dev)
- CORS — allows `FRONTEND_URL` (both http/https variants) + any `localhost`/private-IP in dev
- `express.json` (1 MB limit) — raw body saved for `/billing/webhook` HMAC verification
- Morgan HTTP logging (skips `/health`)
- Passport initialized (Google strategy registered in `auth.routes.ts`)
- Rate limiter applied to `/api/*`

**Route prefixes:**
| Prefix | Router file | Auth |
|---|---|---|
| `/api/*` | `routes/index.ts` (aggregates all feature routers) | Mixed (per-route middleware) |
| `/v1/*` | `routes/v1.routes.ts` | API key auth (`apikey.middleware.ts`) |
| `/admin-api/*` | `routes/admin.routes.ts` | JWT + admin role |
| `/r/:slug` | `routes/scan.routes.ts` | Public (redirect engine) |
| `/widget.js` | `routes/widget.routes.ts` | Public |
| `/uploads/*` | `express.static` | Public; avatars served inline, others as attachment |
| `/health` | Inline handler | Public |

### 5.3 Route Map — All API Endpoints

#### `/api/auth` → `auth.routes.ts`
- `POST /register` — email+password signup; sends verification email
- `POST /login` — returns JWT access token + sets refresh token cookie
- `POST /logout` — clears refresh token cookie, revokes DB token
- `POST /refresh` — silently exchanges refresh cookie for new access token
- `GET  /verify-email?token=` — marks email as verified
- `POST /resend-verification` — resends verification email
- `POST /forgot-password` — sends password reset link
- `POST /reset-password` — validates token, updates password hash
- `GET  /me` — returns current user profile (requires auth)
- `PATCH /me` — update name / notification prefs
- `PATCH /me/avatar` — upload avatar (multipart/form-data)
- `DELETE /me/avatar` — remove avatar
- `DELETE /me` — delete own account (requires password confirmation)
- `PATCH /preferences` — update notification preferences
- `GET  /preferences` — get notification preferences
- `GET  /google` — initiates Google OAuth flow (Passport)
- `GET  /google/callback` — Google OAuth callback; issues one-time Redis code
- `POST /oauth-token` — exchanges one-time code for access token (single-use, 60s TTL)
- `GET  /gdrive/connect` — initiates Google Drive OAuth
- `GET  /gdrive/callback` — saves Drive tokens to user record
- `POST /gdrive/disconnect` — revokes Drive tokens

#### `/api/static` → `static.routes.ts`
- `POST /generate` — generates static QR code (no account needed), returns PNG buffer or SVG

#### `/api/public` → `public.routes.ts`
- `GET  /qr/:slug` — minimal QR content for the `/l/:slug` landing page (post-scan; 404s if inactive/password-protected)
- `GET  /stats` — aggregate platform stats for the homepage (`qrCodesGenerated`, `activeBusinesses`, `totalScans`, `uptimeSla`)
- `GET  /site-content` — changelog + careers section content (from `PlatformSetting`, with static fallbacks)

Plans live at `GET /api/billing/plans` (in `billing.routes.ts`, unauthenticated despite the `/billing` prefix), not under `/api/public` — a previous version of this doc had that wrong. Job listings have their own router too: `/api/careers` → `careers.routes.ts` (`GET /jobs` public; the rest CV/application-management, admin-only). `/api/support` and `/api/notifications` also exist and aren't detailed here yet.

#### `/api/qr` → `qr.routes.ts`
- `POST /` — create a new QR code (dynamic or static, PLAN-GATED)
- `GET  /` — list user's QR codes (paginated, filterable by type/category/tag/search)
- `GET  /:id` — get single QR code with content + design + files
- `PUT  /:id` — update QR code content + design
- `DELETE /:id` — delete QR code
- `PATCH /:id/toggle` — activate / deactivate
- `GET  /:id/export` — download QR code as PNG (server-side `qrcode` generation)
- `POST /:id/duplicate` — duplicate QR code (PLAN-GATED)
- `GET  /tags` — list all unique tags for the authenticated user

#### `/api/upload` → `upload.routes.ts`
- `POST /file` — upload a file (PDF/MP3/Video/Image) — stores to disk, returns temp URL
- `DELETE /file` — delete an uploaded file by URL

#### `/api/analytics` → `analytics.routes.ts`
- `GET  /global` — global analytics across all user QR codes (total scans, today, countries, devices)
- `GET  /qr/:id` — per-QR scan analytics (time series, geo, device, browser breakdown)
- `GET  /qr/:id/scans` — paginated raw scan list

#### `/api/billing` → `billing.routes.ts`
- `GET  /subscription` — current plan + subscription status + trial info
- `GET  /usage` — usage counts (QR codes, scans, storage, API calls) vs plan limits
- `GET  /invoices` — paginated invoice history
- `POST /checkout` — creates PayU payment hash + returns form data for redirect
- `POST /webhook` — PayU webhook (HMAC verified from rawBody); activates subscription
- `POST /cancel` — schedules subscription cancellation at period end

#### `/api/apikeys` → `apikeys.routes.ts`
- `GET  /` — list API keys
- `POST /` — create new API key (returns the raw key once; only hash stored)
- `DELETE /:id` — revoke/delete API key

#### `/api/webhooks` → `webhook.routes.ts`
- `GET  /` — list webhooks
- `POST /` — create webhook (URL + event array + auto-generated HMAC secret)
- `PATCH /:id` — update webhook
- `DELETE /:id` — delete webhook
- `POST /:id/test` — send a test payload to the webhook URL

#### `/api/bulk` → `bulk.routes.ts`
- `POST /generate` — bulk QR generation from CSV (PLAN-GATED); returns ZIP of PNGs
- `GET  /download/:jobId` — download the generated ZIP

#### `/api/gdrive` → `gdrive.routes.ts`
- `POST /backup/:qrFileId` — backs up a QR file to user's Google Drive folder
- `GET  /status` — returns drive connection status

#### `/api/team` → `team.routes.ts`
- `GET  /` — get user's team (one team per user-owner model)
- `POST /` — create a team
- `PATCH /` — update team name
- `DELETE /` — delete team
- `GET  /members` — list team members
- `POST /invite` — invite a member by email (sends email with token)
- `POST /invite/resend/:inviteId` — resend invite email
- `DELETE /invite/:inviteId` — cancel invite
- `PATCH /members/:memberId/role` — change member role
- `DELETE /members/:memberId` — remove member
- `POST /leave` — leave team (non-owner only)
- `GET  /invites/pending` — list pending invites for the team
- `POST /join/:token` — accept invite by token (used on `/invite/:token` page)

#### `/api/report` → `report.routes.ts`
- `POST /` — submit abuse report (optionally by slug or QR ID; authenticated or anonymous)
- `GET  /my-qrs` — list abuse reports filed on the user's own QR codes

#### `/r/:slug` → `scan.routes.ts` (public — QR redirect engine)
- `GET  /:slug` — resolve a QR scan:
  1. Lookup QRCode by slug
  2. Enforce active/expired/password/scanLimit
  3. Log scan (async via BullMQ queue)
  4. Apply smart routing rule or A/B test variant
  5. Redirect (`302`) or render landing page (`/l/:slug`)

#### `/v1/*` → `v1.routes.ts` (API-key authenticated developer REST API)
- `/v1/qr` — CRUD for QR codes (mirrors `/api/qr` but key-auth)

#### `/admin-api/*` → `admin.routes.ts` (JWT + ADMIN/SUPER_ADMIN role)
- `/admin-api/dashboard` — aggregated metrics
- `/admin-api/users` — list/search/get/update/delete users, change plan, impersonate, force-verify-email, change-password, send-reminder
- `/admin-api/qr-codes` — list / deactivate / delete QR codes
- `/admin-api/analytics/signups` — daily signup trend
- `/admin-api/analytics/scans` — daily scan trend
- `/admin-api/revenue` — MRR, ARR, invoices
- `/admin-api/storage` — total storage, by type, cleanup orphans
- `/admin-api/audit` — searchable audit log
- `/admin-api/subscriptions` — list subscriptions, send renewal reminders
- `/admin-api/payments` — list invoices/payments
- `/admin-api/abuse/reports` — list/resolve abuse reports
- `/admin-api/abuse/blocklist` — add/remove/list blocklisted domains, IPs, emails, users
- `/admin-api/email/logs` — email send history
- `/admin-api/email/broadcast` — send email to a user segment
- `/admin-api/settings` — get/update `PlatformSetting` key-value store
- `/admin-api/support/tickets` — list/get/update support tickets

### 5.4 Middleware Stack

| File | Purpose |
|---|---|
| `auth.middleware.ts` | Extracts + verifies JWT Bearer token; attaches `req.user` |
| `admin.middleware.ts` | Requires `req.user.role === ADMIN or SUPER_ADMIN` |
| `apikey.middleware.ts` | Verifies API key hash from `Authorization: Bearer nxqr_...`; attaches `req.user` |
| `plan-gate.middleware.ts` | Checks user's active plan against a feature flag list before route handlers |
| `rateLimit.middleware.ts` | `apiLimiter` (global 60 req/min via Redis store) |
| `error.middleware.ts` | Global error handler; maps Zod errors → 400, JWT errors → 401, Prisma unique → 409, etc. |

### 5.5 Services Layer

All business logic lives in `src/services/`. Services return raw data; routes handle HTTP response serialization.

| Service | Responsibilities |
|---|---|
| `auth.service.ts` | Register, login, JWT issuance, refresh, token revocation, Google OAuth, password reset, email verification |
| `qr.service.ts` | Create/update/delete QR codes, generate PNG/SVG (server-side qrcode lib) |
| `scan.service.ts` | Resolve scan slug, apply routing/AB-test logic, record scan with geo data |
| `analytics.service.ts` | Aggregate scan data (time-series, geo, device, browser breakdown) |
| `billing.service.ts` | PayU hash generation, webhook processing, subscription creation/cancel, usage calculation |
| `email.service.ts` | HTML email templates, Resend SDK / Nodemailer fallback, EmailLog writes |
| `bulk.service.ts` | CSV parsing → batch QR generation → ZIP archive |
| `geo.service.ts` | IP-to-geo lookup using MaxMind mmdb |
| `apikeys.service.ts` | Create/list/revoke API keys; hash storage |
| `webhook.service.ts` | Deliver webhook payloads (HMAC signed) + log deliveries |
| `gdrive.service.ts` | OAuth flow, folder creation, file upload to Drive |
| `audit.service.ts` | Write/query audit log entries |
| `limit-notification.service.ts` | Check usage thresholds → send 80%/100% limit warning emails |
| `renewal-reminder.service.ts` | Send 7-day/3-day/1-day/expired renewal reminder emails |
| `team.service.ts` | Team/invite CRUD, invite accept flow, legacy PlatformSetting→Team migration |
| `admin-users.service.ts` | Admin user management: list/detail/update, plan change, delete, impersonate, force-verify, force-password, manual reminder |
| `admin-platform.service.ts` | Admin dashboard metrics, system health probes, QR admin actions, all analytics trends, revenue, storage, audit log, subscriptions, payments |
| `admin-moderation.service.ts` | Abuse reports, blocklist, email logs, broadcast, platform settings (owns `DEFAULT_SETTINGS`) |
| `admin-support.service.ts` | Support tickets, job postings, job applications, CV path resolution |

### 5.6 BullMQ Workers

| Worker | Queue name | Trigger | Job |
|---|---|---|---|
| `scan.worker.ts` | `scan-processing` | Every QR scan | Records `QRScan`, upserts `QRScanDaily`, increments `QRCode.scanCount`, fires webhooks, checks scan limits, fires limit notifications |
| `renewal-reminder.worker.ts` | Cron-based | Daily at midnight | Queries subscriptions expiring in 7/3/1 days → sends reminder emails; deduped by `RenewalReminder` table |
| `webhook-retry.worker.ts` | `setInterval` (60s) | Failed deliveries | Scans `WebhookDelivery` rows where `success=false` and `nextRetryAt <= now`; retries with exponential backoff (30s → 2m → 8m → 32m), max 5 attempts |

### 5.7 Redis Client

Single ioredis instance in `src/redis/client.ts`. Used for:
- Rate limiter store (`rate-limit-redis`)
- BullMQ job queues
- Google OAuth one-time code cache (60-second TTL)

---

## 6. Database Schema (Prisma / PostgreSQL)

Schema at: `backend/prisma/schema.prisma`

### 6.1 Enums

| Enum | Values |
|---|---|
| `Role` | USER, ADMIN, SUPER_ADMIN |
| `PlanName` | FREE, STARTER, PRO, BUSINESS, ENTERPRISE |
| `SubscriptionStatus` | ACTIVE, CANCELLED, PAST_DUE, TRIALING, PAUSED |
| `QRType` | URL, PDF, VIDEO, LINKS, SOCIAL_MEDIA, VCARD, IMAGE_GALLERY, BUSINESS, APP, MP3, MENU, WIFI, WHATSAPP, INSTAGRAM, FACEBOOK, COUPON |
| `QRCategory` | STATIC, DYNAMIC |
| `FileType` | PDF, MP3, VIDEO, IMAGE |
| `DeviceType` | MOBILE, TABLET, DESKTOP, UNKNOWN |
| `TicketStatus` | OPEN, IN_PROGRESS, RESOLVED, CLOSED |
| `TicketPriority` | LOW, MEDIUM, HIGH, URGENT |
| `TeamRole` | OWNER, ADMIN, EDITOR, VIEWER |

### 6.2 Models & Relationships

```
User
  ├── Subscription (1:1) ──▶ Plan
  ├── QRCode[] (1:N)
  │     ├── QRContent (1:1)           ← flexible JSON data blob
  │     ├── QRDesign (1:1)            ← colors, dot styles, logo, frame
  │     ├── QRFile[]                  ← uploaded PDF/MP3/Video/Image
  │     ├── QRScan[]                  ← individual scan events
  │     ├── QRScanDaily[]             ← aggregated daily counts (upserted)
  │     ├── SmartRoutingRule[]        ← condition-based URL routing
  │     ├── ABTestVariant[]           ← A/B test split URLs
  │     └── AbuseReport[]
  ├── ApiKey[]
  ├── Webhook[]
  │     └── WebhookDelivery[]
  ├── RefreshToken[]                  ← id = jti; hashed; revocable
  ├── PasswordResetToken[]            ← hashed, single-use, expires
  ├── EmailVerificationToken[]
  ├── Invoice[]
  ├── AuditLog[]
  ├── SupportTicket[]
  ├── Team[] (as owner)  ──▶ TeamMember[], TeamInvite[]
  └── TeamMember[] (as member)

Standalone tables:
  Blocklist            ← domain/ip/email/user bans (blockCount → permanent at 3)
  LimitAlert           ← dedup-key for 80%/100% limit emails
  RenewalReminder      ← dedup-key for renewal reminder emails
  EmailLog             ← every outgoing email logged
  PlatformSetting      ← key-value store for changelog, careers, feature flags
```

**Important QRCode fields:**
- `slug` — unique, URL-safe identifier embedded in QR codes; used in `/r/:slug`
- `category` — STATIC (data encoded in QR itself) vs DYNAMIC (redirect through `/r/:slug`)
- `isActive`, `activeFrom`, `activeUntil`, `scanLimit` — scheduling/expiry
- `isPasswordProtected` + `passwordHash` — password-protected scans
- `abTestEnabled`, `abTestSplitPct` — A/B test config
- `fbPixelId`, `gaId`, `gtmId` — tracking pixel injection on landing pages
- `fallbackUrl` — used when QR is expired/inactive but should redirect somewhere

---

## 7. Authentication System

**Flow:**
1. `POST /api/auth/login` → returns `accessToken` (JWT, 15 min) + sets `refreshToken` HttpOnly cookie (30 days)
2. Frontend stores `accessToken` in `localStorage`
3. All authenticated requests: `Authorization: Bearer <accessToken>`
4. On 401: `apiFetch` automatically calls `POST /api/auth/refresh` (sends cookie) → gets new `accessToken`
5. Refresh fails → `clearClientSession()` + redirect to `/login`

**Google OAuth:**
1. User clicks "Login with Google" → `GET /api/auth/google` → Passport redirect
2. Google callback → backend generates a **one-time Redis code** (60s TTL)
3. Backend redirects to frontend: `http://localhost:5173/app/dashboard?oauth_code=<code>`
4. `DashboardLayout.tsx` detects `oauth_code` param → calls `POST /api/auth/oauth-token`
5. Backend exchanges code for access token; returns it; frontend stores in localStorage
6. `useRef` guard prevents double-exchange in React 18 Strict Mode

**Token storage pattern:**
- `access_token` → `localStorage`
- `user` (AuthUser JSON) → `localStorage`
- Refresh token → HttpOnly cookie only (never accessible to JS)

**Impersonation (Admin feature):**
- Admin clicks "Impersonate" on user detail page
- `POST /admin-api/users/:id/impersonate` → returns short-lived token
- Frontend stores original admin context in `localStorage.impersonation_context`
- Impersonated token written to `localStorage.access_token`
- Banner shown in dashboard; "Stop Impersonation" restores admin token

---

## 8. Billing System (PayU)

PayU is an Indian payment gateway (used instead of Stripe for INR payments).

**Plans pricing in `Plan` DB model** (seeded via `prisma/seed.mjs`):
- Prices stored in paise (INR × 100) and USD cents
- Two billing cycles: `monthly` and `yearly`

**Checkout flow:**
1. Frontend calls `POST /api/billing/checkout` with `planName` + `billingCycle`
2. Backend calculates amount, generates PayU hash (HMAC SHA-512 with merchant key+salt+txnid+amount+email)
3. Returns form fields + PayU URL; frontend POSTs form to PayU
4. PayU processes payment and POSTs to `/api/billing/webhook`
5. Webhook verifies HMAC signature against `req.rawBody` (saved during body parsing)
6. On success: creates/updates `Subscription`, creates `Invoice`, fires limit checks

---

## 9. File Upload & Storage

- Files stored in `backend/uploads/` directory (under `UPLOAD_BASE` constant in `upload.routes.ts`)
- Sub-folders: `avatars/`, `qr-files/`
- `Multer` disk storage; file size limits enforced in route
- Files served at `/uploads/*` by Express static middleware
  - Avatars: `Content-Disposition: inline` (must render in `<img>`)
  - All other uploads: `Content-Disposition: attachment` + restrictive CSP
- `QRFile` model tracks DB reference (fileUrl, mimeType, sizeBytes as BigInt, thumbnailUrl, driveFileId)
- BigInt serialized to Number via `(BigInt.prototype as any).toJSON = () => Number(this)` in `app.ts`
- Optional Google Drive backup: `POST /api/gdrive/backup/:qrFileId`

---

## 10. QR Code Engine

**Static QR codes:**
- Content is encoded directly into the QR matrix at creation time
- No backend redirect; `/api/static/generate` returns PNG buffer for immediate use
- Stored as `category: STATIC` in DB but redirect still works at `/r/:slug` → direct redirect 301

**Dynamic QR codes:**
- QR encodes the URL `https://genxqr.com/r/<slug>`
- When scanned, backend resolves slug:
  1. Password check → redirect to `/r/:slug/password` if locked
  2. Expiry check → redirect to `/r/:slug/expired` or `fallbackUrl`
  3. Scan limit check → same as expiry
  4. Smart routing evaluation (priority-ordered rules by condition: time-of-day, day-of-week, device, country, OS)
  5. A/B test split (random weighted split between variants)
  6. Log scan via BullMQ queue (async — does not delay redirect)
  7. `302` redirect to resolved URL, OR `200` with landing page HTML if custom landing page set

**Design options stored in `QRDesign`:**
- `dotStyle`: square, rounded, dots, classy, classy-rounded, extra-rounded
- `cornerSquareStyle` + `cornerDotStyle`: same options
- `gradientEnabled`, `gradientType` (linear/radial), `gradientColor1/2`
- `logoUrl` + sizing + margin
- `frameStyle` + `frameText` + `frameColor`
- Client-side rendering uses `qr-code-styling` library in `CreateQRPage.tsx`

---

## 11. Frontend Architecture

### 11.1 Routing & Layouts

Three layout types, rendered via React Router's nested `<Route element={<Layout />}>`:

| Layout | Component | Used for |
|---|---|---|
| `MarketingLayout` | Wraps `Navbar` + `Footer` | Public pages (home, pricing, features, legal, etc.) |
| `DashboardLayout` | Sidebar + top header | Authenticated app (`/app/*`) |
| `AdminLayout` | Admin sidebar + header | Admin panel (`/admin/*`) |

**Route guards:**
- `GuestRoute` — redirects to `/app/dashboard` if `localStorage.access_token` exists (login/signup pages)
- `AdminRoute` — decodes JWT role client-side; redirects to `/admin/login` if not ADMIN/SUPER_ADMIN
- Dashboard auth — `DashboardLayout` checks `localStorage.access_token`; redirects to `/login` if missing

### 11.2 All Pages — File Map

#### Auth Pages (`/src/pages/auth/`)
| File | Route |
|---|---|
| `LoginPage.tsx` | `/login` |
| `SignupPage.tsx` | `/signup` |
| `ForgotPasswordPage.tsx` | `/forgot-password` |
| `ResetPasswordPage.tsx` | `/reset-password` |
| `VerifyEmailPage.tsx` | `/verify-email` |
| `InviteAcceptPage.tsx` | `/invite/:token` |

#### Marketing Pages (`/src/pages/marketing/`)
| File | Route |
|---|---|
| `HomePage.tsx` | `/` |
| `PricingPage.tsx` | `/pricing` |
| `FeaturesPage.tsx` | `/features` |
| `DynamicQRPage.tsx` | `/dynamic-qr` |
| `FAQPage.tsx` | `/faq` |
| `UseCasesPage.tsx` | `/use-cases` |
| `APIDocsPage.tsx` | `/api-docs` |
| `AboutPage.tsx` | `/about` |
| `BlogPage.tsx` | `/blog` |
| `ContactPage.tsx` | `/contact` |
| `PrivacyPage.tsx` | `/privacy` |
| `TermsPage.tsx` | `/terms` |
| `CookiePolicyPage.tsx` | `/cookie-policy` |
| `GDPRPage.tsx` | `/gdpr` |
| `ChangelogPage.tsx` | `/changelog` |
| `CareersPage.tsx` | `/careers` |
| `QRScannerPage.tsx` | `/scanner` (uses `jsqr` + camera API) |

#### Static QR Generator (`/src/pages/static-qr/`)
| File | Routes |
|---|---|
| `StaticGeneratePage.tsx` | `/generate`, `/generate/url`, `/generate/wifi`, `/generate/whatsapp`, `/generate/instagram` |

#### Dashboard Pages (`/src/pages/dashboard/`)
| File | Route | Notes |
|---|---|---|
| `DashboardPage.tsx` | `/app/dashboard` | QR code list, search, filter, bulk actions |
| `CreateQRPage.tsx` | `/app/create`, `/app/qr/:id/edit` | Multi-step QR creator/editor (~111KB, largest file) |
| `QRDetailPage.tsx` | `/app/qr/:id` | QR detail overview |
| `QRAnalyticsPage.tsx` | `/app/qr/:id/analytics` | Per-QR charts (Recharts) |
| `GlobalAnalyticsPage.tsx` | `/app/analytics` | Cross-QR analytics |
| `QRSettingsPage.tsx` | `/app/qr/:id/settings` | Advanced QR settings (password, scheduling, limits) |
| `SmartRoutingPage.tsx` | `/app/qr/:id/smart-routing` | Smart routing rule builder |
| `ABTestPage.tsx` | `/app/qr/:id/ab-test` | A/B test variant manager |
| `BulkGeneratePage.tsx` | `/app/bulk-generate` | CSV upload → batch QR generation |
| `TeamPage.tsx` | `/app/team` | Team management (invite, roles, remove) |
| `APIKeysPage.tsx` | `/app/api-keys` | Create/revoke API keys |
| `WebhooksPage.tsx` | `/app/webhooks` | Manage webhooks |
| `BillingPage.tsx` | `/app/billing` | Subscription, plan upgrade, invoices |
| `SettingsPage.tsx` | `/app/settings` | Profile, password, notification prefs, delete account |
| `UserReportPage.tsx` | `/app/report` | Submit and view abuse reports |
| `VCardEditor.tsx` | (embedded in CreateQRPage) | Rich vCard form editor |
| `LandingPreview.tsx` | (internal preview) | Preview dynamic QR landing pages |

#### Public / Scan Pages
| File | Route |
|---|---|
| `landing/LandingPage.tsx` | `/l/:slug` — renders custom QR landing page |
| `scan/PasswordPage.tsx` | `/r/:slug/password` — password entry form |
| `scan/ExpiredPage.tsx` | `/r/:slug/expired` — QR expired/inactive screen |

#### Admin Pages (`/src/pages/admin/`)
| File | Route |
|---|---|
| `AdminLoginPage.tsx` | `/admin/login` |
| `AdminDashboardPage.tsx` | `/admin` |
| `AdminUsersPage.tsx` | `/admin/users` |
| `AdminUserDetailPage.tsx` | `/admin/users/:id` |
| `AdminQRCodesPage.tsx` | `/admin/qr-codes` |
| `AdminAnalyticsPage.tsx` | `/admin/analytics` |
| `AdminRevenuePage.tsx` | `/admin/revenue` |
| `AdminStoragePage.tsx` | `/admin/storage` |
| `AdminAuditPage.tsx` | `/admin/audit` |
| `AdminSubscriptionsPage.tsx` | `/admin/subscriptions` |
| `AdminPaymentsPage.tsx` | `/admin/payments` |
| `AdminAbusePage.tsx` | `/admin/abuse` |
| `AdminEmailPage.tsx` | `/admin/email` |
| `AdminBroadcastPage.tsx` | `/admin/broadcast` |
| `AdminSettingsPage.tsx` | `/admin/settings` |
| `AdminChangelogPage.tsx` | `/admin/changelog` |
| `AdminCareersPage.tsx` | `/admin/careers` |
| `AdminSupportPage.tsx` | `/admin/support` |

### 11.3 Components

#### Layout (`/src/components/layout/`)
| File | Exports | Notes |
|---|---|---|
| `Navbar.tsx` | `Navbar` | Marketing navbar; links: Static QR, Dynamic QR, QR Scanner, Pricing, Contact |
| `Footer.tsx` | `Footer` | Marketing footer with remaining nav links |
| `MarketingLayout.tsx` | `MarketingLayout` | `<Navbar /> + <Outlet /> + <Footer />` |
| `DashboardLayout.tsx` | `DashboardLayout` | Sidebar (fixed 256px desktop) + mobile drawer + top header; shows plan badge, QR usage bar, trial countdown |
| `AdminLayout.tsx` | `AdminLayout` | Admin sidebar + content area |

#### UI (`/src/components/ui/`)
All components are based on Radix UI primitives or custom implementations:
- `badge.tsx` — variants: default, secondary, success, warning, danger
- `button.tsx` — variants: default, destructive, outline, ghost, link; sizes: sm, md, lg
- `card.tsx` — Card, CardHeader, CardTitle, CardContent, CardFooter
- `input.tsx` — styled input wrapper
- `select.tsx` — Radix Select wrapper
- `social-icon.tsx` — renders SVG social media icons from `simple-icons`
- `LanguageSwitcher.tsx` — i18next language selector dropdown

#### Other Components
- `SEOMeta.tsx` — wraps `react-helmet-async` for per-page title/description/OG tags

### 11.4 API Client (`lib/api.ts`)

**~1700 lines** — single file containing ALL API functions and their TypeScript return types.

**Key patterns:**
- `apiFetch<T>(path, init?)` — base function; adds `credentials: include`; handles 401 → silent refresh → retry
- `adminFetch<T>(path, init?)` — adds `Authorization: Bearer <token>` header from localStorage
- `authHeader()` — returns `{ Authorization: 'Bearer <token>' }` for use in non-JSON requests
- All functions follow naming convention: `getX`, `createX`, `updateX`, `deleteX`, `fetchAdminX`
- Impersonation context stored in `localStorage.impersonation_context`

**Silent refresh logic:**
- On 401, `silentRefresh()` is called (deduplicated via `_refreshPromise` singleton)
- If impersonating, restores admin session instead of logging out
- Hard redirect to `/login` only after refresh also fails

### 11.5 Hooks

| Hook | File | Purpose |
|---|---|---|
| `useTheme` | `hooks/useTheme.ts` | `theme` state (dark/light), `toggleTheme`, persisted in localStorage |
| `useSubscription` | `hooks/useSubscription.ts` | TanStack Query wrapper for current subscription |
| `usePlatformStats` | `hooks/usePlatformStats.ts` | Fetches `/api/public/platform-stats` for homepage hero |
| `useCountUp` | `hooks/useCountUp.ts` | Animated number counter for marketing stats |

### 11.6 i18n (Internationalization)

- `i18next` with `i18next-http-backend` (loads locale JSON from `/public/locales/<lang>/translation.json`) and `i18next-browser-languagedetector`
- Language switcher available in the dashboard header
- `LanguageSwitcher.tsx` component in `components/ui/`
- Transition cache: 30 days, up to 150 entries (configured in Vite PWA workbox runtime caching)

---

## 12. Admin Panel

Access: `/admin/*` — requires JWT with `ADMIN` or `SUPER_ADMIN` role.

**All admin API calls go to `/admin-api/*` prefix.**

**Key admin capabilities:**
- **User management**: search, view details, change plan, change role, force-verify email, change password, send payment reminder, impersonate, delete user
- **QR management**: global list of all QR codes, deactivate, delete
- **Analytics**: daily signup and scan trend charts
- **Revenue**: MRR/ARR and invoice list
- **Storage**: total storage usage by file type, cleanup orphaned files
- **Audit log**: searchable log with filters by user, category, date range, IP
- **Subscriptions**: list by status/plan, bulk send renewal reminders
- **Payments**: invoice list filtered by status
- **Abuse**: review/resolve abuse reports; manage blocklist (domain/IP/email/user)
- **Email logs**: outgoing email history; send broadcast to user segments (all/free/paid/trialing)
- **Platform settings**: key-value store for feature flags, maintenance mode, etc.
- **Changelog**: publish changelog entries (stored in PlatformSetting)
- **Careers**: manage job listing content
- **Support tickets**: view/update/resolve user support tickets

---

## 13. Team Management

**Model:** One team per owner. Team has members + pending invites.

**Roles hierarchy:** OWNER > ADMIN > EDITOR > VIEWER

**Invite flow:**
1. Owner/Admin invites by email via `POST /api/team/invite`
2. Backend creates `TeamInvite` with unique token + sends email with link
3. Invitee visits `/invite/:token` → `InviteAcceptPage.tsx` shows team info
4. Clicking "Accept" calls `POST /api/team/join/:token`
5. Token validated, `TeamMember` created, invite marked accepted

**Limit:** `Plan.teamSeatsLimit` (0 = team features disabled on FREE plan)

---

## 14. Analytics

**Per-QR analytics** (`QRAnalyticsPage.tsx`):
- Time-series scan chart (daily, weekly, monthly views)
- Top countries table
- Device type breakdown (Mobile/Tablet/Desktop)
- Browser breakdown
- OS breakdown
- Recent scans list with raw data

**Global analytics** (`GlobalAnalyticsPage.tsx`):
- Aggregated across all user QR codes
- Total scans, unique QRs scanned, top performing QRs
- Country/device/browser breakdown

**Data collection pipeline:**
1. Scan hits `/r/:slug` → BullMQ job queued
2. Worker: geo lookup (MaxMind) → parses user-agent (device/OS/browser) → writes `QRScan` + upserts `QRScanDaily`

**Retention:** Raw scans stored indefinitely; daily aggregates for fast time-series queries.

---

## 15. Webhooks

- User creates webhook with URL + event subscriptions
- Supported events: `qr.scanned`, `qr.created`, `qr.updated`, `qr.deleted`
- Delivery: HMAC-SHA256 signature in `X-GenXQR-Signature` header
- Each delivery logged to `WebhookDelivery` (status code, response body, success flag)
- Test endpoint: `POST /api/webhooks/:id/test` sends sample payload

---

## 16. PWA & Service Worker

Configured in `vite.config.ts` via `vite-plugin-pwa`:
- `registerType: 'autoUpdate'` — SW updates in background
- Offline cache:
  - All static assets (JS, CSS, HTML, images, fonts) — precached
  - `/locales/*.json` — stale-while-revalidate (i18n)
  - `/api/**` — network-first with 10s timeout, 5-min expiry
- Excluded from SW: `/api/`, `/admin-api/`, `/r/`, `/uploads/`
- SW disabled in dev (`devOptions.enabled: false`) to avoid stale cache issues

---

## 17. Production Deployment

**See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for the full step-by-step runbook.** Summary:

**Stack:**
- Server: Ubuntu VPS running **CloudPanel** (manages Nginx + Let's Encrypt SSL per-site)
- Domain: `genxqr.com`
- Process manager: PM2 (cluster mode — all CPU cores), app name `genxqr-api`
- Postgres + Redis: installed **natively** on the VPS (no Docker in production — `docker-compose.yml` is dev-only), both bound to `127.0.0.1` only, standard ports 5432/6379
- Secrets: a plain env file **outside the repo**, at `/home/genxqr/genxqr.env` (chmod 600) — **not** HashiCorp Vault. `backend/vault-bootstrap.mjs` / `backend/scripts/vault-setup.sh` exist for a possible future migration but are currently unused; nothing depends on them.

**File paths on server** (site user created by CloudPanel's Node.js site wizard):
- Repo root: `/home/<site-user>/htdocs/genxqr.com/`
- Frontend build: `<repo-root>/frontend/dist` (this is what Nginx's `root` points at, edited manually in the Vhost — CloudPanel's default doesn't know about the `frontend/dist` subpath)
- Backend: `<repo-root>/backend/dist/index.js`, run via PM2 per `ecosystem.config.cjs`
- Uploads: `<repo-root>/backend/uploads/` — `UPLOAD_BASE` is `process.cwd()/uploads` and PM2's `cwd` is `<repo>/backend`, so uploads land under `backend/`, **not** the repo root. The nginx `/uploads/` alias must point here or every uploaded file 404s.
- Logs: `<repo-root>/logs/`

**Nginx** is edited via CloudPanel's per-site Vhost Editor, not a standalone `nginx.conf` — see [`deploy/cloudpanel-vhost-nodejs.conf`](./deploy/cloudpanel-vhost-nodejs.conf) for the exact block that replaces CloudPanel's default `location /` proxy-everything block:
- `/api/`, `/admin-api/`, `/r/:slug` (exact match) → `127.0.0.1:3001`
- `/uploads/` → served directly from disk
- All other routes → `index.html` (SPA fallback)
- Nginx-level rate limiting is intentionally omitted (the per-site Vhost Editor can't declare `limit_req_zone`, which is an `http{}`-context-only directive) — rate limiting is enforced at the app layer instead (`rateLimit.middleware.ts`, Redis-backed).

**PM2 config** (`ecosystem.config.cjs`):
- App name: `genxqr-api`
- Cluster mode, max instances
- Memory restart at 512 MB per worker
- Graceful shutdown: 10-second kill timeout
- Secrets loaded via `node_args: "--env-file=/home/genxqr/genxqr.env"` (the `ENV_FILE_PATH` constant at the top of `ecosystem.config.cjs`) — same `--env-file` mechanism as `pnpm start` locally, just pointed at an absolute path outside the repo

**Dev infra (Docker):**
- PostgreSQL + Redis run as dedicated GenXQR containers via `docker-compose.yml` at the repo root (`genxqr_postgres` on host port **5433**, `genxqr_redis` on **6380**). Isolated from any other project on the machine.
- Compose credentials come from the gitignored root `.env` (see `.env.example`); `backend/.env` connects via stable `localhost:5433` / `localhost:6380` — no WSL-IP syncing.
- Start with `pnpm db:up` (or `docker compose up -d`); `pnpm dev` brings the stack up then runs both servers. On Windows, Docker runs inside WSL, so the scripts invoke `wsl -d Debian docker compose`.

---

## 18. Dev Scripts & Commands

### Root workspace (run from repo root)
```bash
pnpm dev                   # db:up (containers) + frontend + backend in parallel
pnpm dev:frontend          # Start Vite dev server (port 5173)
pnpm dev:backend           # Start backend with tsx watch (port 4000)
pnpm build:frontend        # tsc + vite build
pnpm build:backend         # tsc to dist/
pnpm db:up                 # Start Postgres + Redis containers (waits until healthy)
pnpm db:down               # Stop the containers
pnpm db:logs               # Tail container logs
pnpm db:generate           # prisma generate (after schema changes)
pnpm db:migrate            # prisma migrate dev
pnpm db:push               # prisma db push (schema sync without migration)
pnpm db:studio             # Prisma Studio GUI
```

### Backend-specific (run from `backend/`)
```bash
pnpm db:seed               # Seed plans and super-admin user
pnpm geo:update            # Download/update MaxMind GeoLite2 database
pnpm dev                   # tsx watch --env-file=.env src/index.ts
pnpm build                 # tsc
pnpm start                 # node --env-file=.env dist/index.js
pnpm test:setup            # one-time: create genxqr_test DB + apply migrations
pnpm test                  # vitest run — integration tests (needs pnpm db:up)
pnpm test:watch            # vitest in watch mode
pnpm typecheck:tests       # tsc on tests/ (vitest strips types without checking)
```

**Testing** — two suites, see [`backend/tests/README.md`](./backend/tests/README.md):
- `backend/tests/` — automated Vitest + supertest integration tests against a real
  Postgres (`genxqr_test`, never the dev DB) and Redis logical DB 15. This is where
  new regression coverage goes.
- `tests/` (repo root) — the older manual suite: `.http` files for VS Code REST
  Client plus a PowerShell runner against a live server. Broader surface area,
  but manual.

When adding a security test, verify it can fail: break the guard it covers,
confirm the suite goes red naming that test, then restore. A test that has only
ever been seen passing is not yet known to test anything.

### Frontend-specific (run from `frontend/`)
```bash
pnpm dev                   # vite (port 5173)
pnpm build                 # tsc -b && vite build
pnpm preview               # vite preview (serves dist/)
```

---

## 19. Key Design Patterns & Conventions

### Backend
- **ESM throughout**: `"type": "module"` — always use `.js` extensions in imports even for `.ts` source files
- **Zod validation**: All request bodies validated with Zod schemas inline in route files
- **Service layer isolation**: Routes only call services; no Prisma queries in routes directly. Services throw `AppError(status, message)` rather than writing responses — `error.middleware.ts` turns that into the same `{success:false, error}` JSON shape. Fully enforced in `admin.routes.ts`, `team.routes.ts`, `auth.routes.ts`, `qr.routes.ts`'s core CRUD, `apikeys`, `webhooks`, `bulk`, `gdrive`, `notifications`. Still partly violated in the smaller route files (`analytics`, `billing`, `careers`, `public`, `report`, `scan`, `static`, `support`, `upload`, `v1`, `widget`) — 2–8 direct calls each, worth cleaning up opportunistically when touching them.
- **Audit logging**: Sensitive actions written to `AuditLog` via `audit.service.ts`
- **Soft BigInt fix**: `(BigInt.prototype as any).toJSON = () => Number(this)` in `app.ts` handles `QRFile.sizeBytes`
- **Plan gating**: Feature access checked via `plan-gate.middleware.ts` — never scattered ad-hoc in routes

### Frontend
- **Single API file**: All API calls + TypeScript interfaces live in `lib/api.ts`; never use `fetch` directly in components
- **TanStack Query**: All server state managed via `useQuery`/`useMutation`; keys are arrays like `["qr", id]`
- **Path alias**: `@` resolves to `frontend/src/` (configured in `vite.config.ts` + `tsconfig`)
- **Tailwind + CSS variables**: Custom design tokens defined in `tailwind.config.js`; dark mode via `.dark` class
- **Theme persistence**: `useTheme` hook persists light/dark preference in localStorage
- **Scroll reset**: `<ScrollToTop />` component calls `window.scrollTo` on route change
- **`cn()` utility**: All dynamic className merging uses `cn()` from `lib/utils.ts` (clsx + tailwind-merge)

---

## 20. Known Gotchas & Non-Obvious Decisions

1. **OAuth one-time code**: The Google OAuth callback redirects to the frontend with `?oauth_code=<redis-key>` — NOT the access token directly. The frontend must exchange this within 60 seconds via `POST /api/auth/oauth-token`. This avoids token exposure in browser history/URLs.

2. **React 18 Strict Mode + OAuth**: `DashboardLayout` uses a `useRef` guard (`oauthExchangeAttempted`) to prevent the OAuth exchange from running twice in dev Strict Mode (which mounts → unmounts → remounts).

3. **BigInt serialization**: `QRFile.sizeBytes` is stored as `BigInt` in Prisma (maps to PostgreSQL `BigInt`). Since `JSON.stringify` cannot serialize BigInt, `app.ts` patches `BigInt.prototype.toJSON` globally.

4. **PayU webhook raw body**: Express body parser normally consumes the buffer, making HMAC verification impossible. The `verify` callback in `express.json()` configuration saves the raw buffer as `req.rawBody` specifically for the `/billing/webhook` route.

5. **pnpm dedupe**: The `vite.config.ts` has `resolve.dedupe: ["react", "react-dom", "@tanstack/react-query"]` to prevent the "Invalid hook call" error caused by pnpm sometimes hoisting multiple copies of React into both root and frontend `node_modules`.

6. **VitePWA TypeScript error**: `VitePWA()` returns `Plugin[]` typed against the pnpm store's Vite instance, causing a type mismatch. It's safely cast with `as unknown as any[]` — this is a known pnpm virtual store artifact, not a real bug.

7. **Vite proxy bypass for `/r/`**: Sub-paths like `/r/:slug/expired` and `/r/:slug/password` are SPA routes. The Vite proxy has a `bypass()` function that returns `/index.html` for paths with more than 2 segments under `/r/`, letting React Router handle them.

8. **Dev DB/Redis are Dockerized**: Postgres + Redis run as dedicated GenXQR containers (`docker-compose.yml`, ports 5433/6380). `backend/.env` uses stable `localhost` addresses — no WSL-IP syncing. Start via `pnpm db:up`. (On Windows, Docker runs inside WSL, so scripts call `wsl -d Debian docker compose`.)

9. **Prisma `.js` imports in ESM**: Because the backend is `"type": "module"`, all internal imports must use `.js` extension (e.g., `import { prisma } from "./db/prisma.js"`) even though the actual file is `.ts`. TypeScript resolves these correctly.

10. **Blocklist permanent ban**: `Blocklist.blockCount` increments each time an admin blocks the same domain/IP/email. When it reaches 3, `isPermanent` is automatically set to `true` and the entry cannot be removed from the admin UI.

11. **Team seat limit = 0**: A `teamSeatsLimit` of 0 on the Plan means the team feature is completely disabled (used on FREE plan, not just "0 additional seats"). This is checked in `plan-gate.middleware.ts`.

12. **QRScanDaily upsert**: The scan worker uses `upsert` on `QRScanDaily` with `date` (PostgreSQL `Date` type) + `qrId` as the unique key. This allows efficient daily rollup without double-counting.
