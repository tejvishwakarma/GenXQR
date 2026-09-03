/**
 * QR frame engine — ONE declarative catalog, THREE renderers that share it.
 *
 * WHY THIS EXISTS
 * A QR frame used to be written in five places that could silently drift: the
 * CSS preview in CreateQRPage, the CSS preview in QRDetailPage, and the three
 * export renderers (canvas PNG/JPEG/WEBP, SVG, and SVG→PDF). Adding a frame or
 * fixing a colour meant five coordinated edits; a miss shipped a preview that
 * lied about the download.
 *
 * HOW IT WORKS NOW
 * Each frame is declared ONCE as a `FrameSpec` whose `build()` returns a
 * renderer-agnostic `FrameScene` — a list of primitive elements (rects, text,
 * polylines, paths) in a fixed 900px coordinate space, plus gradient/glow defs.
 * Three thin adapters consume that scene:
 *   - drawSceneToCanvas()   → PNG / JPEG / WEBP
 *   - sceneToSvgDocument()  → SVG, and (parsed) the vector PDF
 *   - <FramePreview>        → the live editor/detail preview (React <svg>)
 * The preview renders the SAME scene as the export, so what you see is what you
 * download. Adding a frame is now a single catalog entry.
 *
 * SCANNABILITY
 * Frames only ever draw in the padding/label zones around the QR, never over the
 * modules (the one exception, corner brackets, sits on the quiet-zone edge). The
 * QR keeps error-correction level H. This is why frames are code-defined and not
 * user-uploaded SVG: a curated catalog cannot produce an unscannable code, and
 * bundled/authored SVG carries no script (unlike user uploads, which we block).
 */
import { useEffect, useId, useState } from "react"
import { FRAME_ASSETS, type FrameAssetEntry } from "./qr-frame-manifest"

// ─── Fixed coordinate space (export resolution) ──────────────────────────────
// Every scene is authored at this scale; the canvas/SVG export uses it directly
// and the preview scales it down to fit. Kept identical to the values the export
// pipeline shipped with, so existing frames render pixel-for-pixel as before.
const QR = 900
const PAD = 30
const LABEL_H = 72
const EXTRA = 60
const DEFAULT_TEXT_COLOR = "#ffffff"

export interface FrameGeom {
  QR: number
  PAD: number
  LABEL_H: number
  EXTRA: number
  topH: number
  botH: number
  xPad: number
  yPad: number
  canvasW: number
  canvasH: number
  qrX: number
  qrY: number
}

interface FrameLayout {
  topLabel?: boolean
  botLabel?: boolean
  banner?: boolean
  scanNow?: boolean
  corners?: boolean
}

function geomFor(layout: FrameLayout): FrameGeom {
  const topH = layout.topLabel ? LABEL_H : 0
  const botH = layout.botLabel || layout.banner || layout.scanNow ? LABEL_H : 0
  const xPad = PAD + (layout.corners ? EXTRA : 0)
  const yPad = PAD + (layout.corners ? EXTRA : 0)
  const canvasW = QR + xPad * 2
  const canvasH = QR + yPad * 2 + topH + botH
  return { QR, PAD, LABEL_H, EXTRA, topH, botH, xPad, yPad, canvasW, canvasH, qrX: xPad, qrY: yPad + topH }
}

// ─── Scene primitives (renderer-agnostic) ────────────────────────────────────

type Corners = number | [number, number, number, number]

interface RectEl {
  t: "rect"
  x: number
  y: number
  w: number
  h: number
  rx?: Corners
  fill?: string       // solid colour
  fillGrad?: string   // gradient id — takes precedence over fill
  stroke?: string
  strokeW?: number
  dash?: [number, number]
  glow?: string       // glow def id (neon halo)
}

interface TextEl {
  t: "text"
  x: number
  y: number            // vertical CENTRE of the text
  text: string
  size: number
  weight?: number | "bold"
  color: string
  letterSpacing?: number
  anchor?: "start" | "middle" | "end"
}

interface PolyEl {
  t: "poly"
  points: [number, number][]
  stroke: string
  strokeW: number
  cap?: "butt" | "round" | "square"
}

interface PathEl {
  t: "path"
  d: string
  fill?: string
  fillGrad?: string
  stroke?: string
  strokeW?: number
  opacity?: number
}

type SceneEl = RectEl | TextEl | PolyEl | PathEl

interface GradientDef {
  id: string
  kind: "linear" | "radial"
  stops: { offset: number; color: string }[]
  x1: number
  y1: number
  x2: number
  y2: number
}

interface GlowDef {
  id: string
  color: string
}

/**
 * An illustrated frame backed by an SVG file in public/frames/.
 *
 * The artwork is ALWAYS composited under the QR and the QR slot is validated at
 * build time, so no asset can cover the modules and make a code unscannable.
 */
export interface SceneAsset {
  url: string
  /** Artwork uses currentColor → the user's frame colour is substituted. */
  tintable: boolean
  /** viewBox dimensions — the root size is normalised to these when loaded. */
  w: number
  h: number
}

export interface FrameScene {
  geom: FrameGeom
  defs: GradientDef[]
  glows: GlowDef[]
  bg?: SceneEl
  behind: SceneEl[]  // drawn under the QR
  front: SceneEl[]   // drawn over the QR (labels, brackets)
  /** Present for asset frames; the artwork layer beneath everything. */
  asset?: SceneAsset
}

