/**
 * update-geo-db.mjs
 *
 * Downloads the latest GeoLite2-City MMDB from the P3TERX/GeoLite.mmdb mirror
 * (github.com/P3TERX/GeoLite.mmdb — auto-updated from MaxMind, no account needed).
 *
 * Usage:
 *   node scripts/update-geo-db.mjs
 *   pnpm run geo:update
 *
 * Run on first setup and weekly (CI cron / deployment hook) to keep data fresh.
 * The file is saved to backend/data/GeoLite2-City.mmdb (~60 MB).
 */

import { createWriteStream } from "fs"
import { mkdir, rename, unlink, stat } from "fs/promises"
import { pipeline } from "stream/promises"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR  = path.join(__dirname, "..", "data")
const DB_PATH   = path.join(DATA_DIR, "GeoLite2-City.mmdb")
const TMP_PATH  = DB_PATH + ".tmp"

// P3TERX/GeoLite.mmdb mirrors MaxMind GeoLite2 and auto-updates weekly.
// The file is served as a raw uncompressed MMDB — no gunzip step needed.
const DB_URL =
  "https://github.com/P3TERX/GeoLite.mmdb/raw/download/GeoLite2-City.mmdb"

async function run() {
  await mkdir(DATA_DIR, { recursive: true })

  // Show current DB age if it already exists
  try {
    const s = await stat(DB_PATH)
    const ageDays = (Date.now() - s.mtimeMs) / (1000 * 60 * 60 * 24)
    console.log(`Current DB age: ${ageDays.toFixed(1)} days`)
  } catch {
    console.log("No existing database — downloading for the first time.")
  }

  console.log(`Source: ${DB_URL}`)
  console.log("Downloading…")

  const res = await fetch(DB_URL, {
    headers: { "User-Agent": "genx-qr-geo-updater/1.0" },
    redirect: "follow",
    signal: AbortSignal.timeout(120_000),
  })

  if (!res.ok) {
    throw new Error(`Download failed: HTTP ${res.status} ${res.statusText}`)
  }

  const totalBytes = Number(res.headers.get("content-length") ?? 0)
  let received = 0
  let lastPct  = -1

  // Stream response → disk (atomic write via tmp file)
  await pipeline(
    res.body,
    async function* (source) {
      for await (const chunk of source) {
        received += chunk.length
        if (totalBytes) {
          const pct = Math.floor((received / totalBytes) * 100)
          if (pct >= lastPct + 10) {
            process.stdout.write(
              `\r  ${pct}%  (${(received / 1024 / 1024).toFixed(1)} / ${(totalBytes / 1024 / 1024).toFixed(1)} MB)`,
            )
            lastPct = pct
          }
        }
        yield chunk
      }
      if (totalBytes) process.stdout.write("\n")
    },
    createWriteStream(TMP_PATH),
  )

  // Atomic swap — a partial download never corrupts the live file
  await rename(TMP_PATH, DB_PATH)

  const finalStat = await stat(DB_PATH)
  console.log(`Saved: ${DB_PATH}  (${(finalStat.size / 1024 / 1024).toFixed(1)} MB)`)
  console.log("Done.")
}

run().catch((err) => {
  unlink(TMP_PATH).catch(() => {})
  console.error("\ngeo:update failed:", err.message)
  process.exit(1)
})
