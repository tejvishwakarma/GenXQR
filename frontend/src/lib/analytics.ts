/**
 * Google Analytics 4.
 *
 * Loads gtag.js at runtime, and ONLY when VITE_GA_MEASUREMENT_ID is set. That
 * makes analytics opt-in per environment: local and preview builds leave the id
 * blank and send nothing, so development traffic never pollutes the property.
 *
 * Two non-obvious details:
 *
 * 1. This is a single-page app, so gtag's automatic page_view fires once — on the
 *    initial load — and every subsequent client-side route change would go
 *    unrecorded. `send_page_view: false` disables the automatic event and
 *    `trackPageView()` sends one per route change instead, which also keeps the
 *    initial and subsequent page views consistent in shape.
 *
 * 2. The site CSP must allow googletagmanager.com in script-src and
 *    google-analytics.com in connect-src/img-src, or the script is blocked and
 *    this silently collects nothing. See deploy/cloudpanel-vhost-nodejs.conf.
 *
 * Note this is separate from QRCode.gaId, which injects a *customer's* own
 * tracking id into their QR landing page. This module is our own site analytics.
 */

/** GA4 measurement ids look like G-XXXXXXXXXX; a UA-… id is Universal Analytics and long dead. */
const GA_ID_PATTERN = /^G-[A-Z0-9]+$/

const measurementId = (import.meta.env["VITE_GA_MEASUREMENT_ID"] as string | undefined)?.trim() ?? ""

type GtagArgs =
  | [command: "js", value: Date]
  | [command: "config", targetId: string, config?: Record<string, unknown>]
  | [command: "event", eventName: string, params?: Record<string, unknown>]

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: GtagArgs) => void
  }
}

let initialised = false

/** True when a usable GA4 id is configured. */
export function isAnalyticsEnabled(): boolean {
  return GA_ID_PATTERN.test(measurementId)
}

/**
 * Injects gtag.js and configures the property. Safe to call more than once —
 * subsequent calls are ignored.
 */
export function initAnalytics(): void {
  if (initialised || typeof window === "undefined") return

  if (!isAnalyticsEnabled()) {
    // A malformed id is worth surfacing: it looks configured but collects nothing.
    if (measurementId) {
      console.warn(
        `[analytics] VITE_GA_MEASUREMENT_ID "${measurementId}" is not a valid GA4 id ` +
          `(expected G-XXXXXXXXXX). Analytics is disabled.`,
      )
    }
    return
  }

  initialised = true

  window.dataLayer = window.dataLayer ?? []

  /**
   * Queues a gtag command.
   *
   * It MUST push the `arguments` object, not an array. gtag.js walks the
   * dataLayer and only treats `arguments`-shaped entries as commands; a plain
   * Array is silently skipped. Get this wrong and everything still *looks*
   * correct — the script loads, window.gtag exists, entries appear in the
   * dataLayer, no error is logged — but js/config/page_view are never processed
   * and not one request reaches Google.
   *
   * That is exactly what shipped: the rest parameter was pushed directly, so the
   * property was never configured and no hit was ever sent.
   */
  function gtag(..._args: GtagArgs) {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments)
  }
  window.gtag = gtag

  const script = document.createElement("script")
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`
  script.addEventListener("error", () => {
    // Usually a CSP block or an ad blocker. Not fatal, but silent otherwise.
    console.warn("[analytics] gtag.js failed to load — check CSP script-src and any blockers.")
  })
  document.head.appendChild(script)

  gtag("js", new Date())
  gtag("config", measurementId, {
    // Route changes are reported manually; see the note at the top of this file.
    send_page_view: false,
  })
}

/**
 * Query parameters that must never reach Google.
 *
 * Several of these are live credentials — a password-reset token or an OAuth
 * code in an analytics property is an account-takeover path for anyone with
 * read access to it, and Google's own terms forbid sending PII besides. Sending
 * a URL verbatim is the usual way this leaks, because the token sits in the
 * query string of a page the user genuinely visits.
 *
 * Anything not listed here is preserved, so utm_source/utm_campaign and similar
 * attribution parameters still work.
 */
const REDACTED_QUERY_PARAMS = new Set([
  "token",          // password reset + email verification
  "oauth_code",     // one-time Google OAuth exchange code
  "code",
  "access_token",
  "refresh_token",
  "secret",
  "password",
  "key",
  "api_key",
  "email",
  "cf_order_id",    // payment order identifier
])

/**
 * Path patterns carrying a secret in a path SEGMENT rather than the query
 * string, which query redaction alone would miss.
 */
const REDACTED_PATH_PREFIXES: Array<{ prefix: string; replacement: string }> = [
  // /invite/<team-invite-token> — accepting it joins a team.
  { prefix: "/invite/", replacement: "/invite/:token" },
]

/**
 * Strips credentials out of a URL before it is reported.
 *
 * Exported for testing — this is security-relevant enough to assert on directly
 * rather than only through the gtag call.
 */
export function sanitisePath(rawPath: string): string {
  const [pathname = "", queryString = ""] = rawPath.split("?")

  for (const { prefix, replacement } of REDACTED_PATH_PREFIXES) {
    if (pathname.startsWith(prefix) && pathname.length > prefix.length) {
      // The secret is the segment itself; keep the route shape for reporting.
      return replacement
    }
  }

  if (!queryString) return pathname

  const params = new URLSearchParams(queryString)
  let changed = false
  for (const name of [...params.keys()]) {
    if (REDACTED_QUERY_PARAMS.has(name.toLowerCase())) {
      params.set(name, "REDACTED")
      changed = true
    }
  }

  const rebuilt = params.toString()
  if (!rebuilt) return pathname
  // Only note the change in the value, never drop the parameter entirely —
  // knowing a reset link was opened is useful; knowing the token is not.
  return changed || rebuilt !== queryString ? `${pathname}?${rebuilt}` : rawPath
}

/**
 * Records a page view. Call on every route change, including the first.
 *
 * `page_path` is passed explicitly rather than letting GA read location, because
 * at the moment React Router commits a navigation the URL is already updated but
 * the document title is not, so gtag would otherwise attribute the new path to
 * the previous page's title.
 *
 * `page_location` is rebuilt from the sanitised path rather than passed as
 * window.location.href. Passing the raw href would leak every credential this
 * function just stripped out of page_path — and if page_location is omitted
 * entirely, gtag falls back to reading document.location itself, which leaks it
 * anyway. It must be set, and set to something safe.
 */
export function trackPageView(path: string, title?: string): void {
  if (!initialised || !window.gtag) return
  const safePath = sanitisePath(path)
  window.gtag("event", "page_view", {
    page_path: safePath,
    page_location: `${window.location.origin}${safePath}`,
    page_title: title ?? document.title,
  })
}

/**
 * Records a custom event — e.g. trackEvent("qr_created", { qr_type: "URL" }).
 * A no-op when analytics is disabled, so callers need no guard of their own.
 */
export function trackEvent(name: string, params?: Record<string, unknown>): void {
  if (!initialised || !window.gtag) return
  window.gtag("event", name, params)
}