interface BuildOpts {
  color: string
  text: string
  textColor: string
}

interface BuildResult {
  defs?: GradientDef[]
  glows?: GlowDef[]
  bg?: SceneEl
  behind?: SceneEl[]
  front?: SceneEl[]
}

export interface FrameSpec {
  id: string
  label: string
  category: "none" | "border" | "label" | "cta" | "neon" | "decorative"
  /** Whether the frame renders `frameText` (drives the text/colour controls). */
  hasText: boolean
  layout: FrameLayout
  build: (geom: FrameGeom, o: BuildOpts) => BuildResult
}

// ─── Shared element builders (keep specs DRY) ────────────────────────────────

function labelRect(x: number, y: number, w: number, h: number, rx: Corners, fill: string, grad?: string): RectEl {
  return { t: "rect", x, y, w, h, rx, ...(grad ? { fillGrad: grad } : { fill }) }
}

function labelText(cx: number, cy: number, text: string, color: string, size = 32, spacing = 6): TextEl {
  return { t: "text", x: cx, y: cy, text, size, weight: "bold", color, letterSpacing: spacing, anchor: "middle" }
}

function topLabel(g: FrameGeom, o: BuildOpts, grad?: string): SceneEl[] {
  const y = g.qrY - g.topH
  return [
    labelRect(g.qrX, y, g.QR, g.LABEL_H, 10, o.color, grad),
    labelText(g.qrX + g.QR / 2, y + g.LABEL_H / 2, o.text || "SCAN ME", o.textColor),
  ]
}

function botLabel(g: FrameGeom, o: BuildOpts, grad?: string): SceneEl[] {
  const y = g.qrY + g.QR
  return [
    labelRect(g.qrX, y, g.QR, g.LABEL_H, 10, o.color, grad),
    labelText(g.qrX + g.QR / 2, y + g.LABEL_H / 2, o.text || "SCAN ME", o.textColor),
  ]
}

function bannerEls(g: FrameGeom, o: BuildOpts, arrow: string, grad?: string): SceneEl[] {
  const y = g.canvasH - g.LABEL_H
  return [
    labelRect(0, y, g.canvasW, g.LABEL_H, 0, o.color, grad),
    labelText(g.canvasW / 2, y + g.LABEL_H / 2, `${o.text || "SCAN ME"} ${arrow}`, o.textColor),
  ]
}

function scanNowEls(g: FrameGeom, o: BuildOpts, grad?: string): SceneEl[] {
  const y = g.qrY + g.QR
  const text = `↓  ${o.text || "SCAN NOW"}  ↓`
  const size = 28
  // Estimate width so canvas and SVG agree without a measuring context.
  const pillW = Math.max(320, text.length * size * 0.62 + 96)
  const pillH = 52
  return [
    { t: "rect", x: g.canvasW / 2 - pillW / 2, y: y + (g.LABEL_H - pillH) / 2, w: pillW, h: pillH, rx: pillH / 2, ...(grad ? { fillGrad: grad } : { fill: o.color }) },
    labelText(g.canvasW / 2, y + g.LABEL_H / 2, text, o.textColor, size, 5),
  ]
}

function cornerBrackets(g: FrameGeom, color = "#ffffff", strokeW = 9): PolyEl[] {
  const bs = g.EXTRA - 10
  const x0 = g.qrX, y0 = g.qrY, x1 = g.qrX + g.QR, y1 = g.qrY + g.QR
  const mk = (points: [number, number][]): PolyEl => ({ t: "poly", points, stroke: color, strokeW, cap: "square" })
  return [
    mk([[x0, y0 + bs], [x0, y0], [x0 + bs, y0]]),
    mk([[x1 - bs, y0], [x1, y0], [x1, y0 + bs]]),
    mk([[x0, y1 - bs], [x0, y1], [x0 + bs, y1]]),
    mk([[x1 - bs, y1], [x1, y1], [x1, y1 - bs]]),
  ]
}

function borderRect(g: FrameGeom, inset: number, radius: number, stroke: string, strokeW: number, dash?: [number, number], glow?: string): RectEl {
  return {
    t: "rect",
    x: g.qrX - inset,
    y: g.qrY - inset,
    w: g.QR + inset * 2,
    h: g.QR + inset * 2,
    rx: radius,
    stroke,
    strokeW,
    ...(dash ? { dash } : {}),
    ...(glow ? { glow } : {}),
  }
}

function cardBg(g: FrameGeom, fill = "#ffffff"): RectEl {
  return { t: "rect", x: 0, y: 0, w: g.canvasW, h: g.canvasH, rx: 28, fill }
}

/** Horizontal linear gradient spanning a rect, id-stamped for def + reference. */
function hGrad(id: string, x: number, w: number, y: number, stops: { offset: number; color: string }[]): GradientDef {
  return { id, kind: "linear", stops, x1: x, y1: y, x2: x + w, y2: y }
}

// ─── The catalog ─────────────────────────────────────────────────────────────
// Add a frame here and it appears in the picker, the preview, and every export.

