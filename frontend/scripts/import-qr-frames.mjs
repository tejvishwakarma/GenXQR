/**
 * Imports the premium QR frame library into the app.
 *
 *   node scripts/import-qr-frames.mjs <path-to-premium-qr-frames>
 *
 * Reads <src>/library, <src>/premium and <src>/occasions and writes:
 *   public/frames/<group>/<id>.svg         the frame as delivered, plus ids on its
 *                                          unnamed text (see idLooseText); used for
 *                                          the live preview and every download
 *   public/frames/thumbs/<group>/<id>.svg  gallery thumbnail: embedded fonts
 *                                          stripped (~90% of each file; labels
 *                                          are a few px tall there), shapes
 *                                          pre-coloured in their default colour
 *   public/frames/licenses/                the fonts' SIL OFL texts, which the
 *                                          licence requires to travel with them
 *   src/lib/frames/catalog.ts              generated metadata (see below)
 *
 * Re-run it whenever the source pack changes; it replaces all of the above.
 *
 * Every SVG is checked before it is copied: these files are served from
 * genxqr.com and parsed in the dashboard, so anything that can execute or
 * reach the network (script, event handlers, foreignObject, external hrefs or
 * url()s, <image>) aborts the import rather than being shipped.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const src = process.argv[2]
if (!src || !fs.existsSync(src)) {
  console.error("usage: node scripts/import-qr-frames.mjs <path-to-premium-qr-frames>")
  process.exit(1)
}

/** Source folder → group id used in frame ids ("shape:coffee-cup"). */
const GROUPS = [
  { dir: "library", group: "shape" },
  { dir: "premium", group: "premium" },
  { dir: "occasions", group: "occasion" },
]

/** The pack's README sorts the 64 shapes into these; anything unlisted is "everyday". */
const SHAPE_CATEGORY = {
  objects: [
    "phone", "laptop", "smartwatch", "retro-tv", "camera", "polaroid", "film-strip", "clipboard",
    "calendar", "envelope", "receipt", "ticket", "ticket-stub", "coupon", "tag", "gift-box", "bag",
    "paper-bag", "cart", "storefront", "house", "map-pin", "cloud", "truck", "door-hanger", "wifi-card",
  ],
  food: ["coffee-cup", "cloche"],
  occasions: ["cake", "santa-hat", "crescent-star", "diya-label", "rings-top", "heart-top", "crown"],
}

/**
 * Default colours for the single-colour shapes, assigned in turn so the gallery
 * reads as colourful rather than 64 black frames (decided 20 Oct 2026). The
 * label text colour is chosen per colour for contrast (see textColorFor).
 * The QR panel itself is never recoloured — it stays light, which is what scans.
 */
export const SHAPE_PALETTE = [
  "#5B4BFF", "#0E9F8E", "#F0524F", "#F5A524", "#2E3A8C", "#E0457B",
  "#138A55", "#1D8FE0", "#7B3FA0", "#FF7A2F", "#1E1E2A",
]

/**
 * Thumbnails replace the frame's placeholder code (~16 KB of rounded-module
 * paths, most of each file) with this real but compact one: one path of
 * horizontal runs. Uses the backend's `qrcode` dependency, like
 * generate-hero-qr.mjs.
 */
const requireFromBackend = createRequire(path.resolve(FRONTEND, "../backend/package.json"))
const THUMB_QR = requireFromBackend("qrcode").create("https://genxqr.com", { errorCorrectionLevel: "L" }).modules

function thumbQrPath(slot) {
  const n = THUMB_QR.size
  const unit = slot.size / (n + 6) // three-module quiet zone each side
  const ox = slot.x + unit * 3
  const oy = slot.y + unit * 3
  const r = (v) => Math.round(v * 100) / 100
  let d = ""
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!THUMB_QR.get(y, x) || (x > 0 && THUMB_QR.get(y, x - 1))) continue
      let run = 1
      while (x + run < n && THUMB_QR.get(y, x + run)) run++
      d += `M${r(ox + x * unit)} ${r(oy + y * unit)}h${r(run * unit)}v${r(unit)}h-${r(run * unit)}z`
    }
  }
  return d
}

/** Index just past the element that starts at `start` (handles nested <g>). */
function endOfElement(svg, start) {
  const open = svg.slice(start).match(/^<([a-zA-Z]+)\b[^>]*?(\/?)>/)
  if (!open) throw new Error("endOfElement: not at a tag")
  let i = start + open[0].length
  if (open[2] === "/") return i
  const tag = open[1]
  let depth = 1
  const re = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, "g")
  re.lastIndex = i
  for (let m; (m = re.exec(svg)); ) {
    if (m[1]) depth--
    else if (!m[2]) depth++
    if (depth === 0) return re.lastIndex
  }
  throw new Error(`endOfElement: unclosed <${tag}>`)
}

