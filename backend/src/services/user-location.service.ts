import net from "node:net"
import type { Prisma } from "@prisma/client"
import { prisma } from "../db/prisma.js"
import { logger } from "../logger/index.js"
import { CLOUDFLARE_RANGES } from "../config/trusted-proxies.js"
import { isNonPublicAddress } from "../utils/ip-classify.util.js"
import { isGeoReady, lookupGeo } from "./geo.service.js"

/**
 * Where each account signed up and last signed in from — for the admin panel,
 * to see which countries customers come from (decided 24 Oct 2026).
 *
 * Stored on User as signup* and lastLogin* (IP, country code + name, region,
 * city). Country code "ZZ" means "looked up, no location"; null means "not
 * looked up yet", which happens only when the GeoLite database is not loaded —
 * fillMissingUserLocations (expiry worker) resolves those later.
 *
 * An IP is only kept when it can be the user's own: never a private address,
 * never a Cloudflare edge. Before the trust-proxy fix every recorded IP was
 * Cloudflare's, and locating those would put users in Cloudflare's data
 * centres — so such addresses count as "unknown", not as a place.
 */

export const UNKNOWN_COUNTRY = "ZZ"

type Kind = "signup" | "lastLogin"

const cloudflare = new net.BlockList()
for (const range of CLOUDFLARE_RANGES) {
  const [address, prefix] = range.split("/") as [string, string]
  cloudflare.addSubnet(address, Number(prefix), net.isIPv6(address) ? "ipv6" : "ipv4")
}

/** The client IP as a plain address, or null when it cannot be the user's own. */
export function usableClientIp(raw: string | null | undefined): string | null {
  if (!raw) return null
  const ip = raw.trim().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, "")
  const family = net.isIP(ip)
  if (family === 0) return null
  if (isNonPublicAddress(ip)) return null
  if (cloudflare.check(ip, family === 6 ? "ipv6" : "ipv4")) return null
  return ip
}

interface Located {
  ip: string | null
  countryCode: string | null
  country: string | null
  region: string | null
  city: string | null
}

/** null country = the database is not loaded, so nothing is known yet. */
async function locate(rawIp: string | null | undefined, geoReady: boolean): Promise<Located> {
  const ip = usableClientIp(rawIp)
  if (!ip) return { ip: null, countryCode: UNKNOWN_COUNTRY, country: null, region: null, city: null }
  if (!geoReady) return { ip, countryCode: null, country: null, region: null, city: null }
  const geo = await lookupGeo(ip)
  return {
    ip,
    countryCode: geo.countryCode ?? UNKNOWN_COUNTRY,
    country: geo.countryCode ? geo.country : null,
    region: geo.countryCode ? geo.region : null,
    city: geo.countryCode ? geo.city : null,
  }
}

function fields(kind: Kind, l: Located): Prisma.UserUpdateInput {
  return kind === "signup"
    ? { signupIp: l.ip, signupCountryCode: l.countryCode, signupCountry: l.country, signupRegion: l.region, signupCity: l.city }
    : { lastLoginIp: l.ip, lastLoginCountryCode: l.countryCode, lastLoginCountry: l.country, lastLoginRegion: l.region, lastLoginCity: l.city }
}

/**
 * The User fields for a sign-up and/or sign-in from `ip`, to merge into the
 * update that records it. Never throws: a location is never worth a failed login.
 */
export async function locationData(ip: string | null | undefined, kinds: Kind[]): Promise<Prisma.UserUpdateInput> {
  try {
    const l = await locate(ip, await isGeoReady())
    return Object.assign({}, ...kinds.map((k) => fields(k, l)))
  } catch (err) {
    logger.warn("Could not record a user location", { error: String(err) })
    return {}
  }
}

/** Records where an account was created (password sign-up). Never throws. */
export async function recordSignupLocation(userId: string, ip: string | null | undefined): Promise<void> {
  const data = await locationData(ip, ["signup"])
  if (Object.keys(data).length === 0) return
  await prisma.user.update({ where: { id: userId }, data }).catch((err) =>
    logger.warn("Could not save a sign-up location", { userId, error: String(err) }),
  )
}

const SIGNUP_ACTIONS = ["auth.register", "auth.login", "auth.login.google"]
const LOGIN_ACTIONS = ["auth.login", "auth.login.google"]

/**
 * Fills locations that are not known yet: accounts from before this existed
 * (from their audit-log IPs) and any recorded while the database was missing.
 * Batched and idempotent — run from the 10-minute expiry worker until done.
 */
export async function fillMissingUserLocations(batch = 500): Promise<number> {
  if (!(await isGeoReady())) return 0
  let filled = 0

  for (const kind of ["signup", "lastLogin"] as const) {
    const users = await prisma.user.findMany({
      where: kind === "signup"
        ? { signupCountryCode: null }
        : { lastLoginCountryCode: null, lastLoginAt: { not: null } },
      select: { id: true, signupIp: true, lastLoginIp: true },
      take: batch,
    })
    if (users.length === 0) continue

    // Every candidate IP for the batch, oldest first (sign-up = the first
    // usable one; last sign-in = the newest usable sign-in).
    const rows = await prisma.auditLog.findMany({
      where: {
        userId: { in: users.map((u) => u.id) },
        action: { in: kind === "signup" ? SIGNUP_ACTIONS : LOGIN_ACTIONS },
        ip: { not: null },
      },
      select: { userId: true, ip: true },
      orderBy: { createdAt: "asc" },
    })
    const ipsByUser = new Map<string, string[]>()
    for (const r of rows) {
      if (!r.userId || !usableClientIp(r.ip)) continue
      ipsByUser.set(r.userId, [...(ipsByUser.get(r.userId) ?? []), r.ip!])
    }

    for (const u of users) {
      const known = kind === "signup" ? u.signupIp : u.lastLoginIp
      const fromAudit = ipsByUser.get(u.id) ?? []
      const ip = known ?? (kind === "signup" ? fromAudit[0] : fromAudit[fromAudit.length - 1]) ?? null
      const l = await locate(ip, true)
      await prisma.user.update({ where: { id: u.id }, data: fields(kind, l) })
      filled++
    }
  }

  if (filled > 0) logger.info("Filled user locations", { count: filled })
  return filled
}

/** Effective country for reports: where they signed up, else where they last signed in. */
export function effectiveCountry(u: {
  signupCountryCode: string | null
  signupCountry: string | null
  lastLoginCountryCode: string | null
  lastLoginCountry: string | null
}): { code: string; name: string | null } {
  if (u.signupCountryCode && u.signupCountryCode !== UNKNOWN_COUNTRY) return { code: u.signupCountryCode, name: u.signupCountry }
  if (u.lastLoginCountryCode && u.lastLoginCountryCode !== UNKNOWN_COUNTRY) return { code: u.lastLoginCountryCode, name: u.lastLoginCountry }
  return { code: UNKNOWN_COUNTRY, name: null }
}

/** Prisma filter for "effective country is `code`" (UNKNOWN_COUNTRY for unknown). */
export function countryFilter(code: string): Prisma.UserWhereInput {
  const unknownSignup: Prisma.UserWhereInput = { OR: [{ signupCountryCode: null }, { signupCountryCode: UNKNOWN_COUNTRY }] }
  if (code === UNKNOWN_COUNTRY) {
    return { AND: [unknownSignup, { OR: [{ lastLoginCountryCode: null }, { lastLoginCountryCode: UNKNOWN_COUNTRY }] }] }
  }
  return { OR: [{ signupCountryCode: code }, { AND: [unknownSignup, { lastLoginCountryCode: code }] }] }
}
