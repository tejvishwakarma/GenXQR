import { afterAll, beforeEach } from "vitest"
import { prisma } from "../src/db/prisma.js"
import { redis } from "../src/redis/client.js"

// ─── Safety guard ──────────────────────────────────────────────────────────────
// This file TRUNCATES TABLES. vitest.config.ts already refuses to start unless
// .env.test points at genxqr_test, but that check lives in the parent process;
// re-assert it here inside the worker, immediately before anything destructive
// can run. If someone ever points DATABASE_URL at a real database, this throws
// rather than deleting their data.

const dbUrl = process.env["DATABASE_URL"] ?? ""
if (!/\/genxqr_test(\?|$)/.test(dbUrl)) {
  throw new Error(
    `tests/setup.ts refuses to run against a non-test database. ` +
      `DATABASE_URL must target genxqr_test, got: ${dbUrl.replace(/:[^:@]+@/, ":****@")}`,
  )
}
if (process.env["NODE_ENV"] !== "test") {
  throw new Error(`NODE_ENV must be "test" when running the test suite, got: ${process.env["NODE_ENV"]}`)
}

// ─── Per-test isolation ────────────────────────────────────────────────────────

/**
 * Tables NOT cleared between tests:
 *  - `plans` is reference data, seeded once per run by tests/helpers/factories.ts
 *    (subscriptions FK into it, and re-seeding per test would be pure overhead).
 *  - `_prisma_migrations` is Prisma's own bookkeeping; truncating it would make
 *    the next `migrate deploy` try to replay every migration.
 */
const PRESERVED_TABLES = new Set(["plans", "_prisma_migrations"])

let cachedTableList: string | null = null

/**
 * Discovers the table list from Postgres rather than hardcoding it, so a new
 * model added to schema.prisma is cleaned automatically instead of silently
 * leaking rows between tests until someone remembers to update a list here.
 * A single TRUNCATE ... CASCADE over all tables is also materially faster than
 * per-table deletes, which matters when it runs before every test.
 */
async function getTruncatableTables(): Promise<string> {
  if (cachedTableList) return cachedTableList

  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `
  const tables = rows
    .map((r) => r.tablename)
    .filter((t) => !PRESERVED_TABLES.has(t))

  if (tables.length === 0) {
    throw new Error(
      "No truncatable tables found in the test database — has `prisma migrate deploy` been run against genxqr_test?",
    )
  }

  cachedTableList = tables.map((t) => `"${t}"`).join(", ")
  return cachedTableList
}

export async function truncateAll(): Promise<void> {
  const tables = await getTruncatableTables()
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`)
}

beforeEach(async () => {
  await truncateAll()

  // Clear rate-limiter counters between tests. authLimiter allows only 10
  // requests per 15 minutes per IP, and every test hits the same loopback IP,
  // so without this the 11th login attempt in a run would start 429-ing and
  // tests would fail depending on execution order.
  // Safe because .env.test pins Redis to logical DB 15 (see gen-test-env.mjs).
  await redis.flushdb()
})

afterAll(async () => {
  await prisma.$disconnect()
  redis.disconnect()
})
