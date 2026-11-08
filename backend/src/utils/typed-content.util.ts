import { AppError } from "../middleware/error.middleware.js"

/**
 * Content rules for the QR types whose content has a fixed meaning: UPI,
 * GOOGLE_REVIEW, EVENT and FORM. Every other type's content is free-form JSON (qr.service).
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

/** An event's wall-clock time in its own time zone, as the editor sends it: "2026-11-20T19:00". */
export const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** A field on a FORM code's form. */
export const FORM_FIELD_TYPES = ["text", "email", "phone", "textarea", "rating", "select"] as const
export type FormField = { id: string; label: string; type: (typeof FORM_FIELD_TYPES)[number]; required: boolean; options?: string[] }
const FIELD_ID = /^[a-z0-9_]{1,30}$/
const httpsUrl = (v: string): boolean => {
  try { return new URL(v).protocol === "https:" } catch { return false }
}

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

  if (type === "EVENT") {
    const title = str(data.title, 150)
    if (!title) throw new AppError(422, "Give the event a name.")
    const start = str(data.start, 16)
    if (!LOCAL_DATETIME.test(start) || Number.isNaN(Date.parse(`${start}:00Z`))) throw new AppError(422, "Choose when the event starts.")
    const end = str(data.end, 16)
    if (end && (!LOCAL_DATETIME.test(end) || Number.isNaN(Date.parse(`${end}:00Z`)) || end < start)) {
      throw new AppError(422, "The end must be after the start.")
    }
    const timeZone = str(data.timeZone, 64) || "Asia/Kolkata"
    if (!isTimeZone(timeZone)) throw new AppError(422, "Unknown time zone.")
    const rawLink = str(data.link, 2000)
    if (rawLink && !httpsUrl(rawLink)) throw new AppError(422, "The ticket or registration link must start with https://.")
    // Stored as the parser writes it: no raw line breaks (it goes into a calendar file).
    const link = rawLink ? new URL(rawLink).toString() : ""
    const venue = str(data.venue, 150)
    const address = str(data.address, 300)
    const description = str(data.description, 2000)
    const organizer = str(data.organizer, 100)
    return {
      title, start, timeZone,
      ...(end && { end }), ...(venue && { venue }), ...(address && { address }),
      ...(description && { description }), ...(organizer && { organizer }), ...(link && { link }),
    }
  }

  if (type === "FORM") {
    const title = str(data.title, 150)
    if (!title) throw new AppError(422, "Give the form a title.")
    const raw = Array.isArray(data.fields) ? data.fields : []
    if (raw.length === 0 || raw.length > 15) throw new AppError(422, "A form needs between 1 and 15 questions.")
    const seen = new Set<string>()
    const fields: FormField[] = raw.map((f, i) => {
      const o = (f && typeof f === "object" ? f : {}) as Record<string, unknown>
      const id = str(o.id, 30) || `q${i + 1}`
      const label = str(o.label, 100)
      const fieldType = FORM_FIELD_TYPES.find((t) => t === o.type)
      if (!FIELD_ID.test(id) || seen.has(id)) throw new AppError(422, `Question ${i + 1} has an invalid or repeated id.`)
      if (!label) throw new AppError(422, `Question ${i + 1} needs a label.`)
      if (!fieldType) throw new AppError(422, `Question ${i + 1} has an unknown type.`)
      seen.add(id)
      const field: FormField = { id, label, type: fieldType, required: o.required === true }
      if (fieldType === "select") {
        const options = (Array.isArray(o.options) ? o.options : []).map((x) => str(x, 100)).filter(Boolean)
        if (options.length < 2 || options.length > 20) throw new AppError(422, `"${label}" needs 2 to 20 choices.`)
        field.options = [...new Set(options)]
      }
      return field
    })
    const intro = str(data.intro, 1000)
    const submitLabel = str(data.submitLabel, 40)
    const thankYou = str(data.thankYou, 300)
    return {
      title, fields, notify: data.notify === true,
      ...(intro && { intro }), ...(submitLabel && { submitLabel }), ...(thankYou && { thankYou }),
    }
  }

  return data
}
