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
  /**
   * Registered legal entity, shown on the Contact page and in the Organization
   * structured data. Must match the PAN / registration certificate exactly —
   * payment-gateway reviewers compare the two.
   */
  legalName: "Digital chitrakar",
  /**
   * NO PHONE NUMBER IS PUBLISHED — a deliberate choice, and a known gap.
   *
   * Cashfree's onboarding checklist asks for "Contact us (one email ID and a
   * valid phone number)", so a reviewer may raise this. The Contact page sets
   * response-time expectations instead. To publish one later, add
   * `phone: "+91 …"` here and render it on the Contact page; the Organization
   * schema emits `telephone` automatically when the field is present.
   */
  /** City-level only — deliberately not a street address, which we don't publish. */
  addressLocality: "New Delhi",
  addressCountry: "IN",
  /**
   * The single public contact address. Support, sales, privacy and careers
   * enquiries all route here — separate salesEmail/privacyEmail keys existed
   * but pointed at the same inbox, which is just three ways to drift apart.
   * Split them again only when there are genuinely separate inboxes.
   */
  email: "support@genxqr.com",
} as const

/**
 * Reports which payment-gateway identity requirements the site currently meets.
 * `phone` is intentionally absent from ORGANISATION, so `hasPhone` is false and
 * `pnpm seo:check` keeps reporting it — a green check while a mandatory field is
 * missing would be worse than no check at all.
 */
export const businessIdentityStatus = (): { hasLegalName: boolean; hasPhone: boolean } => ({
  hasLegalName:
    ORGANISATION.legalName.length > 0 && !ORGANISATION.legalName.startsWith("PLACEHOLDER"),
  hasPhone: "phone" in ORGANISATION,
})

/** Joins a path onto the canonical origin. `absoluteUrl("/pricing")` → https://genxqr.com/pricing */
export function absoluteUrl(path = "/"): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`
}
