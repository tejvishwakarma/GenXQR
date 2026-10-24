import { createHash } from "node:crypto"
import { normalizeEmail } from "./normalize-email.util.js"

/**
 * A person's inbox as a one-way hash: normalizeEmail folds aliases and Gmail
 * dots, then SHA-256 so a record can outlive the account (erasure) without
 * keeping the address itself. Used where "same person" must survive deleting
 * and re-creating an account: referrals (Referral.refereeEmailHash) and free
 * trials (TrialUsage).
 */
export function inboxHash(email: string): string {
  const key = normalizeEmail(email) ?? email.trim().toLowerCase()
  return createHash("sha256").update(key).digest("hex")
}
