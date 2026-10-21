/**
 * Referral links: `genxqr.com/<any page>?ref=CODE` (usually /signup?ref=CODE).
 *
 * The code is kept for 60 days and sent at sign-up — in the register body, or
 * on the Google sign-in URL. The server attaches it only when the account is
 * NEW, checks the code exists and is not the visitor's own (referral.service
 * attachReferralAtSignup), and ignores it otherwise. The latest link wins.
 */
import { readStoredValue } from "@/lib/utils"

const STORAGE_KEY = "gx_referral"
const MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000
/** Codes are 8 characters today; allow room without accepting junk. */
const CODE_PATTERN = /^[A-Za-z0-9]{4,20}$/

/** Call once per page load: remembers ?ref=CODE if present. Safe during SSR. */
export function captureReferralLink(): void {
  if (typeof window === "undefined") return
  const code = new URLSearchParams(window.location.search).get("ref")?.trim()
  if (!code || !CODE_PATTERN.test(code)) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ code: code.toUpperCase(), at: new Date().toISOString() }))
  } catch {
    // Storage blocked: the referral simply is not recorded.
  }
}

/** The remembered code, or null. */
export function getPendingReferral(): string | null {
  if (typeof window === "undefined") return null
  const raw = readStoredValue(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { code?: string; at?: string }
    const age = Date.now() - new Date(parsed.at ?? "").getTime()
    return parsed.code && Number.isFinite(age) && age >= 0 && age <= MAX_AGE_MS ? parsed.code : null
  } catch {
    return null
  }
}

/** Forget it once an account has been created with it. */
export function clearPendingReferral(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to clear.
  }
}

/** Query-string fragment for /api/auth/google, or "" when nothing is stored. */
export function referralQueryParam(): string {
  const code = getPendingReferral()
  return code ? `&ref=${encodeURIComponent(code)}` : ""
}

/** A user's shareable link. */
export function referralLink(code: string, origin = "https://genxqr.com"): string {
  return `${origin}/signup?ref=${encodeURIComponent(code)}`
}
