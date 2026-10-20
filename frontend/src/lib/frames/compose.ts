/**
 * Puts a live QR code into a library frame and exports the result.
 *
 * The frames (public/frames, catalogued by scripts/import-qr-frames.mjs) mark
 * where the code goes with <g id="qr-slot" data-x data-y data-size>: its first
 * child is the light panel, everything after it a placeholder code. We keep the
 * panel, drop the placeholder and nest the customer's qr-code-styling SVG in
 * the square with a three-module quiet zone.
 *
 * The same composed SVG feeds the dashboard preview (as an <img>, which also
 * keeps each frame's embedded @font-face rules from leaking into the page) and
 * every download, so what is previewed is what prints.
 */
import QRCodeStyling, { type Options as QRStylingOptions } from "qr-code-styling"
import { FRAME_CATALOG, FRAME_TOKEN_COLOR, FRAME_TOKEN_TEXT } from "./catalog"
import { FRAME_FONTS } from "./fonts"
import type { FrameEntry, FrameField, FrameFieldId } from "./types"

export type FrameFields = Partial<Record<FrameFieldId, string>>

const SVG_NS = "http://www.w3.org/2000/svg"
const BY_ID = new Map(FRAME_CATALOG.map((f) => [f.id, f]))

export function getFrame(id: string | null | undefined): FrameEntry | undefined {
  return id ? BY_ID.get(id) : undefined
}

function slugOf(entry: FrameEntry) {
  return entry.id.slice(entry.group.length + 1)
}

export function frameFileUrl(entry: FrameEntry) {
  return `/frames/${entry.group}/${slugOf(entry)}.svg`
}

export function frameThumbUrl(entry: FrameEntry) {
  return `/frames/thumbs/${entry.group}/${slugOf(entry)}.svg`
}

// ─── Colour ───────────────────────────────────────────────────────────────────

/** "#abc" / "#AABBCC" → "#AABBCC"; anything else → null. */
export function normaliseHex(value: string | null | undefined): string | null {
  const m = value?.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) return null
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1]
  return `#${h.toUpperCase()}`
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** White or near-black label text, whichever reads better (same rule as the importer). */
export function labelColorFor(frameColor: string) {
  return contrast(frameColor, "#FFFFFF") >= contrast(frameColor, "#14131A") ? "#FFFFFF" : "#14131A"
}

/**
 * Dots must be at least this much darker than the panel inside a frame.
 *
 * Measured, not assumed (20 Oct 2026): every frame rendered at 240/600/1200 px
 * and decoded with ZXing. The default violet #7C3AED (5.6:1 on white) failed
 * at some size on 4 of 6 premium frames — dark artwork beside the panel skews
 * the scanner's local threshold — while #5B21B6 (8.5:1) and darker decoded on
 * all premium and occasion frames. Plain codes on white are unaffected.
 */
export const MIN_FRAME_DOT_CONTRAST = 7

export function dotContrast(dot: string, panel = "#FFFFFF") {
  const d = normaliseHex(dot)
  const p = normaliseHex(panel) ?? "#FFFFFF"
  return d ? contrast(d, p) : 21
}

