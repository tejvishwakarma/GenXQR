# GenXQR

A full-stack SaaS platform for generating, managing, and tracking QR codes. Supports static and dynamic QR codes, real-time scan analytics, team collaboration, webhooks, bulk generation, and a Razorpay-powered subscription system.

---

## What it does

- **Static QR codes** — URL, WiFi, WhatsApp, Instagram, and more. No account needed.
- **Dynamic QR codes** — Update the destination anytime without reprinting.
- **Scan analytics** — Track scans by device, OS, browser, city, and country.
- **Smart routing** — Route scanners based on geo-location or device type.
- **A/B testing** — Split traffic between two destinations with auto-winner selection.
- **Bulk generation** — Generate up to 5,000 QR codes at once via CSV upload.
- **Team seats** — Invite members and collaborate on QR campaigns.
- **Webhooks** — Receive real-time POST events on QR create, update, scan, delete.
- **REST API** — Programmatic access for Pro and higher plans.
- **Admin panel** — Full user management, subscription control, revenue analytics, broadcast email.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS, TanStack Query, React Router v7, Radix UI |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL + Prisma ORM |
| Cache / Queue | Redis + BullMQ |
| Auth | JWT (access + refresh), Google OAuth, bcrypt |
| Email | Resend (primary), Nodemailer SMTP (fallback) |
| Payments | Razorpay (INR) |
| Storage | Local disk (`uploads/`) |

---

## Project Structure

```
GenXQR/
├── frontend/          # React + Vite app (port 5173)
│   └── src/
│       ├── pages/     # Dashboard, Admin, Marketing pages
│       ├── components/
│       └── lib/       # API client, utilities
├── backend/           # Express API (port 3001)
│   ├── src/
│   │   ├── routes/    # API route handlers
│   │   ├── services/  # Business logic
│   │   ├── workers/   # BullMQ background workers
│   │   └── middleware/
│   └── prisma/
│       ├── schema.prisma
│       └── seed.mjs   # Seeds plans + admin account
```

---

## Prerequisites

- **Node.js** v20 or later
- **pnpm** v9 or later — `npm install -g pnpm`
- **PostgreSQL** 15+
- **Redis** 7+

---

## 1. PostgreSQL Setup

### macOS (Homebrew)

```bash
brew install postgresql@15
brew services start postgresql@15

# Create user and database
psql postgres -c "CREATE USER GenXQR WITH PASSWORD 'password';"
psql postgres -c "CREATE DATABASE GenXQR OWNER GenXQR;"
```

### Linux (Ubuntu / Debian)

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib

sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create user and database
sudo -u postgres psql -c "CREATE USER GenXQR WITH PASSWORD 'password';"
sudo -u postgres psql -c "CREATE DATABASE GenXQR OWNER GenXQR;"
```

Verify the connection:

```bash
psql "postgresql://GenXQR:password@localhost:5432/GenXQR"
```

---

## 2. Redis Setup

### macOS (Homebrew)

```bash
brew install redis
brew services start redis

# Verify
redis-cli ping   # should return PONG
```

### Linux (Ubuntu / Debian)

```bash
sudo apt update
sudo apt install -y redis-server

sudo systemctl start redis-server
sudo systemctl enable redis-server

# Verify
redis-cli ping   # should return PONG
```

---

## 3. Clone and Install

```bash
git clone https://github.com/tejvishwakarma/GenXQR.git
cd GenXQR

# Install all dependencies (frontend + backend)
pnpm install --recursive
```

---

## 4. Backend Environment

```bash
cd backend
cp .env.example .env
```

Open `backend/.env` and fill in the values:

```env
# App
NODE_ENV=development
PORT=3001

# Database — must match what you created above
DATABASE_URL="postgresql://GenXQR:password@localhost:5432/GenXQR?schema=public"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT — generate with:
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_ACCESS_SECRET="your-64-char-hex-secret"
JWT_REFRESH_SECRET="your-different-64-char-hex-secret"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# Frontend origin (for CORS)
FRONTEND_URL="http://localhost:5173"

# Google OAuth (optional — leave blank to disable)
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_CALLBACK_URL="http://localhost:3001/api/auth/google/callback"

# Email — Option 1: Resend
RESEND_API_KEY=""

# Email — Option 2: SMTP fallback
SMTP_HOST=""
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASS=""
EMAIL_FROM="GenXQR <no-reply@genxqr.com>"

# Razorpay (optional — payments won't work without it)
RAZORPAY_KEY_ID=""
RAZORPAY_KEY_SECRET=""
RAZORPAY_WEBHOOK_SECRET=""
```

> Email falls back gracefully: Resend → SMTP → console log. The app starts without email configured.

---

## 5. Database Migration and Seed

```bash
cd backend

# Run migrations (creates all tables)
pnpm db:migrate

# Seed plans and admin account
pnpm db:seed
```

This creates:

- All subscription plans (Free, Starter, Pro, Business, Enterprise)
- Admin account:
  - **Email:** `admin@genxqr.dev`
  - **Password:** `Admin@GenXQR2025!`

> Change the admin password after first login.

---

## 6. Run the App

Open two terminals:

**Terminal 1 — Backend:**

```bash
cd backend
pnpm dev
# API running at http://localhost:3001
```

**Terminal 2 — Frontend:**

```bash
cd frontend
pnpm dev
# App running at http://localhost:5173
```

Open `http://localhost:5173` in your browser.

---

## 7. Verify Everything Works

```bash
# Health check
curl http://localhost:3001/health

# Should return:
# {"status":"ok"}
```

---

## Available Scripts

### Backend (`cd backend`)

| Command | Description |
|---|---|
| `pnpm dev` | Start backend with hot reload |
| `pnpm build` | Compile TypeScript |
| `pnpm start` | Run compiled build |
| `pnpm db:migrate` | Run Prisma migrations |
| `pnpm db:seed` | Seed plans and admin user |
| `pnpm db:studio` | Open Prisma Studio (DB GUI) |
| `pnpm db:reset` | Reset database (destructive) |

### Frontend (`cd frontend`)

| Command | Description |
|---|---|
| `pnpm dev` | Start Vite dev server |
| `pnpm build` | Production build |
| `pnpm preview` | Preview production build |

---

## Subscription Plans

| Plan | Monthly | Yearly | Dynamic QRs |
|---|---|---|---|
| Free | ₹0 | ₹0 | 3 |
| Starter | ₹299 | ₹249/mo | 10 |
| Pro | ₹799 | ₹649/mo | 50 |
| Business | ₹2,499 | ₹1,999/mo | Unlimited |
| Enterprise | Custom | Custom | Unlimited |

---

## Admin Panel

Access at `http://localhost:5173/admin` after logging in with the admin credentials.

Features: user management, subscription control, revenue dashboard, broadcast email, audit log, QR code oversight, abuse detection.

---

## License

Private. All rights reserved.
