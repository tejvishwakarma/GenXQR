# GenXQR — Master Test Guide

## Structure

All test files live under `tests/`:

| File | Coverage |
|------|---------|
| `tests/01-auth.http` | Registration, login, JWT, OAuth, rate limiting |
| `tests/02-qr.http` | QR code CRUD, toggle, export, duplicate |
| `tests/03-analytics.http` | Global + per-QR analytics, scan list |
| `tests/04-webhooks.http` | Webhook lifecycle, delivery, HMAC verify |
| `tests/05-v1-api.http` | Developer REST API (API key auth) |
| `tests/06-billing.http` | Subscription, checkout, invoices |
| `tests/07-admin.http` | Admin panel endpoints |
| `tests/08-security.http` | Auth bypass, IDOR, injection, rate limits |
| `tests/09-integrations.sh` | Zapier/Make/n8n webhook smoke tests |
| `tests/README.md` | How to run every test |

## Quick Start

```bash
# Install REST Client extension in VS Code, then open any .http file and click "Send Request"
# OR use curl/httpie directly

# 1. Start the backend
pnpm dev:backend

# 2. Run auth flow (get a token first)
# Open tests/01-auth.http and run "Register User" then "Login"

# 3. Copy the accessToken from the login response into @token variable at top of each file
```

## Environment Variables for Tests

Create `tests/.env.test` (never commit):
```
BASE_URL=http://localhost:3001
ADMIN_EMAIL=admin@genxqr.in
ADMIN_PASS=your_admin_password
USER_EMAIL=testuser@example.com
USER_PASS=TestPass123!
API_KEY=nxqr_live_your_key_here
```
