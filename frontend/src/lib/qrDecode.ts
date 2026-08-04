import jsQR from "jsqr"

// ── Image decoding ─────────────────────────────────────────────────────────────

function isURL(text: string): boolean {
  try { new URL(text); return true } catch { return false }
}

/** ITU-R BT.601 luminance grayscale. Returns a new ImageData. */
function toGrayscale(src: ImageData): ImageData {
  const data = new Uint8ClampedArray(src.data)
  for (let i = 0; i < data.length; i += 4) {
    const l = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
    data[i] = l; data[i + 1] = l; data[i + 2] = l
  }
  return new ImageData(data, src.width, src.height)
}

/**
 * Otsu's method: find the optimal global threshold that maximises
 * inter-class variance between dark modules and light background.
 * Works purely on pixel values — no canvas filters, no async, no browser quirks.
 */
function otsuThreshold(grayData: Uint8ClampedArray): number {
  const hist = new Int32Array(256)
  for (let i = 0; i < grayData.length; i += 4) hist[grayData[i]]++

  const total = grayData.length / 4
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]

  let sumB = 0, wB = 0, max = 0, threshold = 128
  for (let i = 0; i < 256; i++) {
    wB += hist[i]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += i * hist[i]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) ** 2
    if (between > max) { max = between; threshold = i }
  }
  return threshold
}

/** Hard-threshold a grayscale ImageData at `t`. Returns a new ImageData. */
function applyThreshold(gray: ImageData, t: number): ImageData {
  const data = new Uint8ClampedArray(gray.data)
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i] <= t ? 0 : 255
    data[i] = v; data[i + 1] = v; data[i + 2] = v
  }
  return new ImageData(data, gray.width, gray.height)
}

/**
 * Multi-pass QR decode — handles black/white, colored, inverted, and
 * low-contrast QR codes entirely in pixel space (no canvas filters).
 *
 *  Pass 1 — raw RGBA, attemptBoth          → standard QR codes
 *  Pass 2 — luminance grayscale, attemptBoth → colored foreground/background
 *  Pass 3 — Otsu binarization, attemptBoth  → low-contrast / pastel colors
 */
export function decodeImageData(imageData: ImageData): string | null {
  const { width: w, height: h } = imageData

  const p1 = jsQR(imageData.data, w, h, { inversionAttempts: "attemptBoth" })
  if (p1?.data) return p1.data

  const gray = toGrayscale(imageData)
  const p2 = jsQR(gray.data, w, h, { inversionAttempts: "attemptBoth" })
  if (p2?.data) return p2.data

  const threshold = otsuThreshold(gray.data)
  const binary = applyThreshold(gray, threshold)
  const p3 = jsQR(binary.data, w, h, { inversionAttempts: "attemptBoth" })
  return p3?.data ?? null
}

// ── QR content parsing ──────────────────────────────────────────────────────────

export interface ParsedVCard {
  type: "vcard"
  fullName?: string
  phones: string[]
  emails: string[]
  org?: string
  title?: string
  address?: string
  url?: string
  note?: string
  raw: string
}
export interface ParsedWiFi   { type: "wifi";     ssid: string; password?: string; security: "WPA" | "WEP" | "nopass"; hidden?: boolean }
export interface ParsedURL    { type: "url";      url: string }
export interface ParsedSMS    { type: "sms";      phone: string; body?: string }
export interface ParsedTel    { type: "tel";      phone: string }
export interface ParsedEmail  { type: "email";    address: string; subject?: string; body?: string }
export interface ParsedWhatsApp { type: "whatsapp"; phone: string; message?: string; url: string }
export interface ParsedText  { type: "text";     text: string }
export type ParsedQR = ParsedVCard | ParsedWiFi | ParsedURL | ParsedSMS | ParsedTel | ParsedEmail | ParsedWhatsApp | ParsedText

function parseVCard(raw: string): ParsedVCard {
  const field = (re: RegExp) => { const m = re.exec(raw); return m ? m[1].trim() : undefined }
  const phones: string[] = []
  const emails: string[] = []
  let m: RegExpExecArray | null
  const telRe = /^TEL[^:\r\n]*:(.+)$/gm
  while ((m = telRe.exec(raw)) !== null) phones.push(m[1].trim())
  const emlRe = /^EMAIL[^:\r\n]*:(.+)$/gm
  while ((m = emlRe.exec(raw)) !== null) emails.push(m[1].trim())
  const addrM = /^ADR[^:\r\n]*:(.+)$/m.exec(raw)
  const address = addrM ? addrM[1].split(";").map(p => p.trim()).filter(Boolean).join(", ") : undefined
  return {
    type: "vcard",
    fullName: field(/^FN:(.+)$/m),
    phones, emails,
    org:   field(/^ORG:(.+)$/m),
    title: field(/^TITLE:(.+)$/m),
    address,
    url:   field(/^URL:(.+)$/im),
    note:  field(/^NOTE:(.+)$/m),
    raw,
  }
}

function parseWiFi(raw: string): ParsedWiFi {
  const get = (key: string) => {
    const m = new RegExp(`[;:]${key}:([^;]*)`, "i").exec(raw)
    return m ? m[1].trim() : undefined
  }
  const sec = (get("T") ?? "nopass").toUpperCase()
  return {
    type: "wifi",
    ssid: get("S") ?? "Unknown",
    password: get("P") || undefined,
    security: (sec === "WPA" || sec === "WEP" ? sec : "nopass") as ParsedWiFi["security"],
    hidden: get("H")?.toLowerCase() === "true",
  }
}

function parseSMS(raw: string): ParsedSMS {
  if (/^smsto:/i.test(raw)) {
    const inner = raw.replace(/^smsto:/i, "")
    const idx = inner.indexOf(":")
    return idx === -1
      ? { type: "sms", phone: inner.trim() }
      : { type: "sms", phone: inner.slice(0, idx).trim(), body: inner.slice(idx + 1).trim() }
  }
  const inner = raw.replace(/^sms:/i, "")
  const q = inner.indexOf("?")
  if (q === -1) return { type: "sms", phone: inner.trim() }
  return { type: "sms", phone: inner.slice(0, q).trim(), body: new URLSearchParams(inner.slice(q + 1)).get("body") ?? undefined }
}

function parseMailto(raw: string): ParsedEmail {
  const inner = raw.replace(/^mailto:/i, "")
  const q = inner.indexOf("?")
  if (q === -1) return { type: "email", address: inner.trim() }
  const params = new URLSearchParams(inner.slice(q + 1))
  return { type: "email", address: inner.slice(0, q).trim(), subject: params.get("subject") ?? undefined, body: params.get("body") ?? undefined }
}

export function parseQRData(text: string): ParsedQR {
  const t = text.trim()
  if (/^BEGIN:VCARD/i.test(t)) return parseVCard(t)
  if (/^WIFI:/i.test(t))        return parseWiFi(t)
  if (/^(sms:|smsto:)/i.test(t)) return parseSMS(t)
  if (/^tel:/i.test(t))          return { type: "tel", phone: t.replace(/^tel:/i, "").trim() }
  if (/^mailto:/i.test(t))       return parseMailto(t)
  if (/^https?:\/\/wa\.me\//i.test(t)) {
    try {
      const u = new URL(t)
      return { type: "whatsapp", phone: u.pathname.replace(/^\//, ""), message: u.searchParams.get("text") ?? undefined, url: t }
    } catch { /* fallthrough */ }
  }
  if (isURL(t)) return { type: "url", url: t }
  return { type: "text", text: t }
}
