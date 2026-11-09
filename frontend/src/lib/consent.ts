import { isWhiteLabelPage, onOwnSite } from "@/lib/site"
import { isAnalyticsEnabled } from "@/lib/analytics"
import { isClarityEnabled } from "@/lib/clarity"

/**
 * Cookie consent for GenXQR's OWN analytics (built 9 Nov 2026).
 *
 * Neither Google Analytics nor Microsoft Clarity loads until the visitor says
 * yes, each separately; "Reject" is as easy as "Accept". The choice lives in
 * this browser's localStorage (no account needed — most visitors have none),
 * and can be changed any time from the footer or the Cookie Policy.
 *
 * Where each may run (decided 9 Nov 2026):
 * - Google Analytics: genxqr.com pages, but never scan pages (/l/, /r/ — those
 *   visitors are our customers' customers) or the admin panel.
 * - Clarity records the screen, so only PUBLIC pages: never the dashboard,
 *   admin, sign-in screens (their URLs can carry tokens) or scan pages. If a
 *   visitor navigates from a public page into the app, Clarity is already
 *   running, so DashboardLayout/AdminLayout carry data-clarity-mask to hide
 *   their content.
 * Custom domains and agency share reports get neither (site.ts).
 */

export type Consent = { analytics: boolean; recordings: boolean }
type Stored = Consent & { v: 1; at: string }

const KEY = "genxqr_consent"
export const CONSENT_CHANGED = "genxqr:consent-changed"
export const CONSENT_OPEN = "genxqr:consent-open"

export function readConsent(): Consent | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Partial<Stored>
    if (s.v !== 1 || typeof s.analytics !== "boolean" || typeof s.recordings !== "boolean") return null
    return { analytics: s.analytics, recordings: s.recordings }
  } catch {
    return null
  }
}

/**
 * Saves a choice. Turning something OFF that was on reloads the page after
 * clearing its cookies: a loaded tracker cannot be unloaded, and a reload is
 * the only honest way to stop it.
 */
export function saveConsent(next: Consent): void {
  const before = readConsent()
  try {
    const stored: Stored = { v: 1, at: new Date().toISOString(), ...next }
    window.localStorage.setItem(KEY, JSON.stringify(stored))
  } catch {
    // Storage blocked: the choice holds for this page only.
  }
  const withdrawn = (before?.analytics && !next.analytics) || (before?.recordings && !next.recordings)
  if (withdrawn) {
    clearTrackerCookies(!next.analytics, !next.recordings)
    window.location.reload()
    return
  }
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED))
}

/** Opens the cookie settings panel (footer link, Cookie Policy button). */
export function openConsentSettings(): void {
  window.dispatchEvent(new CustomEvent(CONSENT_OPEN))
}

const SCAN_PAGE = /^\/(l|r)(\/|$)/
const ADMIN = /^\/admin(\/|$)/
const APP_OR_AUTH = /^\/(app|login|signup|forgot-password|reset-password|verify-email|invite)(\/|$)/

/** Google Analytics may run on this path (consent aside). */
export function analyticsAllowedOn(path: string): boolean {
  return onOwnSite() && !isWhiteLabelPage(path) && !SCAN_PAGE.test(path) && !ADMIN.test(path)
}

/** Clarity may run on this path (consent aside): public pages only. */
export function clarityAllowedOn(path: string): boolean {
  return analyticsAllowedOn(path) && !APP_OR_AUTH.test(path)
}

/** Whether to ask on this path: something configured could run here. */
export function consentRelevantOn(path: string): boolean {
  return (isAnalyticsEnabled() && analyticsAllowedOn(path)) || (isClarityEnabled() && clarityAllowedOn(path))
}

/** Which trackers this build has at all (the settings panel lists only those). */
export function configuredTrackers(): { analytics: boolean; recordings: boolean } {
  return { analytics: isAnalyticsEnabled(), recordings: isClarityEnabled() }
}

function clearTrackerCookies(analytics: boolean, recordings: boolean) {
  const names = document.cookie.split(";").map((c) => c.split("=")[0]!.trim()).filter((n) =>
    (analytics && (n === "_ga" || n.startsWith("_ga_") || n === "_gid")) ||
    (recordings && (n === "_clck" || n === "_clsk" || n === "CLID")),
  )
  const host = window.location.hostname
  const bare = host.replace(/^www\./, "")
  for (const n of names) {
    for (const domain of ["", `; domain=${host}`, `; domain=.${bare}`]) {
      document.cookie = `${n}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain}`
    }
  }
}