export const FRAME_SPECS: FrameSpec[] = [
  { id: "none", label: "None", category: "none", hasText: false, layout: {}, build: () => ({}) },

  // ── Labels ──────────────────────────────────────────────────────────────
  {
    id: "simple", label: "Scan Me", category: "label", hasText: true, layout: { botLabel: true },
    build: (g, o) => ({ front: botLabel(g, o) }),
  },
  {
    id: "top-label", label: "Top Label", category: "label", hasText: true, layout: { topLabel: true },
    build: (g, o) => ({ front: topLabel(g, o) }),
  },
  {
    id: "both-labels", label: "Both Labels", category: "label", hasText: true, layout: { topLabel: true, botLabel: true },
    build: (g, o) => ({ front: [...topLabel(g, o), ...botLabel(g, o)] }),
  },

  // ── Borders ─────────────────────────────────────────────────────────────
  {
    id: "box", label: "Box Border", category: "border", hasText: false, layout: {},
    build: (g) => ({ behind: [borderRect(g, 10, 14, "rgba(255,255,255,0.5)", 8)] }),
  },
  {
    id: "thick-border", label: "Bold Border", category: "border", hasText: false, layout: {},
    build: (g) => ({ behind: [borderRect(g, 15, 22, "#ffffff", 22)] }),
  },
  {
    id: "dashed", label: "Dashed", category: "border", hasText: false, layout: {},
    build: (g) => ({ behind: [borderRect(g, 10, 14, "rgba(255,255,255,0.65)", 8, [26, 13])] }),
  },
  {
    id: "double", label: "Double", category: "border", hasText: false, layout: {},
    build: (g) => ({ behind: [borderRect(g, 10, 14, "rgba(255,255,255,0.8)", 8), borderRect(g, 26, 24, "rgba(255,255,255,0.25)", 8)] }),
  },
  {
    id: "corners", label: "Brackets", category: "border", hasText: false, layout: { corners: true },
    build: (g) => ({ front: cornerBrackets(g) }),
  },

  // ── Cards ────────────────────────────────────────────────────────────────
  {
    id: "card", label: "White Card", category: "border", hasText: false, layout: {},
    build: (g) => ({ bg: cardBg(g) }),
  },

  // ── CTA ────────────────────────────────────────────────────────────────
  {
    id: "banner", label: "Banner CTA", category: "cta", hasText: true, layout: { banner: true },
    build: (g, o) => ({ bg: cardBg(g), front: bannerEls(g, o, "→") }),
  },
  {
    id: "scan-now", label: "Scan Now", category: "cta", hasText: true, layout: { scanNow: true },
    build: (g, o) => ({ front: scanNowEls(g, o) }),
  },
  {
    id: "gradient-banner-violet", label: "Violet Banner", category: "cta", hasText: true, layout: { banner: true },
    build: (g, o) => {
      const id = "grad-banner-violet"
      const y = g.canvasH - g.LABEL_H
      return { bg: cardBg(g), defs: [hGrad(id, 0, g.canvasW, y, [{ offset: 0, color: "#7c3aed" }, { offset: 1, color: "#ec4899" }])], front: bannerEls(g, { ...o, textColor: "#ffffff" }, "→", id) }
    },
  },
  {
    id: "gradient-banner-sunset", label: "Sunset Banner", category: "cta", hasText: true, layout: { banner: true },
    build: (g, o) => {
      const id = "grad-banner-sunset"
      const y = g.canvasH - g.LABEL_H
      return { bg: cardBg(g), defs: [hGrad(id, 0, g.canvasW, y, [{ offset: 0, color: "#f97316" }, { offset: 1, color: "#ec4899" }])], front: bannerEls(g, { ...o, textColor: "#ffffff" }, "→", id) }
    },
  },
  {
    id: "gradient-banner-ocean", label: "Ocean Banner", category: "cta", hasText: true, layout: { banner: true },
    build: (g, o) => {
      const id = "grad-banner-ocean"
      const y = g.canvasH - g.LABEL_H
      return { bg: cardBg(g), defs: [hGrad(id, 0, g.canvasW, y, [{ offset: 0, color: "#2563eb" }, { offset: 1, color: "#06b6d4" }])], front: bannerEls(g, { ...o, textColor: "#ffffff" }, "→", id) }
    },
  },
  {
    id: "gradient-label", label: "Gradient Label", category: "cta", hasText: true, layout: { botLabel: true },
    build: (g, o) => {
      const id = "grad-label"
      const y = g.qrY + g.QR
      return { defs: [hGrad(id, g.qrX, g.QR, y, [{ offset: 0, color: "#8b5cf6" }, { offset: 1, color: "#06b6d4" }])], front: botLabel(g, { ...o, textColor: "#ffffff" }, id) }
    },
  },
  {
    id: "pill-cta", label: "Pill CTA", category: "cta", hasText: true, layout: { scanNow: true },
    build: (g, o) => {
      const id = "grad-pill"
      const y = g.qrY + g.QR
      return { defs: [hGrad(id, g.canvasW / 2 - 220, 440, y, [{ offset: 0, color: "#7c3aed" }, { offset: 1, color: "#ec4899" }])], front: scanNowEls(g, { ...o, textColor: "#ffffff" }, id) }
    },
  },

  // ── Neon ───────────────────────────────────────────────────────────────
  ...neonSpec("neon-violet", "Neon Violet", "#8b5cf6"),
  ...neonSpec("neon-blue", "Neon Blue", "#60a5fa"),
  ...neonSpec("neon-pink", "Neon Pink", "#f472b6"),
  ...neonSpec("neon-cyan", "Neon Cyan", "#22d3ee"),
  ...neonSpec("neon-green", "Neon Green", "#4ade80"),
  {
    id: "speech-bubble", label: "Bubble", category: "neon", hasText: false, layout: {},
    build: (g) => ({ behind: [borderRect(g, 8, 14, "#7c3aed", 8, undefined, "glow-bubble")], glows: [{ id: "glow-bubble", color: "#7c3aed" }] }),
  },

  // ── Decorative (bundled, authored-by-us vector shapes) ──────────────────
  {
    id: "ticket", label: "Ticket", category: "decorative", hasText: true, layout: { botLabel: true },
    build: (g, o) => {
      // Ticket stub: rounded card with two circular notches punched into the
      // sides at the seam between the QR and the label strip.
      const seamY = g.qrY + g.QR
      const r = 26
      const w = g.canvasW, h = g.canvasH
      const d = [
        `M 28 0 H ${w - 28}`,
        `A 28 28 0 0 1 ${w} 28`,
        `V ${seamY - r}`,
        `A ${r} ${r} 0 0 0 ${w} ${seamY + r}`,
        `V ${h - 28}`,
        `A 28 28 0 0 1 ${w - 28} ${h}`,
        `H 28`,
        `A 28 28 0 0 1 0 ${h - 28}`,
        `V ${seamY + r}`,
        `A ${r} ${r} 0 0 0 0 ${seamY - r}`,
        `V 28`,
        `A 28 28 0 0 1 28 0`,
        `Z`,
      ].join(" ")
      return {
        bg: { t: "path", d, fill: "#ffffff" },
        front: [
          { t: "poly", points: [[36, seamY], [w - 36, seamY]], stroke: "rgba(0,0,0,0.18)", strokeW: 4, cap: "round" },
          ...botLabel(g, o),
        ],
      }
    },
  },
  {
    id: "ribbon", label: "Ribbon", category: "decorative", hasText: true, layout: { banner: true },
    build: (g, o) => {
      // Banner strip with notched (chevron) ends, like a paper ribbon.
      const y = g.canvasH - g.LABEL_H
      const h = g.LABEL_H
      const notch = 34
      const d = [
        `M 0 ${y}`,
        `H ${g.canvasW}`,
        `L ${g.canvasW - notch} ${y + h / 2}`,
        `L ${g.canvasW} ${y + h}`,
        `H 0`,
        `L ${notch} ${y + h / 2}`,
        `Z`,
      ].join(" ")
      const id = "grad-ribbon"
      return {
        bg: cardBg(g),
        defs: [hGrad(id, 0, g.canvasW, y, [{ offset: 0, color: "#7c3aed" }, { offset: 1, color: "#4f46e5" }])],
        front: [
          { t: "path", d, fillGrad: id },
          labelText(g.canvasW / 2, y + h / 2, o.text || "SCAN ME", "#ffffff"),
        ],
      }
    },
  },
]

