/**
 * Downloads the current GeoLite2-City release from MaxMind now (geo.service
 * refreshGeoDatabase, forced). The server also does this by itself weekly.
 *
 *   Local:      pnpm geo:update
 *   Production: pnpm exec tsx --env-file=/home/genxqr/genxqr.env scripts/update-geo-db.ts
 *
 * Needs MAXMIND_ACCOUNT_ID and MAXMIND_LICENSE_KEY.
 */
import { maxmindConfigured, refreshGeoDatabase } from "../src/services/geo.service.js"

if (!maxmindConfigured()) {
  console.error("MAXMIND_ACCOUNT_ID and MAXMIND_LICENSE_KEY must be set (free MaxMind account → Manage License Keys).")
  process.exit(1)
}

try {
  const result = await refreshGeoDatabase({ force: true })
  console.log(result === "updated" ? "GeoLite2-City updated from MaxMind." : `Not updated (${result}) — another process may be downloading.`)
  process.exit(0)
} catch (err) {
  console.error("Update failed:", err instanceof Error ? err.message : err)
  process.exit(1)
}
