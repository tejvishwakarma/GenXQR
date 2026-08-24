# Backend automated tests

Integration tests that exercise the real Express app against a real Postgres
database — no mocked Prisma. Run with Vitest + supertest.

For the older **manual** suite (`.http` files for VS Code REST Client, plus a
PowerShell runner that hits a live server), see [`/tests`](../../tests) at the
repo root. That suite is broader in surface area; this one is automated,
runs in CI, and is where regression coverage should go from now on.

---

## Running

One-time, and again whenever a migration is added:

```bash
cd backend
pnpm test:setup      # creates genxqr_test + applies migrations
```

Then:

```bash
pnpm test            # single run
pnpm test:watch      # re-run on change
pnpm test tests/integration/billing-cashfree-webhook.test.ts  # one file
```

Requires the dev Postgres + Redis containers (`pnpm db:up` from the repo root).

#### On Windows: hold the WSL session open

Docker runs inside WSL here, and Windows tears down the port forwards to 5433 /
6380 when no session is holding the distro open. A full run takes ~55s, which is
long enough for that to happen mid-suite. The symptom looks nothing like a
connection problem:

```
Tests  18 failed | 20 passed | 102 skipped
Error: connect ECONNREFUSED 127.0.0.1:6380
```

Every file fails at the suite level, including files the change never touched,
and most tests report as *skipped* rather than failed — which reads like the
change broke something global. `docker compose ps` then shows both containers
healthy, because they are: only the forward died.

Chaining `pnpm db:up && pnpm test` re-establishes the forward and is enough for a
single file. For a full run, hold the distro open in another terminal first:

```bash
wsl -d Debian -- sleep 900     # leave running
pnpm db:up && pnpm test
```

It presents differently depending on which service the run needed first, so watch
for either:

- `ECONNREFUSED 127.0.0.1:6380` — Redis was gone before a test connected
- `Raw query failed. Code: 57P01` / `FATAL: terminating connection due to
  administrator command` — Postgres went away *mid-run*, which is the more
  confusing one: earlier tests in the same file pass and later ones fail, so it
  reads as order-dependent test pollution rather than infrastructure

Before believing any red result, grep the output for both. If either is there, the
run says nothing about your code — and note a passing first run proves nothing
either, since the teardown happens on a timer, not per run.

### In CI

[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) runs the same
commands on every push and PR to `main`, against Postgres and Redis service
containers. The only difference is where the connection details come from:
`scripts/gen-test-env.mjs` reads `TEST_DATABASE_URL` / `TEST_REDIS_URL` from
the environment when they're set (CI), and falls back to deriving them from
your local `.env` otherwise. `scripts/setup-test-db.mjs` likewise skips the
`docker createdb` step when `CI` is set, since the service container
provisions the database itself.

---

## How isolation works

| Concern | Approach |
|---|---|
| Database | A **separate `genxqr_test` database**, never the dev one. `vitest.config.ts` refuses to start, and `tests/setup.ts` throws, if `DATABASE_URL` doesn't end in `genxqr_test`. |
| Between tests | Every table except `plans` and `_prisma_migrations` is `TRUNCATE`d before each test. The table list is read from `pg_tables` at runtime, so a new model is cleaned automatically. |
| Redis | Pinned to logical **DB 15** and flushed before each test. Without this, `authLimiter` (10 requests / 15 min / IP) would start returning 429 partway through a run, since every test hits the same loopback IP. |
| Parallelism | Disabled (`fileParallelism: false`). Suites share one database, so a parallel file would truncate rows out from under another mid-assertion. |
| Config | `backend/.env.test`, generated from `.env` by `scripts/gen-test-env.mjs`. Gitignored — it inherits your real local DB password. |

---

## What's covered

49 tests across 4 files.

| File | Covers |
|---|---|
| `integration/admin-authz.test.ts` | Authorization on `/admin-api/*`: role gate, SUPER_ADMIN-only actions (role/plan change, password reset, deleting an admin), self-modification guards, impersonation rules. |
| `integration/billing-cashfree-webhook.test.ts` | The Cashfree webhook and payment verification — the app's highest-stakes unauthenticated endpoint. HMAC signature verification against forged/wrong-secret/tampered payloads, server-side re-read of order status and amount, plan eligibility, ownership on verify-payment, and replay protection. |
| `integration/qr-idor.test.ts` | Object-level authorization on `/api/qr/:id` — cross-tenant read, list leakage, analytics, update, toggle, delete, duplicate. |
| `integration/scan-limit.test.ts` | `scanLimit` enforcement on `/r/:slug`, including the cache-staleness regression, exact-limit boundaries, dedup, and limit-raise recovery. |

Every file asserts on **database state**, not just status codes — a payment
test that only checked for a `?payment=failure` redirect would still pass if
the subscription were wrongly created anyway, and an IDOR test that only
checked for 404 would still pass if the row were deleted regardless.

### Notes on the scan tests

Two behaviours to know about when extending them:

- Scans are deduplicated for 4 hours on `qrId + IP + User-Agent fingerprint`.
  Supertest always calls from the same loopback IP, so each simulated device
  needs a distinct `User-Agent` — the same way a real attacker would dodge it.
- The scan counter is incremented from a fire-and-forget `void queueScan(...)`,
  so it can land just after the response. Use the `waitForScanCount` helper
  rather than reading Redis immediately.

---

## Writing new tests

Use the factories in `helpers/factories.ts` rather than building rows by hand:

```ts
import { createUser, createSuperAdmin, createQRCode, giveSubscription, seedPlans } from "../helpers/factories.js"

const user = await createUser()                  // real row + a signed JWT
const admin = await createSuperAdmin()
await giveSubscription(user.id, "PRO")
const qr = await createQRCode(user.id)

await request(app).get("/api/qr").set("Authorization", `Bearer ${user.token}`)
```

Call `await seedPlans()` in `beforeAll` for anything touching subscriptions.

### Verify the test can actually fail

A test that passes against correct code proves nothing on its own. Before
trusting a new security test, break the thing it guards and confirm it fails:

```bash
# temporarily invert the check in the service, then:
pnpm test
# expect a failure naming exactly your test; restore, expect green
```

Every suite here was validated that way:

| Guard removed | Tests that failed |
|---|---|
| Impersonation target-role check | 3 |
| Cashfree signature verification | 6 |
| `userId` filter on 3 `qr.service` call sites | 3 |
| Scan limit reverted to the stale cached count | 4 |

In each case the suite went green again once the guard was restored.
