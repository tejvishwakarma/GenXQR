import fs from "node:fs"
import path from "node:path"
import { defineConfig } from "vitest/config"

/**
 * Load .env.test at config time and hand it to the workers via `test.env`,
 * so the values are present before any module (env.ts, prisma.ts) is imported
 * inside the worker. Loading them from a setupFile would be too late for
 * Prisma, which reads DATABASE_URL when the client is constructed at import.
 */
function loadTestEnv(): Record<string, string> {
  const envPath = path.resolve(__dirname, ".env.test")
  if (!fs.existsSync(envPath)) {
    throw new Error(
      "backend/.env.test is missing. Generate it with: node scripts/gen-test-env.mjs",
    )
  }

  const parsed: Record<string, string> = {}
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
    if (match?.[1]) parsed[match[1]] = match[2] ?? ""
  }

  // Fail loudly rather than risk pointing a truncating test suite at real data.
  // tests/setup.ts re-checks this inside the worker as a second line of defence.
  const dbUrl = parsed["DATABASE_URL"] ?? ""
  if (!/\/genxqr_test(\?|$)/.test(dbUrl)) {
    throw new Error(
      `Refusing to run: .env.test DATABASE_URL must target the genxqr_test database, got: ${dbUrl.replace(/:[^:@]+@/, ":****@")}`,
    )
  }

  return parsed
}

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    env: loadTestEnv(),

    // Every suite shares one Postgres database and truncates between tests,
    // so they must not run concurrently — a parallel suite would delete rows
    // out from under another mid-assertion.
    fileParallelism: false,
    sequence: { concurrent: false },

    // Integration tests do real DB + Redis I/O; the 5s default is too tight
    // for the first test in a file, which pays connection setup.
    testTimeout: 20_000,
    hookTimeout: 30_000,

    // The app logs every request and every deliberate rejection, so a passing
    // run buried its own result under ~800 lines. That matters now deploy.sh
    // gates on this suite: an unreadable gate is half a gate.
    //
    // Quiet by default. Vitest's failure report — test name, assertion diff,
    // file and line — is a SEPARATE stream and is never suppressed, so a failure
    // is still fully diagnosable (verified by breaking a guard and reading the
    // output: 5 FAIL blocks with diffs and line numbers, in 168 lines total).
    //
    // What IS lost is the app's own log narration, which occasionally explains a
    // failure the assertion alone does not — e.g. "order amount does not match
    // the plan price". Measured, not assumed: "passed-only" suppresses those even
    // for failing tests in Vitest 4.1.10, and --silent=false does not override
    // it. So the escape hatch is explicit here rather than a CLI flag:
    //
    //     VITEST_VERBOSE=1 pnpm test          # full app logs
    //     VITEST_VERBOSE=1 pnpm test <file>   # …for one suite
    silent: process.env["VITEST_VERBOSE"] ? false : "passed-only",
  },
})
