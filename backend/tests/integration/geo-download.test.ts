import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { env } from "../../src/config/env.js"
import { downloadGeoDatabase } from "../../src/services/geo.service.js"

/**
 * GeoLite2 now comes from MaxMind itself (licence key, SHA-256 verified)
 * instead of an unofficial GitHub mirror with no checksum (audit, 24 Oct 2026).
 * MaxMind is stubbed: these check the pipeline, not the network.
 */
const DB = path.join(process.cwd(), "data", "GeoLite2-City.mmdb")
const hasLocalDb = fs.existsSync(DB)

function withCredentials() {
  const before = { id: env.MAXMIND_ACCOUNT_ID, key: env.MAXMIND_LICENSE_KEY }
  ;(env as Record<string, unknown>).MAXMIND_ACCOUNT_ID = "123456"
  ;(env as Record<string, unknown>).MAXMIND_LICENSE_KEY = "test_key"
  return () => {
    ;(env as Record<string, unknown>).MAXMIND_ACCOUNT_ID = before.id
    ;(env as Record<string, unknown>).MAXMIND_LICENSE_KEY = before.key
  }
}

/** A GeoLite2-City_<date>.tar.gz built the way MaxMind ships it. */
function buildArchive(): Buffer {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-test-"))
  const release = path.join(dir, "GeoLite2-City_20261020")
  fs.mkdirSync(release)
  fs.copyFileSync(DB, path.join(release, "GeoLite2-City.mmdb"))
  // MaxMind's archives carry the release's build time, which tar keeps on extract.
  const built = new Date("2026-09-01T00:00:00Z")
  fs.utimesSync(path.join(release, "GeoLite2-City.mmdb"), built, built)
  execFileSync("tar", ["-czf", path.join(dir, "a.tar.gz"), "-C", dir, "GeoLite2-City_20261020"])
  const buf = fs.readFileSync(path.join(dir, "a.tar.gz"))
  fs.rmSync(dir, { recursive: true, force: true })
  return buf
}

function stubMaxMind(archive: Buffer, checksum: string, seen: string[]) {
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    seen.push(String((init?.headers as Record<string, string> | undefined)?.Authorization ?? ""))
    if (url.endsWith("suffix=tar.gz.sha256")) return new Response(`${checksum}  GeoLite2-City_20261020.tar.gz\n`)
    if (url.endsWith("suffix=tar.gz")) return new Response(archive)
    return new Response("not found", { status: 404 })
  })
}

describe("GeoLite2 download from MaxMind", () => {
  let restore: (() => void) | null = null
  afterEach(() => {
    vi.unstubAllGlobals()
    restore?.()
    restore = null
  })

  it.skipIf(!hasLocalDb)("should install a verified release, authenticating as the account", async () => {
    restore = withCredentials()
    const archive = buildArchive()
    const seen: string[] = []
    stubMaxMind(archive, createHash("sha256").update(archive).digest("hex"), seen)
    const before = fs.statSync(DB).mtimeMs

    await downloadGeoDatabase()

    expect(fs.statSync(DB).mtimeMs).toBeGreaterThanOrEqual(before)
    // Stamped with the install time, not the archive's: the weekly age check
    // must count from our download.
    expect(Date.now() - fs.statSync(DB).mtimeMs).toBeLessThan(60_000)
    expect(seen.every((h) => h === `Basic ${Buffer.from("123456:test_key").toString("base64")}`)).toBe(true)
  })

  it("should refuse a download that fails its checksum, leaving the current file alone", async () => {
    restore = withCredentials()
    const before = hasLocalDb ? fs.statSync(DB).mtimeMs : null
    stubMaxMind(Buffer.from("not really a database"), "0".repeat(64), [])
    await expect(downloadGeoDatabase()).rejects.toThrow(/SHA-256/)
    if (hasLocalDb) expect(fs.statSync(DB).mtimeMs).toBe(before)
  })

  it("should not run without MaxMind credentials", async () => {
    const before = { id: env.MAXMIND_ACCOUNT_ID, key: env.MAXMIND_LICENSE_KEY }
    ;(env as Record<string, unknown>).MAXMIND_ACCOUNT_ID = ""
    restore = () => { (env as Record<string, unknown>).MAXMIND_ACCOUNT_ID = before.id }
    await expect(downloadGeoDatabase()).rejects.toThrow(/MAXMIND/)
  })
})
