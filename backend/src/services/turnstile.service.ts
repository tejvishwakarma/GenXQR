import { env } from "../config/env.js"
import { AppError } from "../middleware/error.middleware.js"
import { logger } from "../logger/index.js"

/**
 * Cloudflare Turnstile verification (added 25 Oct 2026 after the external
 * assessment: register/login/contact had no bot challenge, so signup and the
 * verification/contact emails could be driven in volume).
 *
 * Optional, like Google OAuth and GA: with no TURNSTILE_SECRET_KEY the checks
 * are skipped, so dev, tests, and production-before-the-key-is-set all keep
 * working. The frontend widget is likewise gated on VITE_TURNSTILE_SITE_KEY,
 * so the two are enabled together.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

export function turnstileEnabled(): boolean {
  return Boolean(env.TURNSTILE_SECRET_KEY)
}

interface SiteverifyResponse {
  success: boolean
  "error-codes"?: string[]
}

/**
 * Verifies a Turnstile token. No-op when unconfigured.
 *
 * Fails CLOSED on a token that is missing or that Cloudflare rejects (that is
 * the bot case). Fails OPEN only when Cloudflare's siteverify is unreachable or
 * errors — an outage there must not lock every customer out of signing in, and
 * login still needs the correct password behind this. Throws AppError(403) on a
 * definitive rejection so error.middleware renders the standard shape.
 */
export async function verifyTurnstileToken(token: string | undefined | null, remoteIp?: string): Promise<void> {
  if (!turnstileEnabled()) return
  if (!token || typeof token !== "string") {
    throw new AppError(403, "Please complete the human-verification challenge and try again.")
  }

  let data: SiteverifyResponse
  try {
    const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY!, response: token })
    if (remoteIp) body.set("remoteip", remoteIp)
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) throw new Error(`siteverify HTTP ${res.status}`)
    data = (await res.json()) as SiteverifyResponse
  } catch (err) {
    // Cloudflare unreachable / timeout / bad gateway → fail open, but loudly.
    logger.warn("Turnstile verification could not be completed — allowing through", {
      error: err instanceof Error ? err.message : String(err),
    })
    return
  }

  if (!data.success) {
    // A definitive rejection (bad, expired or reused token) — this is the bot path.
    logger.info("Turnstile challenge failed", { errorCodes: data["error-codes"] ?? [] })
    throw new AppError(403, "Human-verification challenge failed. Please try again.")
  }
}
