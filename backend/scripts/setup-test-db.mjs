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

const dbHost = parsed.hostname
const dbPort = parsed.port || "5432"
const dbPass = decodeURIComponent(parsed.password)

/**
 * Two ways to reach Postgres, because the two environments differ:
 *
 *   - Production installs Postgres natively, so `psql` is on PATH and there is
 *     no Docker at all. Shelling into a container there fails with ENOENT.
 *   - Local development runs it in a container (docker-compose.yml), and on
 *     Windows the Docker CLI lives inside WSL — matching the root
 *     package.json's db:* scripts.
 *
 * Native is tried first: it also works against the dev container through its
 * mapped port, so it is the more general of the two.
 */
function nativePsql(args) {
  return execFileSync("psql", ["-h", dbHost, "-p", dbPort, "-U", dbUser, ...args], {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: dbPass },
  })
}

const isWindows = process.platform === "win32"
const dockerCmd = isWindows ? "wsl" : "docker"
const dockerPrefix = isWindows ? ["-d", "Debian", "docker"] : []

function dockerPsql(args) {
  return execFileSync(
    dockerCmd,
    [...dockerPrefix, "exec", "genxqr_postgres", "psql", "-U", dbUser, ...args],
    { encoding: "utf8" },
  )
}

function haveNativePsql() {
  try {
    execFileSync("psql", ["--version"], { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

// On CI the database is provisioned by the Postgres service container
// (POSTGRES_DB in the workflow), so the creation step is skipped and we go
// straight to migrations.
if (process.env.CI) {
  console.log(`CI detected — assuming "${TEST_DB}" is provisioned by the service container.`)
} else {
  console.log(`Ensuring test database "${TEST_DB}" exists...`)

  const runners = haveNativePsql()
    ? [{ name: "psql", run: nativePsql }, { name: "docker", run: dockerPsql }]
    : [{ name: "docker", run: dockerPsql }]

  let created = false
  const failures = []

  for (const runner of runners) {
    try {
      const exists = runner
        .run(["-d", "postgres", "-tAc", `SELECT 1 FROM pg_database WHERE datname='${TEST_DB}'`])
        .trim()

      if (exists === "1") {
        console.log(`  already exists (via ${runner.name})`)
      } else {
        // CREATE DATABASE via psql rather than the separate createdb binary, so
        // only one client tool needs to be present.
        runner.run(["-d", "postgres", "-c", `CREATE DATABASE "${TEST_DB}"`])
        console.log(`  created (via ${runner.name})`)
      }
      created = true
      break
    } catch (err) {
      failures.push(`${runner.name}: ${(err.message ?? String(err)).split("\n")[0]}`)
    }
  }

  if (!created) {
    console.error(`\nCould not create the "${TEST_DB}" database. Tried:`)
    failures.forEach((f) => console.error(`  - ${f}`))
    console.error(
      "\nIf Postgres is native (production), psql must be on PATH and the role needs\n" +
        "CREATEDB:  sudo -u postgres psql -c 'ALTER ROLE " + dbUser + " CREATEDB;'\n" +
        "If it runs in Docker (local dev), start it with:  pnpm db:up\n" +
        `Or create it by hand:  CREATE DATABASE "${TEST_DB}";`,
    )
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
