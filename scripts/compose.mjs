/**
 * Runs `docker compose --env-file .env <args>` for the local Postgres + Redis.
 *
 * Windows: Docker lives inside WSL, so the command goes through
 * `wsl -d Debian` (the original db:* scripts).
 * macOS/Linux: plain `docker compose` (on a Mac, Docker via Colima —
 * `colima start` first; see CLAUDE.md §18).
 *
 * Usage (from the repo root): node scripts/compose.mjs up -d --wait
 */
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"

const args = process.argv.slice(2)

if (!existsSync(".env")) {
  console.error("Missing root .env (Postgres/Redis credentials). Copy .env.example to .env first.")
  process.exit(1)
}

const [cmd, cmdArgs] =
  process.platform === "win32"
    ? ["wsl", ["-d", "Debian", "docker", "compose", "--env-file", ".env", ...args]]
    : ["docker", ["compose", "--env-file", ".env", ...args]]

const result = spawnSync(cmd, cmdArgs, { stdio: "inherit" })

if (result.error || result.status !== 0) {
  if (process.platform === "darwin") {
    console.error("\nDocker did not respond. If Colima is not running, start it with: colima start")
  }
  process.exit(result.status ?? 1)
}
