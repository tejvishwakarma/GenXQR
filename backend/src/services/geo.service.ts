import path from "path"
import fs from "fs"
import * as maxmind from "maxmind"
import { redis } from "../redis/client.js"
import { logger } from "../logger/index.js"

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

// ─── Reader (singleton, loaded once on first lookup) ──────────────────────────

let reader: maxmind.Reader<maxmind.CityResponse> | null = null
let readerLoading: Promise<maxmind.Reader<maxmind.CityResponse>> | null = null

async function getReader(): Promise<maxmind.Reader<maxmind.CityResponse> | null> {
  if (reader) return reader
  if (readerLoading) return readerLoading

  if (!fs.existsSync(DB_PATH)) {
    // DB not yet downloaded — try to fetch it automatically
    logger.info("GeoIP database not found, downloading now...", { path: DB_PATH })
    try {
      await downloadDB()
    } catch (err) {
      logger.error("Auto-download of GeoIP database failed — run: pnpm run geo:update", {
        error: String(err),
      })
      return null
    }
  }

  readerLoading = maxmind.open<maxmind.CityResponse>(DB_PATH).then((r) => {
    reader = r
    readerLoading = null
    logger.info("GeoIP database loaded", { path: DB_PATH })
    return r
  })

  return readerLoading
}

// ─── Auto-download (used on first start when DB is missing) ───────────────────

const DB_URL =
  "https://github.com/P3TERX/GeoLite.mmdb/raw/download/GeoLite2-City.mmdb"

async function downloadDB(): Promise<void> {
  const { pipeline } = await import("stream/promises")
  const { createWriteStream } = await import("fs")
  const { rename, mkdir } = await import("fs/promises")

  const dataDir = path.dirname(DB_PATH)
  const tmpPath = DB_PATH + ".tmp"

  await mkdir(dataDir, { recursive: true })

  const res = await fetch(DB_URL, {
    redirect: "follow",
    signal: AbortSignal.timeout(120_000),
    headers: { "User-Agent": "genx-qr-geo/1.0" },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading GeoIP database`)

  await pipeline(res.body as unknown as NodeJS.ReadableStream, createWriteStream(tmpPath))
  await rename(tmpPath, DB_PATH)
  logger.info("GeoIP database downloaded", { path: DB_PATH })
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
 * - DB missing   → auto-downloaded on first call; returns EMPTY_GEO if download fails
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
 * Country code only — used by the smart-routing evaluator.
 */
export async function getCountryCode(ip: string): Promise<string | null> {
  const geo = await lookupGeo(ip)
  return geo.countryCode
}