/** The same hue, darkened until it clears MIN_FRAME_DOT_CONTRAST with some margin. */
export function darkenForFrame(dot: string, panel = "#FFFFFF") {
  let hex = normaliseHex(dot) ?? "#111111"
  for (let i = 0; i < 40 && dotContrast(hex, panel) < MIN_FRAME_DOT_CONTRAST + 1.5; i++) {
    const [r, g, b] = [1, 3, 5].map((k) => Math.round(parseInt(hex.slice(k, k + 2), 16) * 0.92))
    hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`
  }
  return hex
}

/** The colour a shape is drawn in: the saved one if valid, else its default. */
export function shapeColor(entry: FrameEntry, saved: string | null | undefined) {
  return normaliseHex(saved) ?? entry.defaultColor ?? FRAME_TOKEN_COLOR
}

// ─── Fonts ────────────────────────────────────────────────────────────────────

const fontDataCache = new Map<string, Promise<string>>()

function fontDataUrl(file: string) {
  let p = fontDataCache.get(file)
  if (!p) {
    p = fetch(`/frames/fonts/${file}`)
      .then((r) => {
        if (!r.ok) throw new Error(`font ${file}: ${r.status}`)
        return r.blob()
      })
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const fr = new FileReader()
            fr.onload = () => resolve(String(fr.result).replace(/^data:[^;]*;/, "data:font/woff2;"))
            fr.onerror = () => reject(fr.error)
            fr.readAsDataURL(blob)
          }),
      )
    p.catch(() => fontDataCache.delete(file))
    fontDataCache.set(file, p)
  }
  return p
}

function fontsFor(entry: FrameEntry) {
  return FRAME_FONTS.filter((f) => entry.fonts.some((u) => u.family === f.family && u.italic === f.italic))
}

/**
 * @font-face rules for the full fonts. Declared AFTER the frame's own subset
 * rules with identical family/style/weight descriptors, so for any character
 * in their unicode-range they take precedence; anything outside (e.g.
 * Devanagari, which these typefaces do not have) falls back as before.
 */
async function fullFontCss(entry: FrameEntry) {
  const rules = await Promise.all(
    fontsFor(entry).map(async (f) => {
      const url = await fontDataUrl(f.file)
      return `@font-face{font-family:'${f.family}';font-style:${f.italic ? "italic" : "normal"};font-weight:100 900;src:url(${url}) format('woff2');unicode-range:${f.unicodeRange};}`
    }),
  )
  return rules.join("")
}

/** Page-level copies under alias names, used only to measure text. */
const measureFonts = new Map<string, Promise<void>>()

function aliasOf(family: string, italic: boolean) {
  return `gxframe-${family.replace(/\s+/g, "-").toLowerCase()}${italic ? "-i" : ""}`
}

function loadMeasureFont(family: string, italic: boolean) {
  const key = aliasOf(family, italic)
  let p = measureFonts.get(key)
  if (!p) {
    const faces = FRAME_FONTS.filter((f) => f.family === family && f.italic === italic)
    p = Promise.all(
      faces.map(async (f) => {
        const face = new FontFace(key, `url(/frames/fonts/${f.file})`, {
          style: italic ? "italic" : "normal",
          weight: "100 900",
          unicodeRange: f.unicodeRange,
        })
        document.fonts.add(await face.load())
      }),
    ).then(() => undefined)
    p.catch(() => measureFonts.delete(key))
    measureFonts.set(key, p)
  }
  return p
}

let measureCtx: CanvasRenderingContext2D | null = null

/** Rendered width of `text` in the field's font, in frame units. */
async function textWidth(field: FrameField, text: string) {
  await loadMeasureFont(field.family, field.italic)
  measureCtx ??= document.createElement("canvas").getContext("2d")
  const ctx = measureCtx!
  ctx.font = `${field.italic ? "italic " : ""}${field.weight} ${field.size}px "${aliasOf(field.family, field.italic)}"`
  // letter-spacing is added after every glyph, the last included.
  return ctx.measureText(text).width + field.letterSpacing * [...text].length
}

// ─── Room for text ────────────────────────────────────────────────────────────

const DRAWN = "rect,circle,ellipse,line,polyline,polygon,path,use"
const NOT_DRAWN = "defs,clipPath,mask,pattern,symbol,filter,linearGradient,radialGradient,marker"
const roomCache = new Map<string, Promise<Partial<Record<FrameFieldId, number>>>>()

/**
 * How wide each straight text field may get before it runs into the frame's
 * decoration (the rules beside "— SCAN ME —", the arrow after "Scan me!") or
 * out of the shape it sits in. Measured from the frame's own geometry: the SVG
 * is laid out invisibly (fonts stripped — only shapes are measured), and for
 * each field we take the innermost shape containing its anchor point and the
 * nearest shapes either side within its line height.
 */
function textRoom(entry: FrameEntry, raw: string) {
  let p = roomCache.get(entry.id)
  if (!p) {
    p = Promise.resolve().then(() => {
      const host = document.createElement("div")
      host.style.cssText = "position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none"
      host.innerHTML = raw.replace(/<style>[\s\S]*?<\/style>/g, "")
      document.body.appendChild(host)
      try {
        const svg = host.querySelector("svg")!
        svg.setAttribute("width", String(entry.width))
        svg.setAttribute("height", String(entry.height))
        const boxes = Array.from(svg.querySelectorAll<SVGGraphicsElement>(DRAWN))
          .filter((el) => !el.closest(NOT_DRAWN) && !el.closest('[id="qr-slot"]'))
          .map((el) => {
            const b = el.getBBox()
            const m = el.getCTM()
            const pts = [
              [b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height],
            ].map(([x, y]) => (m ? [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f] : [x, y]))
            return {
              left: Math.min(...pts.map((q) => q[0])),
              right: Math.max(...pts.map((q) => q[0])),
              top: Math.min(...pts.map((q) => q[1])),
              bottom: Math.max(...pts.map((q) => q[1])),
            }
          })
          .filter((b) => b.right - b.left > 0.5 || b.bottom - b.top > 0.5)

        const room: Partial<Record<FrameFieldId, number>> = {}
        for (const field of entry.fields) {
          if (field.onPath) continue
          const el = svg.querySelector(`[id="${field.id}"]`)
          if (!el) continue
          const x = Number(el.getAttribute("x") ?? 0)
          const baseline = Number(el.getAttribute("y") ?? 0)
          const anchor = el.getAttribute("text-anchor") ?? "start"
          const top = baseline - field.size * 0.8
          const bottom = baseline + field.size * 0.25
          const pad = field.size * 0.4
          const midY = baseline - field.size * 0.35
          const inBand = boxes.filter((b) => b.bottom > top && b.top < bottom)
          const contains = (b: (typeof boxes)[number]) => b.left <= x && x <= b.right && b.top <= midY && midY <= b.bottom
          // Bounds: the innermost containing shape, else the artboard.
          let lo = 0
          let hi = entry.width
          for (const b of boxes.filter(contains)) {
            lo = Math.max(lo, b.left)
            hi = Math.min(hi, b.right)
          }
          // Obstacles: shapes on the text's line that do not contain its anchor.
          for (const b of inBand.filter((b) => !contains(b))) {
            if (b.right <= x) lo = Math.max(lo, b.right)
            else if (b.left >= x) hi = Math.min(hi, b.left)
          }
          lo += pad
          hi -= pad
          room[field.id] =
            anchor === "middle" ? 2 * Math.min(x - lo, hi - x) : anchor === "end" ? x - lo : hi - x
        }
        return room
      } finally {
        host.remove()
      }
    })
    p.catch(() => roomCache.delete(entry.id))
    roomCache.set(entry.id, p)
  }
  return p
}

// ─── Composition ──────────────────────────────────────────────────────────────

const svgCache = new Map<string, Promise<string>>()

function fetchFrameSvg(entry: FrameEntry) {
  const url = frameFileUrl(entry)
  let p = svgCache.get(url)
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`frame ${entry.id}: ${r.status}`)
      return r.text()
    })
    p.catch(() => svgCache.delete(url))
    svgCache.set(url, p)
  }
  return p
}

export interface ComposeOptions {
  entry: FrameEntry
  /** The code's design: data, dots, corners, logo… Size, margin, type and background are set here. */
  qr: Partial<QRStylingOptions>
  /** Shapes only; ignored for premium/occasion artwork. */
  color?: string | null
  fields?: FrameFields | null
  /**
   * The code's background colour. The frame's own panel colour is kept unless
   * this is set to something other than white — premium panels are cream or
   * ivory by design, and a default white would flatten them.
   */
  background?: string | null
}

/** Values that differ from the frame's sample text, trimmed. */
export function editedFields(entry: FrameEntry, fields: FrameFields | null | undefined): FrameFields {
  const out: FrameFields = {}
  for (const f of entry.fields) {
    const v = fields?.[f.id]?.trim()
    if (v && v !== f.default) out[f.id] = v
  }
  return out
}

/** Maximum characters per field; generous, but stops runaway text in print. */
export function fieldMaxLength(field: FrameField) {
  if (field.onPath) return Math.max(field.default.length + 6, 12)
  return Math.min(Math.max(field.default.length * 2, 18), 48)
}

/** Light margin around the code, in modules (ISO/IEC 18004 asks for four). */
export let QUIET_MODULES = 4
/** Test hook for the frame scan check. */
export function setQuietModules(n: number) {
  QUIET_MODULES = n
}

export async function composeFrameSvg(opts: ComposeOptions): Promise<string> {
  const { entry } = opts
  let raw = await fetchFrameSvg(entry)

  if (entry.group === "shape") {
    const color = shapeColor(entry, opts.color)
    raw = raw.split(FRAME_TOKEN_COLOR).join(color).split(FRAME_TOKEN_TEXT).join(labelColorFor(color))
  }

  const doc = new DOMParser().parseFromString(raw, "image/svg+xml")
  if (doc.querySelector("parsererror")) throw new Error(`frame ${entry.id}: unparseable SVG`)
  const root = doc.documentElement

  // ── Text ──
  const edited = editedFields(entry, opts.fields)
  const room = Object.keys(edited).length > 0 ? await textRoom(entry, raw) : {}
  for (const field of entry.fields) {
    const value = edited[field.id]
    if (!value) continue
    const el = root.querySelector(`[id="${field.id}"]`)
    if (!el) continue
    el.textContent = value
    if (field.onPath) continue
    // Longer than the room it has (see textRoom): squeeze rather than overrun.
    // Never below the sample text's own width, which the design was made for.
    const [want, sample] = await Promise.all([textWidth(field, value), textWidth(field, field.default)])
    const limit = Math.max(sample, room[field.id] ?? sample)
    if (want > limit) {
      el.setAttribute("textLength", String(Math.round(limit)))
      el.setAttribute("lengthAdjust", "spacingAndGlyphs")
    }
  }
  if (Object.keys(edited).length > 0) {
    const style = doc.createElementNS(SVG_NS, "style")
    style.textContent = await fullFontCss(entry)
    const defs = root.querySelector("defs") ?? root.insertBefore(doc.createElementNS(SVG_NS, "defs"), root.firstChild)
    defs.appendChild(style)
  }

  // ── Code ──
  const slotEl = root.querySelector('[id="qr-slot"]')
  const panel = slotEl?.firstElementChild
  if (!slotEl || !panel) throw new Error(`frame ${entry.id}: no qr-slot panel`)
  while (panel.nextSibling) slotEl.removeChild(panel.nextSibling)
  const bg = normaliseHex(opts.background)
  if (bg && bg !== "#FFFFFF") panel.setAttribute("fill", bg)

  const RENDER = 1000 // qr-code-styling's coordinate space; scaled by the nested viewBox
  const inst = new QRCodeStyling({
    ...opts.qr,
    width: RENDER,
    height: RENDER,
    margin: 0,
    type: "svg",
    backgroundOptions: { color: "transparent" },
  })
  const blob = (await inst.getRawData("svg")) as Blob | null
  if (!blob) throw new Error("QR render failed")
  const qrDoc = new DOMParser().parseFromString(await blob.text(), "image/svg+xml")
  // Module count for the quiet zone. `_qr` is qr-code-styling's internal
  // qrcode-generator instance; if a future version hides it, fall back to a
  // version-6-sized estimate rather than failing the render.
  const modules =
    (inst as unknown as { _qr?: { getModuleCount(): number } })._qr?.getModuleCount() ?? 41
  const { x, y, size } = entry.slot
  const quiet = (size * QUIET_MODULES) / (modules + QUIET_MODULES * 2)
  const nested = doc.createElementNS(SVG_NS, "svg")
  nested.setAttribute("x", String(x + quiet))
  nested.setAttribute("y", String(y + quiet))
  nested.setAttribute("width", String(size - quiet * 2))
  nested.setAttribute("height", String(size - quiet * 2))
  nested.setAttribute("viewBox", `0 0 ${RENDER} ${RENDER}`)
  for (const child of Array.from(qrDoc.documentElement.childNodes)) {
    nested.appendChild(doc.importNode(child, true))
  }
  slotEl.appendChild(nested)

  return new XMLSerializer().serializeToString(doc)
}

// ─── Export ───────────────────────────────────────────────────────────────────

function svgBlob(svg: string) {
  return new Blob([svg], { type: "image/svg+xml;charset=utf-8" })
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("could not render the framed code"))
    img.src = src
  })
}

/** Rasterise a composed frame at `width` px (height follows the frame's ratio). */
export async function rasterise(svg: string, entry: FrameEntry, width: number, opaque: boolean) {
  const url = URL.createObjectURL(svgBlob(svg))
  try {
    const img = await loadImage(url)
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = Math.round((width * entry.height) / entry.width)
    const ctx = canvas.getContext("2d")!
    if (opaque) {
      // JPEG has no alpha; shapes are drawn on transparency.
      ctx.fillStyle = "#FFFFFF"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

export type FrameDownloadExt = "png" | "jpeg" | "webp" | "svg" | "pdf"

/** Pixel width of raster downloads: 3× the artwork, crisp at A6 and beyond. */
const RASTER_WIDTH_FACTOR = 3
/** PDF page width: 105 mm (A6), raster at ~600 dpi. */
const PDF_WIDTH_MM = 105
const PDF_RASTER_WIDTH = 2480

/** The composed frame as a file in `ext`. */
export async function renderFramed(opts: ComposeOptions, ext: FrameDownloadExt): Promise<Blob> {
  const svg = await composeFrameSvg(opts)
  const { entry } = opts

  if (ext === "svg") return svgBlob(svg)

  if (ext === "pdf") {
    // A high-resolution image of the artwork, not vectors: svg2pdf (used for
    // the classic frames) cannot use fonts embedded in an SVG, and these
    // frames depend on theirs. SVG is the vector download.
    const { default: jsPDF } = await import("jspdf")
    const canvas = await rasterise(svg, entry, PDF_RASTER_WIDTH, true)
    const w = PDF_WIDTH_MM
    const h = (w * entry.height) / entry.width
    const pdf = new jsPDF({ orientation: w > h ? "landscape" : "portrait", unit: "mm", format: [w, h] })
    // JPEG at high quality: a lossless PNG of the premium artwork's texture made
    // a 26 MB PDF; this is a few MB with no visible difference in print.
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, w, h)
    return pdf.output("blob")
  }

  const canvas = await rasterise(svg, entry, entry.width * RASTER_WIDTH_FACTOR, ext === "jpeg")
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, `image/${ext}`, 0.95))
  if (!blob) throw new Error("could not encode the image")
  return blob
}
