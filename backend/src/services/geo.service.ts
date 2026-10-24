import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { promisify } from "node:util"
import path from "path"
import fs from "fs"
import * as maxmind from "maxmind"
import { redis } from "../redis/client.js"
import { logger } from "../logger/index.js"
import { env } from "../config/env.js"

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface GeoInfo {
  country: string | null
  countryCode: string | null
  city: string | null
  region: string | null
  lat: number | null
  lng: number | null
}

const EMPTY_GEO: GeoInfo = {
  country: null,
  countryCode: null,
  city: null,
  region: null,
  lat: null,
  lng: null,
}

// ─── Database path ─────────────────────────────────────────────────────────────

const DB_PATH = path.join(process.cwd(), "data", "GeoLite2-City.mmdb")

// ─── Reader (singleton; reloaded when the file on disk is replaced) ───────────

let reader: maxmind.Reader<maxmind.CityResponse> | null = null
let readerMtimeMs = 0
let readerLoading: Promise<maxmind.Reader<maxmind.CityResponse> | null> | null = null
let lastFileCheck = 0
const FILE_CHECK_INTERVAL_MS = 10 * 60 * 1000

async function getReader(): Promise<maxmind.Reader<maxmind.CityResponse> | null> {
  // Every PM2 process holds its own reader; only one of them downloads (see
  // refreshGeoDatabase). The others notice the newer file here and reload, so
  // the previous release stops being used — the GeoLite licence requires
  // switching to a new release promptly.
  if (reader && Date.now() - lastFileCheck < FILE_CHECK_INTERVAL_MS) return reader
  if (readerLoading) return readerLoading
  lastFileCheck = Date.now()

  const mtimeMs = await fs.promises.stat(DB_PATH).then((s) => s.mtimeMs).catch(() => null)
  if (mtimeMs === null) {
    // Not downloaded yet. Never on the scan path: start it in the background
    // and answer without geo for now.
    void refreshGeoDatabase().catch((err) => logger.error("GeoIP download failed", { error: String(err) }))
    return null
  }
  if (reader && mtimeMs === readerMtimeMs) return reader

  readerLoading = maxmind
    .open<maxmind.CityResponse>(DB_PATH)
    .then((r) => {
      reader = r
      readerMtimeMs = mtimeMs
      logger.info("GeoIP database loaded", { path: DB_PATH })
      return r
    })
    .catch((err) => {
      logger.error("GeoIP database could not be opened", { error: String(err) })
      return reader
    })
    .finally(() => {
      readerLoading = null
    })
  return readerLoading
}

// ─── Download from MaxMind (official) ─────────────────────────────────────────
//
// GeoLite2-City straight from MaxMind with the account's licence key — HTTP
// basic auth (account id : licence key), following the redirect to MaxMind's
// storage, verified against MaxMind's SHA-256. It used to come from an
// unofficial GitHub mirror with no checksum (audit, 24 Oct 2026).
//
// GeoLite End User License Agreement: attribution to MaxMind (shown under the
// location charts), and old releases must stop being used within 30 days of a
// new one — hence the weekly refresh (subscription-expiry worker). GeoLite
// accounts may download 30 times a day.

const EDITION = "GeoLite2-City"
const DOWNLOAD_URL = `https://download.maxmind.com/geoip/databases/${EDITION}/download`
/** Refresh when the copy on disk is older than this. MaxMind publishes GeoLite updates weekly or more. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export function maxmindConfigured(): boolean {
  return Boolean(env.MAXMIND_ACCOUNT_ID && env.MAXMIND_LICENSE_KEY)
}

function maxmindFetch(suffix: string, timeoutMs: number): Promise<Response> {
  const auth = Buffer.from(`${env.MAXMIND_ACCOUNT_ID}:${env.MAXMIND_LICENSE_KEY}`).toString("base64")
  return fetch(`${DOWNLOAD_URL}?suffix=${suffix}`, {
    // fetch drops Authorization on the cross-origin redirect to the storage
    // host, which is what we want — that URL is pre-signed.
    headers: { Authorization: `Basic ${auth}`, "User-Agent": "genxqr-geo/2.0" },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  })
}

/**
 * Downloads, verifies and installs the current GeoLite2-City release.
 *
 * `target` exists for the tests: deploy.sh runs them inside the production
 * checkout, where the default path IS the live database, and re-installing it
 * there would stamp it fresh on every deploy so the weekly refresh never ran.
 */
