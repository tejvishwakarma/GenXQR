/**
 * Coupon links: `genxqr.com/<any page>?coupon=CODE`.
 *
 * A visitor arriving with a code keeps it (30 days) through browsing and
 * sign-up, and checkout on the Billing page applies it automatically. It is
 * only a CODE — whether it applies, and what it is worth, is decided by the
 * server when it is priced (POST /api/billing/validate-coupon), exactly as if
 * it had been typed.
 *
 * Unlike sign-up attribution (first touch wins), the LATEST link wins: someone
 * who follows a newer campaign link expects that code.
 */
import { readStoredValue } from "@/lib/utils"

const STORAGE_KEY = "gx_coupon"
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
/** Mirrors the admin rule for codes (admin.routes CouponBodySchema: 3–40 characters). */
const MAX_LENGTH = 40

interface StoredCoupon {
  code: string
  at: string
}

/** Call once per page load: remembers ?coupon=CODE if present. Safe during SSR. */
export function captureCouponLink(): void {
  if (typeof window === "undefined") return
  const raw = new URLSearchParams(window.location.search).get("coupon")
  const code = raw?.trim().toUpperCase()
  if (!code || code.length > MAX_LENGTH || /[\u0000-\u001f]/.test(code)) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ code, at: new Date().toISOString() } satisfies StoredCoupon))
  } catch {
    // Storage blocked: the visitor can still type the code at checkout.
  }
}

/** The remembered code, or null if none (or it has expired). */
export function getPendingCoupon(): string | null {
  if (typeof window === "undefined") return null
  const raw = readStoredValue(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as StoredCoupon
    const age = Date.now() - new Date(parsed.at).getTime()
    return Number.isFinite(age) && age >= 0 && age <= MAX_AGE_MS && parsed.code ? parsed.code : null
  } catch {
    return null
  }
}

/** Forget the code — after it has been used on a purchase, or the customer removed it. */
export function clearPendingCoupon(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to clear.
  }
}

/** The shareable link for a code, as handed out by admins. */
export function couponLink(code: string, origin = "https://genxqr.com"): string {
  return `${origin}/pricing?coupon=${encodeURIComponent(code)}`
}
