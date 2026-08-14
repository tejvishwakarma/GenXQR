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
  // gtag must push `arguments` itself — an arrow function spreading into an array
  // does not produce the object gtag.js expects.
  function gtag(...args: GtagArgs) {
    window.dataLayer!.push(args)
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
 * Records a page view. Call on every route change, including the first.
 *
 * `page_path` is passed explicitly rather than letting GA read location, because
 * at the moment React Router commits a navigation the URL is already updated but
 * the document title is not, so gtag would otherwise attribute the new path to
 * the previous page's title.
 */
export function trackPageView(path: string, title?: string): void {
  if (!initialised || !window.gtag) return
  window.gtag("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
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