export async function downloadGeoDatabase(target: string = DB_PATH): Promise<void> {
  if (!maxmindConfigured()) throw new Error("MAXMIND_ACCOUNT_ID / MAXMIND_LICENSE_KEY are not set")
  const { mkdir, mkdtemp, readdir, rename, rm } = fs.promises
  const dataDir = path.dirname(target)
  await mkdir(dataDir, { recursive: true })
  const work = await mkdtemp(path.join(dataDir, ".geo-"))
  try {
    const shaRes = await maxmindFetch("tar.gz.sha256", 30_000)
    if (!shaRes.ok) throw new Error(`MaxMind checksum download failed: HTTP ${shaRes.status}`)
    const expected = (await shaRes.text()).trim().split(/\s+/)[0]?.toLowerCase() ?? ""
    if (!/^[0-9a-f]{64}$/.test(expected)) throw new Error("MaxMind checksum file was not a SHA-256")

    const res = await maxmindFetch("tar.gz", 300_000)
    if (!res.ok || !res.body) throw new Error(`MaxMind download failed: HTTP ${res.status}`)
    const archive = path.join(work, "db.tar.gz")
    const hash = createHash("sha256")
    const out = fs.createWriteStream(archive)
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      hash.update(chunk)
      if (!out.write(chunk)) await new Promise<void>((r) => out.once("drain", () => r()))
    }
    await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())))
    const actual = hash.digest("hex")
    if (actual !== expected) throw new Error("MaxMind download failed its SHA-256 check")

    await promisify(execFile)("tar", ["-xzf", archive, "-C", work])
    const folder = (await readdir(work, { withFileTypes: true })).find((d) => d.isDirectory() && d.name.startsWith(EDITION))
    const mmdb = folder ? path.join(work, folder.name, `${EDITION}.mmdb`) : null
    if (!mmdb || !fs.existsSync(mmdb)) throw new Error("MaxMind archive did not contain the database")
    await maxmind.open(mmdb) // refuse a file the reader cannot load

    // Replacing the file deletes the previous release, as the licence requires.
    await rename(mmdb, target)
    // tar keeps MaxMind's build time on the file. The age check above is "time
    // since WE downloaded", so stamp it now — otherwise a gap of over a week
    // between MaxMind releases would re-download every 10 minutes and run into
    // the 30-a-day limit.
    const now = new Date()
    await fs.promises.utimes(target, now, now)
    logger.info("GeoIP database updated from MaxMind", { release: folder!.name })
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

/**
 * Downloads a new release when the copy on disk is missing or older than a
 * week (or always, with force). Only one process does it: a Redis lock, since
 * PM2 runs one process per CPU and GeoLite allows 30 downloads a day.
 */
export async function refreshGeoDatabase(opts: { force?: boolean } = {}): Promise<"updated" | "fresh" | "skipped"> {
  if (!maxmindConfigured()) {
    logger.warn("MAXMIND_ACCOUNT_ID / MAXMIND_LICENSE_KEY not set — scans get no location data")
    return "skipped"
  }
  const mtimeMs = await fs.promises.stat(DB_PATH).then((s) => s.mtimeMs).catch(() => null)
  if (!opts.force && mtimeMs !== null && Date.now() - mtimeMs < MAX_AGE_MS) return "fresh"

  const lock = await redis.set("geo:refresh:lock", String(process.pid), "EX", 30 * 60, "NX").catch(() => null)
  if (!lock) return "skipped"
  try {
    await downloadGeoDatabase()
    lastFileCheck = 0 // this process reloads on its next lookup
    return "updated"
  } finally {
    await redis.del("geo:refresh:lock").catch(() => undefined)
  }
}

// ─── Private IP detection ─────────────────────────────────────────────────────

function isPrivateIP(ip: string): boolean {
  return /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1|::ffff:127\.|localhost|0\.0\.0\.0)/.test(ip)
}

// ─── Server public IP (ipify — MIT licensed, free, no restrictions) ───────────
// When the scanner IP is private (localhost / LAN / dev box), we fall back to
// the server's own public IP so analytics still produce a real location.

const SERVER_IP_CACHE_TTL = 60 * 60 // 1 hour

async function fetchServerPublicIP(): Promise<string | null> {
  const cacheKey = "geo:server_public_ip"
  try {
    const cached = await redis.get(cacheKey)
    if (cached) return cached

    const res = await fetch("https://api64.ipify.org?format=json", {
      signal: AbortSignal.timeout(3_000),
    })
    const data = (await res.json()) as { ip?: string }
    if (data.ip) {
      await redis.setex(cacheKey, SERVER_IP_CACHE_TTL, data.ip)
      return data.ip
    }
  } catch (err) {
    logger.warn("Failed to fetch server public IP via ipify", { error: String(err) })
  }
  return null
}

// ─── Core lookup ──────────────────────────────────────────────────────────────

function queryReader(db: maxmind.Reader<maxmind.CityResponse>, ip: string): GeoInfo {
  try {
    const result = db.get(ip)
    if (!result) return EMPTY_GEO
    return {
      country:     result.country?.names?.en     ?? null,
      countryCode: result.country?.iso_code       ?? null,
      city:        result.city?.names?.en         ?? null,
      region:      result.subdivisions?.[0]?.names?.en ?? null,
      lat:         result.location?.latitude      ?? null,
      lng:         result.location?.longitude     ?? null,
    }
  } catch {
    return EMPTY_GEO
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Full geo lookup for any IP.
 * - Public IPs   → local MMDB query (sub-millisecond, no network)
 * - Private IPs  → resolved to the server's own public IP via ipify, then queried
 * - DB missing   → download started in the background; EMPTY_GEO until it lands
 */
export async function lookupGeo(ip: string): Promise<GeoInfo> {
  if (!ip) return EMPTY_GEO

  let resolvedIp = ip
  if (isPrivateIP(ip)) {
    const serverIp = await fetchServerPublicIP()
    if (!serverIp || isPrivateIP(serverIp)) return EMPTY_GEO
    resolvedIp = serverIp
  }

  const db = await getReader()
  if (!db) return EMPTY_GEO

  return queryReader(db, resolvedIp)
}

/**
 * Whether lookups can answer at all. An empty lookupGeo result means either
 * "this IP has no location" or "no database yet"; callers that store the
 * result (user-location.service) must not record the second as the first.
 */
export async function isGeoReady(): Promise<boolean> {
  return (await getReader()) !== null
}

/**
 * Country code only — used by the smart-routing evaluator.
 */
export async function getCountryCode(ip: string): Promise<string | null> {
  const geo = await lookupGeo(ip)
  return geo.countryCode
}
