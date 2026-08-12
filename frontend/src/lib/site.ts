/**
 * Canonical site identity — the single source of truth for anything that needs
 * the public URL, brand name, or organisation details.
 *
 * This exists because those values were previously hardcoded in ~80 places
 * across four *different* domains (the VPS hostname, a .io, a .in, and the
 * real .com). Structured data and sitemaps that point at the wrong host are
 * worse than having none: search engines index a domain you aren't serving.
 *
 * Import from here rather than writing a URL inline.
 */

/** Public origin, no trailing slash. Overridable per-environment via VITE_SITE_URL. */
export const SITE_URL: string = (
  import.meta.env["VITE_SITE_URL"] as string | undefined ?? "https://genxqr.com"
).replace(/\/$/, "")

export const SITE_NAME = "GenXQR"

export const SITE_TAGLINE = "QR Code Generator with Analytics"

export const SITE_DESCRIPTION =
  "Create dynamic QR codes with editable destinations, real-time scan analytics, A/B testing, and smart routing. 16 QR types including URL, vCard, Wi-Fi, PDF, and menus. Free plan available."

/** Default social share image. Must be an absolute URL for crawlers. */
export const OG_IMAGE_PATH = "/og-image.png"

export const SOCIAL = {
  twitter: "@GenXQR",
} as const

export const ORGANISATION = {
  name: SITE_NAME,
  /** City-level only — deliberately not a street address, which we don't publish. */
  addressLocality: "New Delhi",
  addressCountry: "IN",
  email: "support@genxqr.com",
  salesEmail: "sales@genxqr.com",
} as const

/** Joins a path onto the canonical origin. `absoluteUrl("/pricing")` → https://genxqr.com/pricing */
export function absoluteUrl(path = "/"): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`
}