/** Swap the placeholder modules (everything in qr-slot after the panel) for thumbQrPath. */
function compactPlaceholder(svg, slot) {
  const slotStart = svg.indexOf('<g id="qr-slot"')
  const slotEnd = endOfElement(svg, slotStart)
  const panelStart = svg.indexOf("<", svg.indexOf(">", slotStart) + 1)
  const panelEnd = endOfElement(svg, panelStart)
  const inner = svg.slice(panelEnd, slotEnd - "</g>".length)
  const fill = inner.match(/fill="(#[0-9a-fA-F]{3,8})"/)?.[1] ?? "#111111"
  return svg.slice(0, panelEnd) + `<path fill="${fill}" d="${thumbQrPath(slot)}"/></g>` + svg.slice(slotEnd)
}

const FRAME_TOKEN = "#1E1E2A"
const TEXT_TOKEN = "#FEFEFE"
const FIELD_IDS = ["title", "cta", "brand", "url", "date", "year", "names", "seat", "monogram", "line1", "line2", "line3"]

/**
 * The pack gives ids only to the text it expects to change; the rest is
 * sample copy that would otherwise print on every customer's code —
 * "Trattoria since 1998", "Maison de luxe", a ring reading "Terra Studio ✦
 * Est. 2026". Each such text (or its textPath) gets id line1, line2… in
 * document order so it is editable too.
 */
function idLooseText(svg) {
  let n = 0
  return svg.replace(/<text(?=\s)([^>]*)>([\s\S]*?)<\/text>/g, (whole, attrs, body) => {
    if (/\sid="/.test(attrs) || /<textPath[^>]*\sid="/.test(body)) return whole
    if (!body.replace(/<[^>]+>/g, "").trim()) return whole
    n++
    if (n > 3) throw new Error("more than 3 unnamed text elements — extend FIELD_IDS")
    if (/<textPath/.test(body)) return `<text${attrs}>${body.replace(/<textPath/, `<textPath id="line${n}"`)}</text>`
    return `<text id="line${n}"${attrs}>${body}</text>`
  })
}

/** WCAG relative luminance. */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
/** White or near-black label text, whichever reads better on the frame colour. */
function textColorFor(frame) {
  return contrast(frame, "#FFFFFF") >= contrast(frame, "#14131A") ? "#FFFFFF" : "#14131A"
}