/** Neon frame family — a coloured stroke with a matching glow, on every renderer. */
function neonSpec(id: string, label: string, color: string): FrameSpec[] {
  const glowId = `glow-${id}`
  return [{
    id, label, category: "neon", hasText: false, layout: {},
    build: (g) => ({ behind: [borderRect(g, 8, 14, color, 8, undefined, glowId)], glows: [{ id: glowId, color }] }),
  }]
}

const FRAME_MAP: Record<string, FrameSpec> = Object.fromEntries(FRAME_SPECS.map((s) => [s.id, s]))
const ASSET_MAP: Record<string, FrameAssetEntry> = Object.fromEntries(FRAME_ASSETS.map((a) => [a.id, a]))

// The code-drawn specs carry terse internal category keys; the picker wants
// human groups, alongside the asset frames' own occasion categories.
const SPEC_CATEGORY_LABEL: Record<FrameSpec["category"], string> = {
  none: "Basic",
  border: "Borders",
  label: "Labels",
  cta: "Call to Action",
  neon: "Neon",
  decorative: "Decorative",
}

export interface FrameOption {
  id: string
  label: string
  category: string
  /** "spec" = code-drawn geometry, "asset" = illustrated SVG from public/frames. */
  kind: "spec" | "asset"
  /** Asset frames can be thumbnailed straight from their file — no JS needed. */
  thumb?: string
}

/** Flat list for the picker — code-drawn frames first, then illustrated ones. */
export const FRAME_OPTIONS: FrameOption[] = [
  ...FRAME_SPECS.map((s) => ({ id: s.id, label: s.label, category: SPEC_CATEGORY_LABEL[s.category], kind: "spec" as const })),
  ...FRAME_ASSETS.map((a) => ({ id: a.id, label: a.label, category: a.category, kind: "asset" as const, thumb: a.file })),
]

export function frameIsAsset(id: string): boolean {
  return id in ASSET_MAP
}

/** Does this frame render `frameText`? Drives the text input. */
export function frameSpecHasText(id: string): boolean {
  const asset = ASSET_MAP[id]
  if (asset) return !!asset.text
  return FRAME_MAP[id]?.hasText ?? false
}

/** Does this frame use `frameColor`? Drives the colour picker. */
export function frameSupportsColor(id: string): boolean {
  const asset = ASSET_MAP[id]
  if (asset) return asset.tintable
  return FRAME_MAP[id]?.hasText ?? false
}

