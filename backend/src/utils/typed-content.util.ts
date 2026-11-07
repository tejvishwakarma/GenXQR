import { AppError } from "../middleware/error.middleware.js"

/**
 * Content rules for the QR types whose content has a fixed meaning: UPI and
 * GOOGLE_REVIEW. Every other type's content is free-form JSON (qr.service).
 * Checked on create and update, so the dashboard, /v1 and duplicates all agree.
 */

/** A UPI ID (VPA): handle@bank, e.g. shop.name@okhdfcbank or 9876543210@ybl. */
const VPA = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,255}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/
/** A Google Place ID (ChIJ…); also the id in a writereview?placeid= link. */
const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/

/** Hosts a Google review link may be on: Business Profile short links, Maps and Search. */
export function isGoogleReviewHost(host: string): boolean {
  const h = host.toLowerCase()
  return h === "g.page" || h === "g.co" || h === "goo.gl" || h === "maps.app.goo.gl"
    || /^((www|search|maps)\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(h)
}

/** Where a GOOGLE_REVIEW code sends the scanner, or null if its content has neither form. */
export function googleReviewUrl(content: Record<string, unknown>): string | null {
  if (typeof content.reviewUrl === "string" && content.reviewUrl) return content.reviewUrl
  if (typeof content.placeId === "string" && PLACE_ID.test(content.placeId)) {
    return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(content.placeId)}`
  }
  return null
}

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "")

/**
 * Validates and normalises the content of a UPI or GOOGLE_REVIEW code (throws 422).
 * Other types come back unchanged.
 */
export function normalizeTypedContent(type: string, data: Record<string, unknown>): Record<string, unknown> {
  if (type === "UPI") {
    const upiId = str(data.upiId, 320).toLowerCase()
    if (!VPA.test(upiId)) throw new AppError(422, "Enter a valid UPI ID, like yourname@okhdfcbank.")
    const payeeName = str(data.payeeName, 100)
    if (!payeeName) throw new AppError(422, "Enter the name payments go to.")
    let amount: string | undefined
    const rawAmount = data.amount === undefined || data.amount === null ? "" : String(data.amount).trim()
    if (rawAmount) {
      const n = Number(rawAmount)
      if (!/^\d{1,6}(\.\d{1,2})?$/.test(rawAmount) || n <= 0 || n > 500000) {
        throw new AppError(422, "The amount must be between ₹0.01 and ₹5,00,000, with at most 2 decimals.")
      }
      amount = n.toFixed(2)
    }
    const note = str(data.note, 50)
    return { upiId, payeeName, ...(amount && { amount }), ...(note && { note }) }
  }

  if (type === "GOOGLE_REVIEW") {
    const businessName = str(data.businessName, 100)
    const placeId = str(data.placeId, 300)
    const rawUrl = str(data.reviewUrl, 2000)
    if (rawUrl) {
      let url: URL
      try { url = new URL(rawUrl) } catch { throw new AppError(422, "The review link isn't a valid web address.") }
      if (url.protocol !== "https:" || !isGoogleReviewHost(url.hostname)) {
        throw new AppError(422, "Use the review link from your Google Business Profile (g.page or google.com), or your Place ID.")
      }
      return { reviewUrl: url.toString(), ...(businessName && { businessName }) }
    }
    if (!PLACE_ID.test(placeId)) {
      throw new AppError(422, "Enter your Google review link or your Place ID.")
    }
    return { placeId, ...(businessName && { businessName }) }
  }

  return data
}
