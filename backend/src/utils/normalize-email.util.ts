/**
 * Reduces an email address to the inbox it actually reaches.
 *
 * Used for ONE purpose: deciding whether a person has already had a free trial.
 * `parth+1@gmail.com`, `parth+2@gmail.com` and `p.a.r.t.h@gmail.com` are all the
 * same mailbox, so without this a single person can mint unlimited 14-day PRO
 * trials by signing up again.
 *
 * What this deliberately does NOT do:
 *
 *  - It does not block or reject signups. Plus-addressing is a legitimate,
 *    widely-used filing technique; refusing it would cost real customers to stop
 *    an abuse that is, on this product, largely self-limiting (a lapsed trial
 *    drops the account to FREE, where dynamicQRLimit is 0, and a dynamic QR's
 *    URL belongs to the account that made it — so a farmer's printed codes die
 *    every fortnight).
 *  - It does not replace the stored address. Users log in and receive mail at
 *    exactly what they typed; this is a separate, secondary value.
 *
 * Provider rules are applied only where they are documented behaviour. Gmail
 * ignores dots in the local part; most providers do not, and stripping them
 * generally would merge genuinely distinct people onto one trial.
 */

/** Providers that route all Gmail infrastructure and therefore ignore dots. */
const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"])

/** Providers documented to support `+tag` sub-addressing. */
const PLUS_ADDRESSING_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "protonmail.com",
  "proton.me",
  "icloud.com",
  "me.com",
  "fastmail.com",
  "zoho.com",
  "yandex.com",
])

/**
 * Returns the canonical form of an address, or null if it is not parseable as
 * one. A null result means "cannot judge" — callers should treat that as
 * *eligible* rather than silently denying a trial on a malformed input.
 */
export function normalizeEmail(email: string): string | null {
  const trimmed = email.trim().toLowerCase()
  if (!trimmed) return null

  const at = trimmed.lastIndexOf("@")
  // Reject anything without exactly one usable split point: no @, leading @, or
  // trailing @ all mean this is not an address we can reason about.
  if (at <= 0 || at === trimmed.length - 1) return null

  let local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1)
  if (!domain.includes(".")) return null

  if (PLUS_ADDRESSING_DOMAINS.has(domain)) {
    const plus = local.indexOf("+")
    if (plus !== -1) local = local.slice(0, plus)
  }

  if (GMAIL_DOMAINS.has(domain)) {
    local = local.replaceAll(".", "")
  }

  // Stripping can leave nothing behind (e.g. "+tag@gmail.com"). An empty local
  // part is not a real mailbox, so refuse to judge rather than collapsing every
  // such address onto one another.
  if (!local) return null

  // googlemail.com and gmail.com are the same mailbox.
  const canonicalDomain = GMAIL_DOMAINS.has(domain) ? "gmail.com" : domain

  return `${local}@${canonicalDomain}`
}
