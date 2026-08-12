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
pnpm test tests/integration/billing-payu-callback.test.ts   # one file
```

Requires the dev Postgres + Redis containers (`pnpm db:up` from the repo root).

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

**`integration/admin-authz.test.ts`** — authorization boundaries on `/admin-api/*`:
role gate, SUPER_ADMIN-only actions (role change, plan change, password reset,
deleting an admin), self-modification guards, and impersonation rules.

**`integration/billing-payu-callback.test.ts`** — the PayU payment callback,
the app's highest-stakes unauthenticated endpoint: signature verification
against forged/wrong-salt/tampered payloads, replay protection, and status
and field handling.

Both files assert on **database state**, not just status codes — a payment test
that only checked for a `?payment=failure` redirect would still pass if the
subscription were wrongly created anyway.

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

Both suites here were validated that way — disabling the impersonation
target-role check failed exactly 3 tests, and bypassing PayU signature
verification failed exactly 6.
