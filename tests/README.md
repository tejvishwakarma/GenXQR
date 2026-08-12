# GenXQR — Test Suite

Comprehensive test coverage for all backend features including security, integration webhooks, and the developer API.

---

## Prerequisites

| Tool | Purpose | Install |
|------|---------|---------|
| [VS Code REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) | Run `.http` files in-editor | VS Code extension |
| `curl` | CLI HTTP requests | Built-in on macOS/Linux |
| `jq` | Parse JSON in shell scripts | `brew install jq` / `apt install jq` |
| [webhook.site](https://webhook.site) | Receive test webhook deliveries | Free, browser-based |

---

## Setup

### 1. Start the backend

```bash
# From project root
pnpm dev:backend
# or
cd backend && pnpm dev
```

Backend runs at `http://localhost:3001`.

### 2. Create a test user

Run the register request in `01-auth.http`, then verify the email either via your mail server or by running:

```bash
# Find the token in the database directly (dev shortcut)
cd backend
npx prisma studio
# Navigate to User → set isEmailVerified = true
```

### 3. Get an access token

Run the **Login** request in `01-auth.http`. Copy the `accessToken` from the response and paste it into the `@token` variable at the top of each `.http` file.

### 4. Generate an API key

1. Log into the frontend at `http://localhost:5173`
2. Go to **Settings → API Keys** → Create new key
3. Copy the key (starts with `nxqr_live_`) and paste into `@apiKey` in `05-v1-api.http` and `09-integrations.sh`

---

## Test Files

### `01-auth.http` — Authentication
Tests the complete auth lifecycle:
- ✅ Register (valid, duplicate, weak password, missing fields)
- ✅ Login (valid, wrong password, nonexistent user, unverified email)
- ✅ Token refresh (valid cookie, missing cookie)
- ✅ Logout (clears cookie)
- ✅ Protected route enforcement (no token, malformed, tampered)
- ✅ Password reset flow (forgot, invalid token)
- ✅ Anti-enumeration (forgot-password returns same message for unknown emails)
- ✅ Profile management (preferences GET/PATCH)

**How to run:** Open in VS Code, click "Send Request" above each `###` block.

---

### `02-qr.http` — QR Code CRUD
- ✅ Create dynamic QR (valid, missing fields, no auth)
- ✅ Static QR generation (no auth required)
- ✅ List (pagination, search, tag filter)
- ✅ Get single / Get nonexistent (404)
- ✅ Update name, tags, destination URL
- ✅ IDOR: update/delete another user's QR → 404
- ✅ Toggle active state
- ✅ Download as PNG / SVG / invalid format
- ✅ Duplicate QR
- ✅ Scan redirect (active → 302, inactive → /expired, nonexistent → 404)
- ✅ Delete + confirm 404 after deletion

---

### `03-analytics.http` — Analytics
- ✅ Global analytics (30d, 7d, 90d, out-of-range)
- ✅ Per-QR analytics
- ✅ IDOR: analytics for another user's QR
- ✅ Scan list via v1 API (limit capping, no-auth)

---

### `04-webhooks.http` — Webhook Lifecycle
- ✅ Create webhook (single event, multiple events)
- ✅ Invalid event name → 400
- ✅ SSRF prevention (private IP, localhost, file://, javascript://)
- ✅ List webhooks (secret NOT returned)
- ✅ Get webhook with secret (for HMAC verification)
- ✅ Delivery history
- ✅ IDOR: access another user's webhook → 404
- ✅ Update URL / disable webhook
- ✅ Test ping
- ✅ Delete webhook
- ✅ V1 API subscribe / unsubscribe (Zapier/Make/n8n pattern)
- ✅ HMAC-SHA256 verification guide

---

### `05-v1-api.http` — Developer API (API Key)
- ✅ API key authentication (valid, no header, JWT instead of key, revoked key)
- ✅ QR CRUD via API key
- ✅ Plan gating (free plan key → 403)
- ✅ Rate limit headers inspection (300 req/min)

---

### `06-billing.http` — Billing & Subscriptions
- ✅ Get subscription status
- ✅ Available plans
- ✅ Checkout initiation (valid plan, invalid plan)
- ✅ Plan limit enforcement (QR creation beyond free tier)
- ✅ Invoice history

---

### `07-admin.http` — Admin Panel
- ✅ Admin login
- ✅ Regular user blocked from admin routes (403)
- ✅ User list (pagination, search)
- ✅ User detail
- ✅ Ban / Unban user
- ✅ Banned user login → 403
- ✅ Platform stats
- ✅ Subscription management
- ✅ Audit log (all, filtered by category)
- ✅ Broadcast email (dry run)

---

### `08-security.http` — ⚠️ Security Tests
> Run **only** against your own dev or staging instance.

#### Security Headers
- ✅ `X-Content-Type-Options: nosniff`
- ✅ `X-Frame-Options: SAMEORIGIN`
- ✅ `Strict-Transport-Security` (HTTPS/prod)
- ✅ `Content-Security-Policy`

#### Authentication Bypass
- ✅ No token → 401
- ✅ Empty Bearer → 401
- ✅ `alg: none` JWT → 401
- ✅ Expired JWT → 401
- ✅ Regular token on admin route → 403
- ✅ Role injection in body (ignored)

#### IDOR (Insecure Direct Object Reference)
- ✅ Read another user's QR → 404
- ✅ Modify another user's QR → 404
- ✅ Delete another user's QR → 404
- ✅ Read another user's webhook → 404
- ✅ Toggle another user's QR via v1 → 404

#### Input Validation & Injection
- ✅ SQL injection in search → safe (Prisma parameterized queries)
- ✅ XSS payload in name → stored safely, must verify frontend escaping
- ✅ Excessively long name → 422 (Zod)
- ✅ Prototype pollution → stripped by Zod
- ✅ Webhook URL with `javascript:` scheme → 400
- ✅ Webhook URL with `file://` scheme → 400

#### Rate Limiting
- ✅ Auth: 10/15min per IP → 429 on 11th attempt
- ✅ Static QR: 10/min per IP → 429
- ✅ V1 API: 300/min per key → 429

#### Other
- ✅ CORS — blocked from disallowed origins
- ✅ Mass assignment prevention (userId, role ignored)
- ✅ Open redirect prevention in OAuth state param

---

### `09-integrations.sh` — Integration Smoke Tests

End-to-end lifecycle test for Zapier/Make/n8n webhook pattern:

```bash
API_KEY=nxqr_live_yourkey \
WEBHOOK_SITE=your-uuid \
bash tests/09-integrations.sh
```

Tests 12 scenarios:
1. API key authentication
2. Subscribe (POST /v1/webhooks)
3. Subscription appears in list
4. Create QR (fires events)
5. Toggle QR active state
6. Test ping delivery
7. Delivery log populated
8. HMAC signature format verification
9. IDOR protection
10. Invalid event name rejected
11. Unsubscribe (DELETE /v1/webhooks/:id)
12. Webhook removed from list after deletion

---

## Rate Limit Quick Reference

| Endpoint group | Limit | Window | Key |
|---------------|-------|--------|-----|
| `/api/auth/*` | 10 | 15 min | IP |
| `/api/static-qr/*` | 10 | 1 min | IP |
| `/api/*` (general) | 200 | 1 min | IP |
| `/v1/*` (API key) | 300 | 1 min | userId |
| Careers apply | 5 | 1 hour | IP |

---

## Security Checklist

Run through this before each release:

- [ ] All auth tests pass (no 401/403 bypasses)
- [ ] IDOR tests return 404 (not 200 or 403)
- [ ] `alg:none` JWT rejected
- [ ] Security headers present on all responses
- [ ] SSRF blocked for private IPs in production
- [ ] Rate limits verified (check `RateLimit-*` headers)
- [ ] CORS blocks requests from unlisted origins
- [ ] Webhook HMAC signatures verifiable
- [ ] SQL/XSS injection inputs handled safely
- [ ] Mass assignment fields ignored
- [ ] Open redirect blocked in OAuth flow
