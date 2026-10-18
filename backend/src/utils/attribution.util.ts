/**
 * First-touch sign-up attribution.
 *
 * The browser records the first visit's UTM tags, external referrer host and
 * landing path (frontend/src/lib/attribution.ts) and sends them at sign-up —
 * in the register body, or through the Google OAuth state for Google sign-ups.
 *
 * Everything here is client-supplied and therefore untrusted: it is bounded,
 * normalised and reduced to the fields we store. It is marketing data, never
 * used for any access decision, so the only risks are junk and oversized values.
 *
 * Attribution must NEVER block a sign-up. parseAttribution() returns null for
 * anything malformed rather than throwing.
 */
import { z } from "zod"

const MAX_ATTRIBUTION_AGE_MS = 90 * 24 * 60 * 60 * 1000 // matches the browser-side window

const tag = z
  .string()
  .trim()
  .max(200)
  .transform((v) => v.toLowerCase())
  .optional()
  .nullable()

export const attributionSchema = z.object({
  utmSource: tag,
  utmMedium: tag,
  utmCampaign: tag,
  utmContent: tag,
  utmTerm: tag,
  referrer: z.string().trim().max(255).optional().nullable(),
  landingPath: z.string().trim().max(500).optional().nullable(),
  at: z.string().max(40).optional().nullable(),
})

export type AttributionInput = z.infer<typeof attributionSchema>

/** The User columns attribution writes — all set together, once, at creation. */
export interface UserAttributionData {
  signupSource: string
  signupMedium: string | null
  signupCampaign: string | null
  signupContent: string | null
  signupTerm: string | null
  signupReferrer: string | null
  signupLandingPath: string | null
  firstTouchAt: Date | null
}

/** A bare hostname, lowercased. Rejects anything that is not one (URLs, paths, junk). */
function toHostname(value: string | null | undefined): string | null {
  if (!value) return null
  const v = value.toLowerCase()
  return /^[a-z0-9.-]{1,253}$/.test(v) && v.includes(".") ? v : null
}

/** A same-site path with no query or fragment. */
function toPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null
  return value.split(/[?#]/)[0] || null
}

/** The client's timestamp, kept only if it is a real date in the last 90 days. */
function toFirstTouchAt(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  const t = d.getTime()
  if (Number.isNaN(t)) return null
  const now = Date.now()
  if (t > now || now - t > MAX_ATTRIBUTION_AGE_MS) return null
  return d
}

const blankToNull = (v: string | null | undefined): string | null => (v ? v : null)

/**
 * Validates raw client input and maps it onto User columns.
 *
 * signupSource is derived HERE, never taken from the client as-is:
 * utm_source if tagged, else the external referrer's host, else "direct".
 * Returns null when the input is absent or malformed — stored as "not recorded",
 * which is deliberately distinct from "direct".
 */
export function parseAttribution(raw: unknown): UserAttributionData | null {
  if (raw === undefined || raw === null) return null
  const parsed = attributionSchema.safeParse(raw)
  if (!parsed.success) return null
  const a = parsed.data

  const referrer = toHostname(a.referrer)
  const utmSource = blankToNull(a.utmSource)

  return {
    signupSource: utmSource ?? referrer ?? "direct",
    signupMedium: blankToNull(a.utmMedium),
    signupCampaign: blankToNull(a.utmCampaign),
    signupContent: blankToNull(a.utmContent),
    signupTerm: blankToNull(a.utmTerm),
    signupReferrer: referrer,
    signupLandingPath: toPath(a.landingPath),
    firstTouchAt: toFirstTouchAt(a.at),
  }
}

/** Parses the JSON-encoded attribution carried on GET /api/auth/google. */
export function parseAttributionParam(param: unknown): UserAttributionData | null {
  if (typeof param !== "string" || param.length === 0 || param.length > 2000) return null
  try {
    return parseAttribution(JSON.parse(param))
  } catch {
    return null
  }
}
