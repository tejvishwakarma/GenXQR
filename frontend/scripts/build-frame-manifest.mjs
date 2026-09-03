/**
 * Indexes public/frames/*.svg into src/lib/qr-frame-manifest.ts.
 *
 * WHY
 * Illustrated QR frames are ARTWORK, and artwork cannot sensibly be authored as
 * JavaScript path-builder calls. So a frame is an SVG file that describes itself
 * through root data-attributes, and this script turns the folder into a typed
 * manifest the app imports. Adding a frame = drop in one file. No code edit.
 *
 * SELF-DESCRIBING CONTRACT (root <svg> attributes)
 *   data-frame-id        kebab-case unique id (persisted in QRDesign.frameStyle)
 *   data-frame-label     human label for the picker
 *   data-frame-category  picker group, e.g. "Christmas"
 *   data-qr="x y w h"    the QR slot, in viewBox units. MUST be square.
 *   data-text="x y w h size color align"   optional CTA text slot
 *   data-tintable="true" optional — artwork uses currentColor, so the user's
 *                        frame colour is substituted at render time
 *
 * WHY THIS SCRIPT VALIDATES RATHER THAN TRUSTS
 * These SVGs get inlined into exported SVG/PDF documents and into the preview
 * DOM. They are OUR assets, not user uploads — but "ours" is exactly the
 * assumption that rots: an asset pack pulled from a marketplace, or a designer
 * exporting from a tool that embeds a remote font, would silently ship active
 * content or a tracking beacon into every customer's downloaded QR code. The
 * build refuses instead. Same posture as the inline-script guard in prerender.mjs.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const FRAMES_DIR = path.join(ROOT, "public", "frames")
const OUT = path.join(ROOT, "src", "lib", "qr-frame-manifest.ts")

const errors = []
const fail = (file, msg) => errors.push(`${file}: ${msg}`)

// Active content / phone-home vectors. Inlined artwork must be inert and offline.
// `\b` rather than `[\s>]`: the latter missed the self-closing `<foreignObject/>`
// spelling entirely, because the next character is "/". \b also refuses to
// false-positive on a longer name (`<imageData>` is not `<image>`).
const FORBIDDEN = [
  [/<script\b/i, "contains <script>"],
  [/<foreignObject\b/i, "contains <foreignObject> (can host HTML/scripts)"],
  [/<iframe\b/i, "contains <iframe>"],
  [/\son[a-z]+\s*=/i, "has an inline event handler (on*=)"],
  [/javascript:/i, "contains a javascript: URI"],
  [/<!DOCTYPE/i, "has a DOCTYPE (XXE surface)"],
  [/<!ENTITY/i, "declares an XML entity (XXE surface)"],
  [/(?:xlink:)?href\s*=\s*["']\s*(?:https?:)?\/\//i, "references a remote URL"],
  [/url\(\s*["']?\s*(?:https?:)?\/\//i, "references a remote URL in a CSS url()"],
  [/<image\b/i, "contains <image> (embed vectors instead of raster refs)"],
]

// NOTE the doubled backslashes: this is a template literal, so `\s` would decay
// to a literal "s" and the pattern would become `data-frame-ids*=s*"..."`. That
// still matches the common `attr="v"` spelling (s* matching zero characters), so
// the bug was invisible — until an exporter emitted `width = "300"`.
const attr = (svg, name) => svg.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`))?.[1]

const nums = (s) => (s ?? "").trim().split(/\s+/).filter(Boolean)

const files = fs.existsSync(FRAMES_DIR)
  ? fs.readdirSync(FRAMES_DIR).filter((f) => f.endsWith(".svg")).sort()
  : []

const frames = []
const seen = new Set()

for (const file of files) {
  const raw = fs.readFileSync(path.join(FRAMES_DIR, file), "utf8")

  for (const [re, msg] of FORBIDDEN) if (re.test(raw)) fail(file, msg)

  const open = raw.match(/<svg\b[^>]*>/i)?.[0]
  if (!open) { fail(file, "no root <svg> element"); continue }

  const id = attr(open, "data-frame-id")
  const label = attr(open, "data-frame-label")
  const category = attr(open, "data-frame-category")
  const viewBox = attr(open, "viewBox")
  const qr = nums(attr(open, "data-qr")).map(Number)
  const textRaw = attr(open, "data-text")
  const tintable = attr(open, "data-tintable") === "true"

  if (!id) { fail(file, "missing data-frame-id"); continue }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) fail(file, `id "${id}" is not kebab-case`)
  if (seen.has(id)) fail(file, `duplicate data-frame-id "${id}"`)
  seen.add(id)
  if (!label) fail(file, "missing data-frame-label")
  if (!category) fail(file, "missing data-frame-category")

  const vb = nums(viewBox).map(Number)
  if (vb.length !== 4 || vb.some(Number.isNaN)) { fail(file, "missing/invalid viewBox"); continue }
  if (vb[0] !== 0 || vb[1] !== 0) fail(file, "viewBox must start at 0 0")
  const [, , w, h] = vb

  // NOTE: root width/height are deliberately NOT constrained. Design tools ship
  // things like viewBox="0 0 2000 2000" width="300" all the time, and an earlier
  // version of this script rejected exactly that. The renderer instead rewrites
  // the root size from the viewBox when it loads the file, so the canvas export
  // always rasterises at full resolution regardless of what was declared here.

  // NOTE: <style> blocks and CSS class selectors are fully supported and are
  // deliberately NOT restricted. Verified in a browser that svg2pdf.js resolves
  // SVG CSS, so design tools may export styling however they like.

  if (qr.length !== 4 || qr.some(Number.isNaN)) { fail(file, 'missing/invalid data-qr="x y w h"'); continue }
  const [qx, qy, qw, qh] = qr
  if (qw !== qh) fail(file, `QR slot must be square (got ${qw}x${qh})`)
  if (qx < 0 || qy < 0 || qx + qw > w || qy + qh > h) fail(file, "QR slot falls outside the viewBox")
  // A slot far smaller than the canvas means a tiny, hard-to-scan code.
  if (qw / Math.min(w, h) < 0.45) fail(file, `QR slot is only ${Math.round((qw / Math.min(w, h)) * 100)}% of the canvas (min 45%)`)

  let text
  if (textRaw) {
    const t = nums(textRaw)
    if (t.length !== 7) fail(file, 'data-text must be "x y w h size color align"')
    else {
      const [tx, ty, tw, th, size, color, align] = t
      if (![tx, ty, tw, th, size].every((v) => !Number.isNaN(Number(v)))) fail(file, "data-text has non-numeric geometry")
      if (!/^#[0-9a-fA-F]{3,8}$/.test(color)) fail(file, `data-text colour "${color}" must be a hex value`)
      if (!["start", "center", "end"].includes(align)) fail(file, `data-text align "${align}" must be start|center|end`)
      text = { x: +tx, y: +ty, w: +tw, h: +th, size: +size, color, align }
    }
  }

  frames.push({ id, label, category, file: `/frames/${file}`, w, h, qr: { x: qx, y: qy, size: qw }, text, tintable })
}

// Categories are free-form strings that become picker groups, so "Christmas" and
// "christmas" would silently render as two separate sections. Cheap to catch here;
// impossible to notice by eye once the library is large.
const categoryByKey = new Map()
for (const f of frames) {
  const key = f.category.toLowerCase().replace(/\s+/g, " ").trim()
  const seenAs = categoryByKey.get(key)
  if (seenAs && seenAs !== f.category) {
    errors.push(`${f.id}: category "${f.category}" collides with "${seenAs}" — pick one spelling`)
  } else if (!seenAs) {
    categoryByKey.set(key, f.category)
  }
}

if (errors.length) {
  console.error("\nbuild-frame-manifest: invalid frame asset(s)\n")
  errors.forEach((e) => console.error(`  ${e}`))
  console.error("")
  process.exit(1)
}

const header = `// GENERATED by scripts/build-frame-manifest.mjs — do not edit by hand.
// Source of truth is the SVG files in public/frames/. Run \`pnpm frames:build\`
// (or any \`pnpm build\`) after adding, removing or editing one.

export interface FrameTextSlot {
  x: number; y: number; w: number; h: number
  size: number; color: string; align: "start" | "center" | "end"
}

export interface FrameAssetEntry {
  id: string
  label: string
  category: string
  /** Public path, served straight from disk by nginx (see the *.svg location). */
  file: string
  w: number
  h: number
  /** Where the QR is composited. Always square; artwork never draws over it. */
  qr: { x: number; y: number; size: number }
  text?: FrameTextSlot
  /** Artwork uses currentColor, so the user's frame colour is substituted. */
  tintable: boolean
}

export const FRAME_ASSETS: FrameAssetEntry[] = ${JSON.stringify(frames, null, 2)}
`

fs.writeFileSync(OUT, header, "utf8")
const cats = [...new Set(frames.map((f) => f.category))]
console.log(`frames — ${frames.length} asset frames in ${cats.length} categories indexed to src/lib/qr-frame-manifest.ts`)
