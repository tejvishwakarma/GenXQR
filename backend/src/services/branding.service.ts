import { z } from "zod"
import { prisma } from "../db/prisma.js"
import { AppError } from "../middleware/error.middleware.js"
import { getPlanLimitsReadOnly, getUserPlanLimits } from "./billing.service.js"

/**
 * White-label branding.
 *
 * Three pages are seen by people who scan a customer's QR code and have no
 * relationship with GenXQR: the landing page, the password gate, and the expired
 * notice. White-label decides whose name appears on them.
 *
 * The rule is NOT "remove GenXQR". It is "show the customer instead". Those
 * pages ask a stranger to trust them — the password gate literally asks for a
 * secret — and an unattributed page asking for a password is what Google
 * classified as deceptive earlier this year. Every mode below therefore names
 * someone; none of them is anonymous. See resolveBranding.
 */

export const brandingSchema = z.object({
  /**
   * Shown in place of "GenXQR". Trimmed, and an empty string clears it — the
   * dashboard's clear button sends "" rather than a separate delete call.
   */
  brandName: z
    .string()
    .max(60, "Brand name must be 60 characters or fewer")
    .trim()
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),

  /**
   * Path of an uploaded image, or an absolute https URL.
   *
   * Restricted to those two shapes because this value is written into an <img>
   * src on a public page. A javascript: or data: URL there is stored XSS
   * against every visitor who scans the customer's code.
   */
  brandLogoUrl: z
    .string()
    .max(2048)
    .trim()
    .refine(
      (v) => v === "" || v.startsWith("/uploads/") || /^https:\/\//i.test(v),
      "Logo must be an uploaded file or an https URL",
    )
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
})

export interface BrandingSettings {
  brandName: string | null
  brandLogoUrl: string | null
  /** Whether the plan lets the brand NAME replace GenXQR's (Business+). */
  whiteLabelEnabled: boolean
  /** Whether the plan shows the logo at the top of scan pages (any paid plan). */
  scanPageLogoEnabled: boolean
}

/** The account owner's saved branding, plus whether their plan honours it. */
export async function getBranding(userId: string): Promise<BrandingSettings> {
  const [user, { limits }] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { brandName: true, brandLogoUrl: true },
    }),
    getUserPlanLimits(userId),
  ])
  if (!user) throw new AppError(404, "Account not found")

  return {
    brandName: user.brandName,
    brandLogoUrl: user.brandLogoUrl,
    whiteLabelEnabled: limits.whiteLabel,
    scanPageLogoEnabled: limits.scanPageLogo || limits.whiteLabel,
  }
}

/**
 * Saves branding. Each field is gated on its own feature: the logo on
 * scanPageLogo (any paid plan), the brand name on whiteLabel (Business+).
 *
 * Storage is deliberately not gated: a downgrade stops branding being USED (see
 * resolveBranding) but leaves what the customer typed intact, so re-subscribing
 * restores it rather than asking them to type it again.
 */
export async function updateBranding(
  userId: string,
  input: z.infer<typeof brandingSchema>,
): Promise<BrandingSettings> {
  const { limits } = await getUserPlanLimits(userId)
  if (input.brandName !== undefined && input.brandName !== null && !limits.whiteLabel) {
    throw new AppError(403, "Replacing GenXQR's name with your own is part of white-label, on the Business plan.")
  }
  if (input.brandLogoUrl !== undefined && input.brandLogoUrl !== null && !(limits.scanPageLogo || limits.whiteLabel)) {
    throw new AppError(403, "Adding your logo to scan pages needs a paid plan.")
  }
  await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.brandName !== undefined && { brandName: input.brandName }),
      ...(input.brandLogoUrl !== undefined && { brandLogoUrl: input.brandLogoUrl }),
    },
  })
  return getBranding(userId)
}

/**
 * What a scanner-facing page should display.
 *
 * `genxqr`  — our logo and name. The default, and the fallback for everything.
 * `custom`  — the customer's name and logo, on a plan with whiteLabel.
 *
 * There is deliberately no "none". A page with no identity at all is the exact
 * shape Search Console reported as a deceptive page: the QR password gate used
 * to show a padlock, a password field, and nothing saying who was asking. White
 * label moves that identity from us to the customer; it never removes it.
 *
 * So a white-label account that has not set a brandName still gets `genxqr`.
 * That is a visible, fixable prompt to finish the setup, whereas an anonymous
 * credential prompt is a Safe Browsing flag on the whole domain.
 */
export interface ResolvedBranding {
  mode: "genxqr" | "custom"
  name: string | null
  logoUrl: string | null
  /**
   * The owner's logo for the TOP of the scan landing page — any paid plan
   * (scanPageLogo), independent of `mode`: a Starter account shows its logo
   * there while the page is still attributed to GenXQR in the footer.
   */
  pageLogoUrl: string | null
}

export const GENXQR_BRANDING: ResolvedBranding = { mode: "genxqr", name: null, logoUrl: null, pageLogoUrl: null }

/**
 * Resolves branding for a QR code's owner, for public pages.
 *
 * Read-only and never throws — a branding lookup must not be able to take down
 * a scan. Uses getPlanLimitsReadOnly because this runs on unauthenticated
 * endpoints: getUserPlanLimits would let an anonymous visitor drive subscription
 * writes for the owner by loading the page repeatedly.
 */
export async function resolveBrandingForUser(
  userId: string | null | undefined,
): Promise<ResolvedBranding> {
  if (!userId) return GENXQR_BRANDING

  try {
    const [user, limits] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { brandName: true, brandLogoUrl: true },
      }),
      getPlanLimitsReadOnly(userId),
    ])

    if (!user) return GENXQR_BRANDING
    const pageLogoUrl = (limits.scanPageLogo || limits.whiteLabel) ? user.brandLogoUrl : null

    // A logo alone is not an identity — a nameless image could be anyone's — so
    // without white-label AND a brand name the page stays attributed to GenXQR.
    if (!limits.whiteLabel || !user.brandName) return { ...GENXQR_BRANDING, pageLogoUrl }

    return { mode: "custom", name: user.brandName, logoUrl: user.brandLogoUrl, pageLogoUrl }
  } catch {
    return GENXQR_BRANDING
  }
}

/** Resolves branding from a QR slug, for the public scan-facing pages. */
export async function resolveBrandingForSlug(slug: string): Promise<ResolvedBranding> {
  try {
    const qr = await prisma.qRCode.findUnique({ where: { slug }, select: { userId: true } })
    // An unknown slug gets GenXQR branding rather than a 404: the expired and
    // password pages render for slugs that may be inactive or bogus, and they
    // still need something to show.
    return await resolveBrandingForUser(qr?.userId)
  } catch {
    return GENXQR_BRANDING
  }
}