/** Asset frames get their geometry from the artwork's declared QR slot. */
function assetGeom(a: FrameAssetEntry): FrameGeom {
  return {
    QR: a.qr.size,
    PAD: 0, LABEL_H: 0, EXTRA: 0, topH: 0, botH: 0,
    xPad: a.qr.x, yPad: a.qr.y,
    canvasW: a.w, canvasH: a.h,
    qrX: a.qr.x, qrY: a.qr.y,
  }
}

function buildAssetScene(a: FrameAssetEntry, o: BuildOpts): FrameScene {
  const front: SceneEl[] = []
  if (a.text) {
    const t = a.text
    const anchor = t.align === "center" ? "middle" : t.align === "end" ? "end" : "start"
    const x = t.align === "center" ? t.x + t.w / 2 : t.align === "end" ? t.x + t.w : t.x
    front.push({
      t: "text",
      x,
      y: t.y + t.h / 2,
      text: o.text || "SCAN ME",
      size: t.size,
      weight: "bold",
      color: t.color,
      letterSpacing: Math.round(t.size * 0.1),
      anchor,
    })
  }
  return {
    geom: assetGeom(a),
    defs: [], glows: [], behind: [], front,
    asset: { url: a.file, tintable: a.tintable, w: a.w, h: a.h },
  }
}

export function frameGeometry(id: string): FrameGeom {
  const asset = ASSET_MAP[id]
  if (asset) return assetGeom(asset)
  return geomFor((FRAME_MAP[id] ?? FRAME_MAP.none).layout)
}

/** Build the renderer-agnostic scene for a frame at its native export scale. */
export function buildFrameScene(id: string, opts: Partial<BuildOpts>): FrameScene {
  const o: BuildOpts = {
    color: opts.color || "#1f2937",
    text: opts.text ?? "SCAN ME",
    textColor: opts.textColor || DEFAULT_TEXT_COLOR,
  }
  const asset = ASSET_MAP[id]
  if (asset) return buildAssetScene(asset, o)

  const spec = FRAME_MAP[id] ?? FRAME_MAP.none
  const geom = geomFor(spec.layout)
  const r = spec.build(geom, o)
  return { geom, defs: r.defs ?? [], glows: r.glows ?? [], bg: r.bg, behind: r.behind ?? [], front: r.front ?? [] }
}

// ─── Asset loading (same-origin fetch, cached) ───────────────────────────────

const assetCache = new Map<string, string>()

/**
 * Fetch an asset frame's markup and return both the inner vectors (for inlining
 * into the SVG/PDF export) and a data URI (for <img> in the preview and the
 * canvas raster export). Tintable artwork gets `currentColor` substituted here,
 * which is why even the preview goes through a data URI for those.
 */
/**
 * Force the root <svg> to its viewBox dimensions.
 *
 * Design tools happily export `viewBox="0 0 2000 2000" width="300"`. Drawing an
 * <img> like that into a canvas can rasterise at the declared 300px and then
 * upscale, so the PNG export comes out soft while the SVG and PDF look perfect —
 * a difference nobody notices until a customer prints one. Normalising here
 * means the export resolution is ours to decide, not the designer's.
 */
function normalizeAssetRoot(doc: string, w: number, h: number): string {
  return doc.replace(/<svg\b[^>]*>/i, (open) =>
    open.replace(/\s(?:width|height)\s*=\s*"[^"]*"/gi, "").replace(/<svg\b/i, `<svg width="${w}" height="${h}"`),
  )
}

