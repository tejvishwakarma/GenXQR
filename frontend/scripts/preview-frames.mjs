/**
 * Renders every frame in the catalog to a single HTML contact sheet.
 *
 * WHY
 * After dropping a batch of new frame SVGs into public/frames/, the build only
 * tells you they are *valid* — not that they *look* right. Slot misalignment,
 * artwork drifting under the QR, a text slot sitting on a busy part of the
 * illustration: all of those pass validation and only show up visually.
 *
 * This composites each frame through the SAME renderer the real download uses
 * (sceneToSvgDocument), with a stand-in checkerboard for the QR, so what you see
 * here is what a customer downloads.
 *
 *   pnpm frames:preview   →   writes .frames-preview.html, open it in a browser
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const OUT = path.join(ROOT, ".frames-preview.html")

let esbuild
try {
  esbuild = await import("esbuild")
} catch {
  console.error("\npreview-frames: esbuild not found — run `pnpm install` first.\n")
  process.exit(1)
}

// The engine is TSX, so transpile it to something Node can require. React is
// external because only the pure scene/SVG functions are used here.
const tmp = path.join(ROOT, ".frames-preview.cjs")
esbuild.buildSync({
  entryPoints: [path.join(ROOT, "src", "lib", "qr-frames.tsx")],
  bundle: true,
  external: ["react"],
  format: "cjs",
  outfile: tmp,
  jsx: "automatic",
  logLevel: "error",
})

const { createRequire } = await import("node:module")
const require_ = createRequire(import.meta.url)
const engine = require_(tmp)

// Stand-in QR: coarse checker plus one finder pattern, so alignment and scale
// are obvious at a glance without generating a real code.
let qr = '<rect width="900" height="900" fill="white"/>'
for (let r = 0; r < 18; r++) {
  for (let c = 0; c < 18; c++) {
    if ((r + c) % 2 === 0) qr += `<rect x="${c * 50}" y="${r * 50}" width="50" height="50" fill="#111"/>`
  }
}
qr += '<rect width="120" height="120" fill="white"/><rect x="15" y="15" width="90" height="90" fill="#111"/>'

const COLOR = process.env.FRAME_PREVIEW_COLOR || "#6d28d9"
const TEXT = process.env.FRAME_PREVIEW_TEXT || "SCAN ME"

const groups = new Map()
let assetCount = 0

for (const opt of engine.FRAME_OPTIONS) {
  const scene = engine.buildFrameScene(opt.id, { color: COLOR, text: TEXT })

  let assetInner
  if (scene.asset) {
    assetCount++
    const file = path.join(ROOT, "public", scene.asset.url.replace(/^\//, ""))
    const raw = fs.readFileSync(file, "utf8")
    const doc = scene.asset.tintable ? raw.split("currentColor").join(COLOR) : raw
    assetInner = doc.replace(/^[\s\S]*?<svg\b[^>]*>/i, "").replace(/<\/svg>\s*$/i, "")
  }

  const svg = engine.sceneToSvgDocument(scene, qr, assetInner)
  const g = scene.geom
  const meta = `${g.canvasW}×${g.canvasH} · slot ${g.QR}px (${Math.round((g.QR / Math.min(g.canvasW, g.canvasH)) * 100)}%)`

  const cell = `<figure>
    <div class="box">${svg}</div>
    <figcaption><b>${opt.label}</b><span>${opt.id}</span><span class="m">${meta}</span></figcaption>
  </figure>`

  if (!groups.has(opt.category)) groups.set(opt.category, [])
  groups.get(opt.category).push(cell)
}

fs.unlinkSync(tmp)

const sections = [...groups.entries()]
  .map(([cat, cells]) => `<h2>${cat} <em>${cells.length}</em></h2><div class="grid">${cells.join("")}</div>`)
  .join("")

const html = `<!doctype html><meta charset="utf-8"><title>GenXQR frame catalog</title>
<style>
  :root{color-scheme:dark}
  body{background:#0b0b12;color:#c9c9d4;margin:0;padding:28px;font:13px/1.5 system-ui,sans-serif}
  header{margin-bottom:24px}
  h1{font-size:18px;margin:0 0 4px}
  p{margin:0;color:#7c7c8c}
  h2{font-size:12px;text-transform:uppercase;letter-spacing:.09em;color:#a78bfa;margin:30px 0 10px;border-bottom:1px solid #23233a;padding-bottom:6px}
  h2 em{color:#5b5b70;font-style:normal;margin-left:6px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:16px}
  figure{margin:0}
  .box{background:#16161f;border:1px solid #23233a;border-radius:12px;padding:10px;height:160px;display:flex;align-items:center;justify-content:center}
  .box svg{max-width:100%;max-height:140px;height:auto}
  figcaption{margin-top:6px;display:flex;flex-direction:column;gap:1px;text-align:center}
  figcaption b{color:#e4e4ee;font-weight:600;font-size:12px}
  figcaption span{color:#6b6b7e;font-size:10px;font-family:ui-monospace,monospace}
  figcaption .m{color:#4d4d5e}
</style>
<header>
  <h1>Frame catalog — ${engine.FRAME_OPTIONS.length} frames, ${groups.size} categories</h1>
  <p>${assetCount} illustrated (SVG asset) · ${engine.FRAME_OPTIONS.length - assetCount} code-drawn · rendered through the real export renderer · colour ${COLOR}</p>
</header>
${sections}`

fs.writeFileSync(OUT, html, "utf8")
console.log(
  `frames:preview — ${engine.FRAME_OPTIONS.length} frames (${assetCount} illustrated) in ${groups.size} categories\n` +
    `                 open ${path.relative(process.cwd(), OUT)}`,
)