const UNSAFE = [
  [/<script/i, "<script>"],
  [/\son[a-z]+\s*=/i, "event handler attribute"],
  [/<foreignObject/i, "<foreignObject>"],
  [/<image\b/i, "<image>"],
  [/(?:xlink:)?href\s*=\s*"(?!#)/i, "non-fragment href"],
  [/url\(\s*['"]?(?!#|data:font\/)/i, "url() that is neither a fragment nor an embedded font"],
  [/javascript:/i, "javascript: URL"],
  [/<!ENTITY/i, "XML entity declaration"],
]

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
}

function styleOf(tag) {
  const style = tag.match(/style="([^"]*)"/)?.[1] ?? ""
  const get = (prop) => style.match(new RegExp(`${prop}:([^;]+)`))?.[1]?.trim()
  return {
    family: get("font-family")?.split(",")[0].replace(/['"]/g, "").trim() ?? "Montserrat",
    size: parseFloat(get("font-size") ?? "16"),
    weight: get("font-weight") ?? "400",
    italic: get("font-style") === "italic",
    letterSpacing: parseFloat(get("letter-spacing") ?? "0"),
  }
}

/** Editable text fields: <text id=…>…</text> or <textPath id=…> inside a <text>. */
function readFields(svg) {
  const fields = []
  for (const id of FIELD_IDS) {
    const asText = svg.match(new RegExp(`(<text(?=\\s)[^>]*\\sid="${id}"[^>]*>)([\\s\\S]*?)</text>`))
    const asPath = svg.match(new RegExp(`(<text[^>]*>)\\s*<textPath[^>]*\\sid="${id}"[^>]*>([\\s\\S]*?)</textPath>`))
    const m = asText ?? asPath
    if (!m) continue
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, "")).trim()
    fields.push({ id, default: text, onPath: !asText, ...styleOf(m[1]) })
  }
  return fields
}

const outPublic = path.join(FRONTEND, "public/frames")
for (const { group } of GROUPS) {
  fs.rmSync(path.join(outPublic, group), { recursive: true, force: true })
  fs.rmSync(path.join(outPublic, "thumbs", group), { recursive: true, force: true })
  fs.mkdirSync(path.join(outPublic, group), { recursive: true })
  fs.mkdirSync(path.join(outPublic, "thumbs", group), { recursive: true })
}

const entries = []
let shapeIndex = 0
for (const { dir, group } of GROUPS) {
  const files = fs.readdirSync(path.join(src, dir)).filter((f) => f.endsWith(".svg")).sort()
  for (const file of files) {
    const slug = file.replace(/\.svg$/, "")
    if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`${dir}/${file}: unexpected file name`)
    const svg = idLooseText(fs.readFileSync(path.join(src, dir, file), "utf8"))

    for (const [re, what] of UNSAFE) {
      if (re.test(svg)) throw new Error(`${dir}/${file}: contains ${what} — refusing to import`)
    }

    const root = svg.match(/<svg\b[^>]*>/)?.[0]
    const viewBox = root?.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)
    const slot = svg.match(/<g id="qr-slot" data-x="([\d.]+)" data-y="([\d.]+)" data-size="([\d.]+)">/)
    if (!root || !viewBox || !slot) throw new Error(`${dir}/${file}: missing viewBox or qr-slot`)
    const title = decodeEntities(svg.match(/<title>([^<]*)<\/title>/)?.[1] ?? slug)
    const fields = readFields(svg)
    const fonts = [...new Set([...svg.matchAll(/@font-face\{font-family:'([^']+)';font-style:(\w+)/g)].map((m) => `${m[1]}|${m[2]}`))]

    let category = group === "shape" ? "everyday" : group
    let color = null
    let textColor = null
    if (group === "shape") {
      category = Object.entries(SHAPE_CATEGORY).find(([, ids]) => ids.includes(slug))?.[0] ?? "everyday"
      if (!svg.includes(FRAME_TOKEN)) throw new Error(`${dir}/${file}: no ${FRAME_TOKEN} colour token`)
      color = SHAPE_PALETTE[shapeIndex++ % SHAPE_PALETTE.length]
      textColor = textColorFor(color)
    }

    fs.writeFileSync(path.join(outPublic, group, file), svg)
    const slotBox = { x: Number(slot[1]), y: Number(slot[2]), size: Number(slot[3]) }
    let thumb = compactPlaceholder(svg.replace(/@font-face\{[^}]*\}/g, ""), slotBox)
    if (color) thumb = thumb.split(FRAME_TOKEN).join(color).split(TEXT_TOKEN).join(textColor)
    fs.writeFileSync(path.join(outPublic, "thumbs", group, file), thumb)

    entries.push({
      id: `${group}:${slug}`,
      group,
      category,
      title,
      width: Number(viewBox[1]),
      height: Number(viewBox[2]),
      slot: slotBox,
      fields,
      fonts: fonts.map((f) => ({ family: f.split("|")[0], italic: f.split("|")[1] === "italic" })),
      ...(color ? { defaultColor: color } : {}),
    })
  }
}

fs.rmSync(path.join(outPublic, "licenses"), { recursive: true, force: true })
fs.mkdirSync(path.join(outPublic, "licenses"), { recursive: true })
for (const f of fs.readdirSync(path.join(src, "licenses"))) {
  if (f.endsWith(".txt")) fs.copyFileSync(path.join(src, "licenses", f), path.join(outPublic, "licenses", f))
}

const catalog = `// GENERATED by scripts/import-qr-frames.mjs — do not edit by hand.
// ${entries.length} frames. Files live in public/frames/.
import type { FrameEntry } from "./types"

export const FRAME_TOKEN_COLOR = ${JSON.stringify(FRAME_TOKEN)}
export const FRAME_TOKEN_TEXT = ${JSON.stringify(TEXT_TOKEN)}
export const SHAPE_PALETTE: readonly string[] = ${JSON.stringify(SHAPE_PALETTE)}

export const FRAME_CATALOG: readonly FrameEntry[] = ${JSON.stringify(entries, null, 2)}
`
fs.mkdirSync(path.join(FRONTEND, "src/lib/frames"), { recursive: true })
fs.writeFileSync(path.join(FRONTEND, "src/lib/frames/catalog.ts"), catalog)

const counts = entries.reduce((a, e) => ({ ...a, [e.group]: (a[e.group] ?? 0) + 1 }), {})
console.log(`frames imported: ${JSON.stringify(counts)} → public/frames, src/lib/frames/catalog.ts`)