export async function loadFrameAsset(
  asset: SceneAsset,
  tint: string,
): Promise<{ inner: string; dataUri: string }> {
  const { url, tintable, w, h } = asset
  let raw = assetCache.get(url)
  if (raw === undefined) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`frame asset ${url} failed to load (${res.status})`)
    raw = await res.text()
    assetCache.set(url, raw)
  }

  const tinted = tintable ? raw.split("currentColor").join(tint) : raw
  const doc = normalizeAssetRoot(tinted, w, h)

  // Inlined verbatim, <style> block and all. Verified in a browser that
  // svg2pdf.js resolves SVG CSS class selectors correctly — an earlier version
  // rewrote class rules into inline styles on the strength of an assumption that
  // turned out to be false, and all it achieved was forcing frame authors to
  // avoid complex selectors their design tool emits by default.
  const inner = doc.replace(/^[\s\S]*?<svg\b[^>]*>/i, "").replace(/<\/svg>\s*$/i, "")

  return { inner, dataUri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(doc)}` }
}

// ─── Renderer 1: Canvas (PNG / JPEG / WEBP) ──────────────────────────────────

function cornersToArray(rx?: Corners): number | number[] {
  if (rx === undefined) return 0
  return rx
}

export function drawSceneToCanvas(
  ctx: CanvasRenderingContext2D,
  scene: FrameScene,
  qrImg: CanvasImageSource,
  /** Rasterised artwork for asset frames (see loadFrameAsset → dataUri). */
  assetImg?: CanvasImageSource,
) {
  const { geom } = scene
  const grads = new Map<string, CanvasGradient>()
  for (const def of scene.defs) {
    const g = ctx.createLinearGradient(def.x1, def.y1, def.x2, def.y2)
    def.stops.forEach((s) => g.addColorStop(s.offset, s.color))
    grads.set(def.id, g)
  }
  const glowColor = new Map(scene.glows.map((gl) => [gl.id, gl.color]))

  const paint = (el: SceneEl) => {
    if (el.t === "rect") {
      ctx.save()
      if (el.glow) {
        ctx.shadowColor = glowColor.get(el.glow) ?? el.stroke ?? "#fff"
        ctx.shadowBlur = 40
      }
      ctx.beginPath()
      ctx.roundRect(el.x, el.y, el.w, el.h, cornersToArray(el.rx))
      if (el.fillGrad && grads.has(el.fillGrad)) {
        ctx.fillStyle = grads.get(el.fillGrad)!
        ctx.fill()
      } else if (el.fill) {
        ctx.fillStyle = el.fill
        ctx.fill()
      }
      if (el.stroke) {
        ctx.strokeStyle = el.stroke
        ctx.lineWidth = el.strokeW ?? 8
        if (el.dash) ctx.setLineDash(el.dash)
        ctx.stroke()
        ctx.setLineDash([])
      }
      ctx.restore()
    } else if (el.t === "text") {
      ctx.save()
      ctx.fillStyle = el.color
      ctx.font = `${el.weight ?? "bold"} ${el.size}px system-ui, sans-serif`
      ctx.textAlign = el.anchor === "start" ? "left" : el.anchor === "end" ? "right" : "center"
      ctx.textBaseline = "middle"
      if (el.letterSpacing && "letterSpacing" in ctx) {
        ;(ctx as unknown as { letterSpacing: string }).letterSpacing = `${el.letterSpacing}px`
      }
      ctx.fillText(el.text, el.x, el.y)
      ctx.restore()
    } else if (el.t === "poly") {
      ctx.save()
      ctx.strokeStyle = el.stroke
      ctx.lineWidth = el.strokeW
      ctx.lineCap = el.cap ?? "butt"
      ctx.beginPath()
      el.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
      ctx.stroke()
      ctx.restore()
    } else if (el.t === "path") {
      ctx.save()
      const path = new Path2D(el.d)
      if (el.opacity !== undefined) ctx.globalAlpha = el.opacity
      if (el.fillGrad && grads.has(el.fillGrad)) {
        ctx.fillStyle = grads.get(el.fillGrad)!
        ctx.fill(path)
      } else if (el.fill) {
        ctx.fillStyle = el.fill
        ctx.fill(path)
      }
      if (el.stroke) {
        ctx.strokeStyle = el.stroke
        ctx.lineWidth = el.strokeW ?? 4
        ctx.stroke(path)
      }
      ctx.restore()
    }
  }

  if (assetImg) ctx.drawImage(assetImg, 0, 0, geom.canvasW, geom.canvasH)
  if (scene.bg) paint(scene.bg)
  scene.behind.forEach(paint)
  ctx.drawImage(qrImg, geom.qrX, geom.qrY, geom.QR, geom.QR)
  scene.front.forEach(paint)
}

// ─── Renderer 2: SVG string (SVG download + vector PDF) ──────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function rxAttr(rx?: Corners): string {
  // SVG <rect> only supports a uniform radius; the array form is used for
  // canvas-only per-corner rounding and collapses to its first value here.
  if (rx === undefined) return ""
  const r = Array.isArray(rx) ? rx[0] : rx
  return r ? ` rx="${r}"` : ""
}

function elToSvg(el: SceneEl): string {
  if (el.t === "rect") {
    const fill = el.fillGrad ? `url(#${el.fillGrad})` : el.fill ?? "none"
    const stroke = el.stroke ? ` stroke="${el.stroke}" stroke-width="${el.strokeW ?? 8}"` : ""
    const dash = el.dash ? ` stroke-dasharray="${el.dash[0]} ${el.dash[1]}"` : ""
    const glow = el.glow ? ` filter="url(#${el.glow})"` : ""
    return `<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}"${rxAttr(el.rx)} fill="${fill}"${stroke}${dash}${glow}/>`
  }
  if (el.t === "text") {
    const ls = el.letterSpacing ? ` letter-spacing="${el.letterSpacing}"` : ""
    const anchor = el.anchor ?? "middle"
    return `<text x="${el.x}" y="${el.y}" text-anchor="${anchor}" dominant-baseline="central" fill="${el.color}" font-size="${el.size}" font-weight="${el.weight ?? "bold"}" font-family="system-ui,sans-serif"${ls}>${esc(el.text)}</text>`
  }
  if (el.t === "poly") {
    const pts = el.points.map(([x, y]) => `${x},${y}`).join(" ")
    return `<polyline points="${pts}" fill="none" stroke="${el.stroke}" stroke-width="${el.strokeW}" stroke-linecap="${el.cap ?? "butt"}"/>`
  }
  // path
  const fill = el.fillGrad ? `url(#${el.fillGrad})` : el.fill ?? "none"
  const stroke = el.stroke ? ` stroke="${el.stroke}" stroke-width="${el.strokeW ?? 4}"` : ""
  const op = el.opacity !== undefined ? ` opacity="${el.opacity}"` : ""
  return `<path d="${el.d}" fill="${fill}"${stroke}${op}/>`
}

