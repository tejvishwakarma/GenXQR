import { z } from "zod"

/**
 * A destination URL a scanner's browser will be navigated to.
 *
 * Pentest finding #3: the routing fields (fallbackUrl, smart-route targetUrl,
 * A/B variant targetUrl) were validated with `z.string().url()`, which uses the
 * WHATWG URL parser and therefore ACCEPTS `javascript:` and `data:` — they are
 * syntactically valid URLs. Those values are handed back to the frontend, which
 * assigns them to `window.location.href`. The ordinary /r/:slug redirect path
 * already guards the scheme; the password-unlock JSON path did not, so a
 * malicious QR owner could store a `javascript:` destination that runs in the
 * genxqr.com origin once a scanner submitted the password.
 *
 * This is the single boundary that both the write paths and the read paths use,
 * so http(s)-only is enforced identically everywhere — the root cause was the
 * scheme rule being applied in some flows and not others.
 */

/** True only for an absolute http:// or https:// URL. Everything else is unsafe. */
export function isSafeHttpUrl(value: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return false
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:"
}

/**
 * Zod schema for a stored destination URL: absolute, http(s) only, length-capped.
 * Replaces `z.string().url()` at every routing-field write point.
 */
export const safeHttpUrlSchema = z
  .string()
  .max(2048)
  .refine(isSafeHttpUrl, "URL must be an absolute http:// or https:// address")

/**
 * Last-line guard applied to a resolved destination immediately before it is
 * returned for navigation (the password-unlock path). Returns the URL if safe,
 * otherwise null so the caller can fall back rather than emit a dangerous scheme
 * — this also neutralises any legacy row written before safeHttpUrlSchema existed.
 */
export function safeRedirectTarget(value: string | null | undefined): string | null {
  return value && isSafeHttpUrl(value) ? value : null
}
