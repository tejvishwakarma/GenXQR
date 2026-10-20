/**
 * First-touch sign-up attribution.
 *
 * On the first page load of a visit, records where the visitor came from — the
 * UTM tags on the landing URL, or else the external referrer's hostname — and
 * keeps it for 90 days. It is sent once, at sign-up (register body, or the
 * Google OAuth start URL), and the server stores it on the new account.
 *
 * FIRST touch: an existing record is never overwritten until it expires, so a
 * visitor who first arrives from an Instagram Reel and later types genxqr.com
 * directly is still credited to Instagram.
 *
 * Only campaign tags, a hostname and a path are kept — no full referring URL
 * (other sites' query strings) and nothing identifying. The server re-validates
 * all of it and derives the source itself; see backend attribution.util.ts.
 */
import { readStoredValue } from "@/lib/utils"

const STORAGE_KEY = "gx_first_touch"
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000

export interface Attribution {
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmContent: string | null
  utmTerm: string | null
  referrer: string | null
  landingPath: string
  at: string
}

function readStored(): Attribution | null {
  const raw = readStoredValue(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Attribution
    const age = Date.now() - new Date(parsed.at).getTime()
    return Number.isFinite(age) && age >= 0 && age <= MAX_AGE_MS ? parsed : null
  } catch {
    return null
  }
}

/** The referrer's hostname, or null if there is none or it is this site. */
function externalReferrerHost(): string | null {
  if (!document.referrer) return null
  try {
    const host = new URL(document.referrer).hostname.toLowerCase()
    return host && host !== window.location.hostname.toLowerCase() ? host : null
  } catch {
    return null
  }
}

/**
 * Call once per page load. Records this visit as the first touch unless an
 * unexpired one is already stored. Safe to call during SSR (does nothing).
 */
export function captureAttribution(): void {
  if (typeof window === "undefined") return
  if (readStored()) return

  const params = new URLSearchParams(window.location.search)
  const tag = (name: string) => params.get(name)?.trim().slice(0, 200) || null

  const record: Attribution = {
    utmSource: tag("utm_source"),
    utmMedium: tag("utm_medium"),
    utmCampaign: tag("utm_campaign"),
    utmContent: tag("utm_content"),
    utmTerm: tag("utm_term"),
    // Capped to the server's limits (attribution.util.ts) so one long value
    // cannot get the whole record rejected.
    referrer: externalReferrerHost()?.slice(0, 255) ?? null,
    landingPath: window.location.pathname.slice(0, 500),
    at: new Date().toISOString(),
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record))
  } catch {
    // Storage blocked (private mode, site data disabled): the account is then
    // stored as "not recorded", which is the truth.
  }
}

/** The stored first touch, or null. Sent with sign-up. */
export function getAttribution(): Attribution | null {
  if (typeof window === "undefined") return null
  return readStored()
}

/** Query-string fragment for /api/auth/google, or "" when nothing is stored. */
export function attributionQueryParam(): string {
  const a = getAttribution()
  return a ? `&attribution=${encodeURIComponent(JSON.stringify(a))}` : ""
}