function defsToSvg(scene: FrameScene): string {
  if (!scene.defs.length && !scene.glows.length) return ""
  const parts: string[] = ["<defs>"]
  for (const d of scene.defs) {
    const stops = d.stops.map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`).join("")
    parts.push(`<linearGradient id="${d.id}" gradientUnits="userSpaceOnUse" x1="${d.x1}" y1="${d.y1}" x2="${d.x2}" y2="${d.y2}">${stops}</linearGradient>`)
  }
  for (const gl of scene.glows) {
    // Multi-pass neon glow: colourise the stroke, blur wide + tight, stack behind
    // the crisp stroke. Matches the CSS box-shadow spread of the legacy preview.
    parts.push(
      `<filter id="${gl.id}" x="-80%" y="-80%" width="260%" height="260%" color-interpolation-filters="sRGB">` +
        `<feFlood flood-color="${gl.color}" flood-opacity="1" result="flood"/>` +
        `<feComposite in="flood" in2="SourceAlpha" operator="in" result="colored"/>` +
        `<feGaussianBlur in="colored" stdDeviation="18" result="blur-wide"/>` +
        `<feGaussianBlur in="colored" stdDeviation="6" result="blur-tight"/>` +
        `<feMerge><feMergeNode in="blur-wide"/><feMergeNode in="blur-wide"/><feMergeNode in="blur-tight"/><feMergeNode in="SourceGraphic"/></feMerge>` +
        `</filter>`,
    )
  }
  parts.push("</defs>")
  return parts.join("")
}

/**
 * Full standalone SVG document. `qrInner` is the serialized inner markup of a
 * qr-code-styling SVG (its child nodes), inlined as a nested <svg> so every dot
 * stays an editable vector — the same technique the SVG/PDF exports always used.
 */
export function sceneToSvgDocument(scene: FrameScene, qrInner: string, assetInner?: string): string {
  const { geom } = scene
  const p: string[] = []
  p.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${geom.canvasW} ${geom.canvasH}" width="${geom.canvasW}" height="${geom.canvasH}">`)
  p.push(defsToSvg(scene))
  // Asset artwork is already authored in canvas coordinates, so it inlines with
  // no transform and stays fully editable vectors in the SVG/PDF export.
  if (assetInner) p.push(`<g>${assetInner}</g>`)
  if (scene.bg) p.push(elToSvg(scene.bg))
  scene.behind.forEach((el) => p.push(elToSvg(el)))
  p.push(`<svg x="${geom.qrX}" y="${geom.qrY}" width="${geom.QR}" height="${geom.QR}" viewBox="0 0 ${geom.QR} ${geom.QR}">${qrInner}</svg>`)
  scene.front.forEach((el) => p.push(elToSvg(el)))
  p.push(`</svg>`)
  return p.join("\n")
}

// ─── Renderer 3: React preview ───────────────────────────────────────────────

function ElSvg({ el }: { el: SceneEl }) {
  if (el.t === "rect") {
    return (
      <rect
        x={el.x} y={el.y} width={el.w} height={el.h}
        rx={Array.isArray(el.rx) ? el.rx[0] : el.rx}
        fill={el.fillGrad ? `url(#${el.fillGrad})` : el.fill ?? "none"}
        stroke={el.stroke} strokeWidth={el.stroke ? el.strokeW ?? 8 : undefined}
        strokeDasharray={el.dash ? `${el.dash[0]} ${el.dash[1]}` : undefined}
        filter={el.glow ? `url(#${el.glow})` : undefined}
      />
    )
  }
  if (el.t === "text") {
    return (
      <text
        x={el.x} y={el.y} textAnchor={el.anchor ?? "middle"} dominantBaseline="central"
        fill={el.color} fontSize={el.size} fontWeight={el.weight ?? "bold"}
        fontFamily="system-ui,sans-serif" letterSpacing={el.letterSpacing}
      >
        {el.text}
      </text>
    )
  }
  if (el.t === "poly") {
    return <polyline points={el.points.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke={el.stroke} strokeWidth={el.strokeW} strokeLinecap={el.cap ?? "butt"} />
  }
  return <path d={el.d} fill={el.fillGrad ? `url(#${el.fillGrad})` : el.fill ?? "none"} stroke={el.stroke} strokeWidth={el.stroke ? el.strokeW ?? 4 : undefined} opacity={el.opacity} />
}

function DefsSvg({ scene }: { scene: FrameScene }) {
  return (
    <defs>
      {scene.defs.map((d) => (
        <linearGradient key={d.id} id={d.id} gradientUnits="userSpaceOnUse" x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2}>
          {d.stops.map((s, i) => <stop key={i} offset={s.offset} stopColor={s.color} />)}
        </linearGradient>
      ))}
      {scene.glows.map((gl) => (
        <filter key={gl.id} id={gl.id} x="-80%" y="-80%" width="260%" height="260%" colorInterpolationFilters="sRGB">
          <feFlood floodColor={gl.color} floodOpacity={1} result="flood" />
          <feComposite in="flood" in2="SourceAlpha" operator="in" result="colored" />
          <feGaussianBlur in="colored" stdDeviation={18} result="blur-wide" />
          <feGaussianBlur in="colored" stdDeviation={6} result="blur-tight" />
          <feMerge>
            <feMergeNode in="blur-wide" />
            <feMergeNode in="blur-wide" />
            <feMergeNode in="blur-tight" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      ))}
    </defs>
  )
}

