/**
 * Creates the genxqr_test database (if absent) and applies all migrations to it.
 *
 * Run via: pnpm test:setup   (from backend/)
 * Safe to re-run — createdb is skipped when the database already exists, and
 * `prisma migrate deploy` is idempotent.
 */
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import fs from "node:fs"
import path from "node:path"

const TEST_DB = "genxqr_test"
const envPath = path.resolve(process.cwd(), ".env.test")

if (!fs.existsSync(envPath)) {
  console.error("backend/.env.test not found. Run: node scripts/gen-test-env.mjs")
  process.exit(1)
}

const envText = fs.readFileSync(envPath, "utf8")
const dbUrl = envText.match(/^DATABASE_URL="?([^"\n]*)"?/m)?.[1] ?? ""

if (!dbUrl.includes(`/${TEST_DB}`)) {
  console.error(`Refusing to continue: .env.test DATABASE_URL must target ${TEST_DB}.`)
  process.exit(1)
}

// Parse credentials out of the URL so the same script works regardless of the
// password/user configured in docker-compose.
const parsed = new URL(dbUrl)
const dbUser = decodeURIComponent(parsed.username)

/**
 * Postgres runs in a container (see docker-compose.yml). On Windows the Docker
 * CLI lives inside WSL, matching the pattern used by the root package.json's
 * db:* scripts.
 */
const isWindows = process.platform === "win32"
const dockerCmd = isWindows ? "wsl" : "docker"
const dockerPrefix = isWindows ? ["-d", "Debian", "docker"] : []

function docker(args, opts = {}) {
  return execFileSync(dockerCmd, [...dockerPrefix, ...args], { encoding: "utf8", ...opts })
}

// On CI the database is provisioned by the Postgres service container
// (POSTGRES_DB in the workflow) and there is no Docker CLI to call, so the
// creation step is skipped and we go straight to migrations.
if (process.env.CI) {
  console.log(`CI detected — assuming "${TEST_DB}" is provisioned by the service container.`)
} else {
  console.log(`Ensuring test database "${TEST_DB}" exists...`)
  try {
    const exists = docker([
      "exec", "genxqr_postgres", "psql", "-U", dbUser, "-d", "postgres", "-tAc",
      `SELECT 1 FROM pg_database WHERE datname='${TEST_DB}'`,
    ]).trim()

    if (exists === "1") {
      console.log(`  already exists`)
    } else {
      docker(["exec", "genxqr_postgres", "createdb", "-U", dbUser, TEST_DB])
      console.log(`  created`)
    }
  } catch (err) {
    console.error("Could not reach the Postgres container. Is it running? Try: pnpm db:up")
    console.error(err.message)
    process.exit(1)
  }
}

console.log("Applying migrations to the test database...")
// Invoke Prisma's JS entrypoint with the current node binary rather than going
// through `npx`. Spawning the npx.cmd shim fails with EINVAL on recent Node
// versions on Windows, and shell:true triggers an args-escaping deprecation —
// resolving the module path sidesteps both and is faster besides.
const prismaCli = createRequire(import.meta.url).resolve("prisma/build/index.js")
execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: dbUrl },
})

console.log("\nTest database ready. Run the suite with: pnpm test")