/**
 * A self-contained thumbnail of a frame, with a stand-in QR block.
 *
 * Lives here rather than in the picker so that every way a frame can appear on
 * screen goes through the same scene builder — a thumbnail can't drift from the
 * preview, and the preview can't drift from the download.
 */
export function FrameThumb({
  frameStyle,
  color,
  text,
  px = 76,
}: {
  frameStyle: string
  color: string
  text: string
  px?: number
}) {
  const uid = useId().replace(/:/g, "")
  const scene = buildFrameScene(frameStyle, { color, text })
  const assetSrc = useFrameAssetSrc(scene, color)
  const { geom } = scene
  const scale = px / Math.max(geom.canvasW, geom.canvasH)
  const w = geom.canvasW * scale
  const h = geom.canvasH * scale
  const svgStyle: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%" }

  return (
    <div style={{ position: "relative", width: w, height: h }}>
      {assetSrc && (
        <img src={assetSrc} alt="" draggable={false} style={{ width: "100%", height: "100%", display: "block" }} />
      )}
      <svg viewBox={`0 0 ${geom.canvasW} ${geom.canvasH}`} style={svgStyle} aria-hidden="true">
        <defs>
          {/* Coarse checker so the thumbnail reads as a QR without rendering one */}
          <pattern id={`qrph-${uid}`} width="90" height="90" patternUnits="userSpaceOnUse">
            <rect width="90" height="90" fill="#ffffff" />
            <rect width="45" height="45" fill="#18181b" />
            <rect x="45" y="45" width="45" height="45" fill="#18181b" />
          </pattern>
        </defs>
        <DefsSvg scene={scene} />
        {scene.bg && <ElSvg el={scene.bg} />}
        {scene.behind.map((el, i) => <ElSvg key={i} el={el} />)}
        <rect x={geom.qrX} y={geom.qrY} width={geom.QR} height={geom.QR} fill={`url(#qrph-${uid})`} />
        {scene.front.map((el, i) => <ElSvg key={i} el={el} />)}
      </svg>
    </div>
  )
}

/**
 * Resolve the <img> source for an asset frame.
 *
 * Non-tintable artwork uses its own URL — instant, and browser-cached across
 * every preview. Tintable artwork has to be fetched so `currentColor` can be
 * replaced with the user's colour, so it arrives a tick later as a data URI.
 */
function useFrameAssetSrc(scene: FrameScene, tint: string): string | undefined {
  const asset = scene.asset
  const url = asset?.url
  const tintable = asset?.tintable ?? false
  const [tinted, setTinted] = useState<string>()

  useEffect(() => {
    if (!asset || !asset.tintable) { setTinted(undefined); return }
    let alive = true
    loadFrameAsset(asset, tint)
      .then((r) => { if (alive) setTinted(r.dataUri) })
      .catch(() => { if (alive) setTinted(undefined) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, tintable, tint])

  if (!url) return undefined
  return tintable ? tinted : url
}

/**
 * Live preview that renders the SAME scene the export does. The QR itself is NOT
 * drawn here — the caller's live qr-code-styling element is overlaid in the gap,
 * so it stays reactive to colour/dot changes. Structure is constant across frame
 * styles so the child (the qrRef div) never unmounts.
 */
export function FramePreview({
  frameStyle,
  color,
  text,
  textColor,
  qrPx,
  children,
}: {
  frameStyle: string
  color: string
  text: string
  textColor?: string
  qrPx: number
  children: React.ReactNode
}) {
  const scene = buildFrameScene(frameStyle, { color, text, textColor })
  const assetSrc = useFrameAssetSrc(scene, color)
  const { geom } = scene
  const scale = qrPx / geom.QR
  const boxW = geom.canvasW * scale
  const boxH = geom.canvasH * scale

  const svgStyle: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }

  return (
    <div style={{ position: "relative", width: boxW, height: boxH }}>
      {/* Artwork layer for asset frames. The wrapper is ALWAYS rendered so the
          sibling order — and therefore the QR child below — never remounts. */}
      <div style={{ position: "absolute", inset: 0 }}>
        {assetSrc && (
          <img src={assetSrc} alt="" draggable={false} style={{ width: "100%", height: "100%", display: "block" }} />
        )}
      </div>

      {/* Behind layer: background + under-QR elements */}
      <svg viewBox={`0 0 ${geom.canvasW} ${geom.canvasH}`} style={svgStyle} aria-hidden="true">
        <DefsSvg scene={scene} />
        {scene.bg && <ElSvg el={scene.bg} />}
        {scene.behind.map((el, i) => <ElSvg key={i} el={el} />)}
      </svg>

      {/* The live QR, positioned in the scene's QR slot. Always rendered so it never remounts. */}
      <div style={{ position: "absolute", left: geom.qrX * scale, top: geom.qrY * scale, width: geom.QR * scale, height: geom.QR * scale }}>
        {children}
      </div>

      {/* Front layer: labels, brackets — drawn over the QR */}
      <svg viewBox={`0 0 ${geom.canvasW} ${geom.canvasH}`} style={svgStyle} aria-hidden="true">
        <DefsSvg scene={scene} />
        {scene.front.map((el, i) => <ElSvg key={i} el={el} />)}
      </svg>
    </div>
  )
}
