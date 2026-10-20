/**
 * Every QR download in the dashboard goes through here: the detail page, the
 * per-row download menu in the code lists, and bulk "Download selected".
 *
 * Until 20 Oct 2026 the list menu and bulk download built their own plain
 * qr-code-styling image, so a code downloaded from the list came out without
 * its frame — library or classic — while the same code's detail page included
 * it. One renderer means one result wherever the button is.
 */
import QRCodeStyling, { type CornerSquareType, type DotType } from "qr-code-styling"
import jsPDF from "jspdf"
import { svg2pdf } from "svg2pdf.js"
import { getQrBaseUrl, type QRCode } from "@/lib/api"
import { getFrame, renderFramed, type FrameFields } from "@/lib/frames/compose"

export type QRDownloadExt = "png" | "svg" | "pdf" | "jpeg" | "webp"

/** The file for one code in one format: its saved design, frame included. */
export async function renderQRDownload(qr: QRCode, ext: QRDownloadExt): Promise<{ blob: Blob; filename: string }> {
  const d = qr.design
  const base = qr.name.replace(/[^a-z0-9_-]/gi, "_")
  const filename = `${base}.${ext === "jpeg" ? "jpg" : ext}`
  const frameStyle = d?.frameStyle ?? "none"
  const primaryColor = d?.primaryColor ?? "#7c3aed"
  const sharedOpts = {
    data: `${getQrBaseUrl()}/r/${qr.slug}`,
    dotsOptions: { color: primaryColor, type: (d?.dotStyle ?? "rounded") as DotType },
    cornersSquareOptions: { color: primaryColor, type: (d?.cornerSquareStyle ?? "square") as CornerSquareType },
    cornersDotOptions: { color: primaryColor },
    backgroundOptions: { color: d?.backgroundColor ?? "#ffffff" },
    image: d?.logoUrl ?? undefined,
    imageOptions: { hideBackgroundDots: true, imageSize: (d?.logoSize ?? 35) / 100, margin: 8, crossOrigin: "anonymous" },
    qrOptions: { errorCorrectionLevel: "H" as const },
  }

  const libraryFrame = getFrame(frameStyle)
  if (libraryFrame) {
    const blob = await renderFramed(
      {
        entry: libraryFrame,
        qr: sharedOpts,
        color: d?.frameColor,
        fields: (d?.frameFields ?? null) as FrameFields | null,
        background: d?.backgroundColor,
      },
      ext,
    )
    return { blob, filename }
  }

  // The API field is `frameColor` (matching the Prisma model). An older reader
  // used `frameBgColor`, which is never present, so every frame downloaded in
  // the #1f2937 fallback instead of the colour the user chose.
  const frameBgColor = d?.frameColor || "#1f2937"
  const frameText = d?.frameText || "SCAN ME"

  let blob: Blob | null
  if (ext === "svg" || ext === "pdf") {
    const inst = new QRCodeStyling({ ...sharedOpts, width: 900, height: 900, type: "svg", margin: 30 })
    blob = ext === "svg"
      ? await renderClassicSvg(inst, frameStyle, frameBgColor, frameText)
      : await renderClassicPdf(inst, frameStyle, frameBgColor, frameText)
  } else {
    const inst = new QRCodeStyling({ ...sharedOpts, width: 900, height: 900, type: "canvas", margin: 30 })
    blob = await renderClassicRaster(inst, frameStyle, frameBgColor, frameText, ext)
  }
  if (!blob) throw new Error("could not render the QR code")
  return { blob, filename }
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function downloadQR(qr: QRCode, ext: QRDownloadExt) {
  const { blob, filename } = await renderQRDownload(qr, ext)
  saveBlob(blob, filename)
}

// ─── Classic frames ───────────────────────────────────────────────────────────
// The CSS frames retired from the picker on 20 Oct 2026, still saved on older
// codes. Moved here unchanged from QRDetailPage, except that each renderer now
// returns the file instead of clicking a link, so bulk download can zip it.

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** Shared layout geometry for both raster and SVG frame renderers. */
function frameGeometry(frameStyle: string) {
  const QR      = 900
  const PAD     = 30
  const LABEL_H = 72
  const EXTRA   = 60

  const hasTopLabel = frameStyle === "top-label" || frameStyle === "both-labels"
  const hasBotLabel = frameStyle === "simple"    || frameStyle === "both-labels"
  const hasBanner   = frameStyle === "banner"
  const hasScanNow  = frameStyle === "scan-now"
  const hasCorners  = frameStyle === "corners"

  const topH = hasTopLabel ? LABEL_H : 0
  const botH = (hasBotLabel || hasBanner || hasScanNow) ? LABEL_H : 0
  const xPad = PAD + (hasCorners ? EXTRA : 0)
  const yPad = PAD + (hasCorners ? EXTRA : 0)

  const canvasW = QR + xPad * 2
  const canvasH = QR + yPad * 2 + topH + botH
  const qrX     = xPad
  const qrY     = yPad + topH

  return { QR, PAD, LABEL_H, EXTRA, hasTopLabel, hasBotLabel, hasBanner, hasScanNow, hasCorners, topH, botH, xPad, yPad, canvasW, canvasH, qrX, qrY }
}

async function renderClassicRaster(
  qrInst: QRCodeStyling,
  frameStyle: string,
  frameBgColor: string,
  frameText: string,
  ext: "png" | "jpeg" | "webp",
): Promise<Blob | null> {
  const { QR, LABEL_H, EXTRA, hasTopLabel, hasBotLabel, hasBanner, hasScanNow, hasCorners, topH, canvasW, canvasH, qrX, qrY } = frameGeometry(frameStyle)

  const rawBlob = await qrInst.getRawData("png")
  if (!rawBlob) return null
  const rawUrl = URL.createObjectURL(rawBlob as Blob)

  try {
    const qrImg = await loadImg(rawUrl)
    const canvas = document.createElement("canvas")
    canvas.width  = canvasW
    canvas.height = canvasH
    const ctx = canvas.getContext("2d")!

    // ── Background / card fill ──────────────────────────────────────────────
    if (frameStyle === "card" || frameStyle === "banner") {
      ctx.fillStyle = "#ffffff"
      ctx.beginPath()
      ctx.roundRect(0, 0, canvasW, canvasH, 28)
      ctx.fill()
    }

    // ── Neon / glow effects ─────────────────────────────────────────────────
    const glowMap: Record<string, [string, string]> = {
      "speech-bubble": ["rgba(124,58,237,0.7)",  "#7c3aed"],
      "neon-violet":   ["rgba(139,92,246,0.65)", "#8b5cf6"],
      "neon-blue":     ["rgba(59,130,246,0.65)", "#60a5fa"],
      "neon-pink":     ["rgba(236,72,153,0.65)", "#f472b6"],
    }
    if (glowMap[frameStyle]) {
      const [shadowColor, strokeColor] = glowMap[frameStyle]
      ctx.save()
      ctx.shadowColor = shadowColor
      ctx.shadowBlur  = 40
      ctx.strokeStyle = strokeColor
      ctx.lineWidth   = 8
      ctx.beginPath()
      ctx.roundRect(qrX - 8, qrY - 8, QR + 16, QR + 16, 14)
      ctx.stroke()
      ctx.restore()
    }

    // ── Border-only frames ──────────────────────────────────────────────────
    if (frameStyle === "box") {
      ctx.strokeStyle = "rgba(255,255,255,0.5)"
      ctx.lineWidth   = 8
      ctx.beginPath(); ctx.roundRect(qrX - 10, qrY - 10, QR + 20, QR + 20, 14); ctx.stroke()
    } else if (frameStyle === "thick-border") {
      ctx.strokeStyle = "#ffffff"
      ctx.lineWidth   = 22
      ctx.beginPath(); ctx.roundRect(qrX - 15, qrY - 15, QR + 30, QR + 30, 22); ctx.stroke()
    } else if (frameStyle === "dashed") {
      ctx.strokeStyle = "rgba(255,255,255,0.65)"
      ctx.lineWidth   = 8
      ctx.setLineDash([26, 13])
      ctx.beginPath(); ctx.roundRect(qrX - 10, qrY - 10, QR + 20, QR + 20, 14); ctx.stroke()
      ctx.setLineDash([])
    } else if (frameStyle === "double") {
      ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 8
      ctx.beginPath(); ctx.roundRect(qrX - 10, qrY - 10, QR + 20, QR + 20, 14); ctx.stroke()
      ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 8
      ctx.beginPath(); ctx.roundRect(qrX - 26, qrY - 26, QR + 52, QR + 52, 24); ctx.stroke()
    }

    // ── Top label ───────────────────────────────────────────────────────────
    if (hasTopLabel) {
      const ly = qrY - topH
      ctx.fillStyle = frameBgColor
      ctx.beginPath(); ctx.roundRect(qrX, ly, QR, LABEL_H, [10, 10, 0, 0]); ctx.fill()
      ctx.fillStyle = "#ffffff"
      ctx.font = "bold 34px system-ui, sans-serif"
      ctx.textAlign = "center"; ctx.textBaseline = "middle"
      ctx.fillText(frameText || "SCAN ME", qrX + QR / 2, ly + LABEL_H / 2)
    }

    // ── QR code ─────────────────────────────────────────────────────────────
    ctx.drawImage(qrImg, qrX, qrY, QR, QR)

    // ── Corner brackets (drawn over QR) ─────────────────────────────────────
    if (hasCorners) {
      const bs = EXTRA - 10
      ctx.strokeStyle = "#ffffff"
      ctx.lineWidth   = 9
      ctx.lineCap     = "square"
      const x0 = qrX, y0 = qrY, x1 = qrX + QR, y1 = qrY + QR
      ctx.beginPath()
      ctx.moveTo(x0, y0 + bs); ctx.lineTo(x0, y0); ctx.lineTo(x0 + bs, y0)
      ctx.moveTo(x1 - bs, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + bs)
      ctx.moveTo(x0, y1 - bs); ctx.lineTo(x0, y1); ctx.lineTo(x0 + bs, y1)
      ctx.moveTo(x1 - bs, y1); ctx.lineTo(x1, y1); ctx.lineTo(x1, y1 - bs)
      ctx.stroke()
    }

    // ── Bottom label / banner / scan-now ────────────────────────────────────
    const ly = qrY + QR
    if (hasBotLabel) {
      ctx.fillStyle = frameBgColor
      ctx.beginPath(); ctx.roundRect(qrX, ly, QR, LABEL_H, [0, 0, 10, 10]); ctx.fill()
      ctx.fillStyle = "#ffffff"
      ctx.font = "bold 34px system-ui, sans-serif"
      ctx.textAlign = "center"; ctx.textBaseline = "middle"
      ctx.fillText(frameText || "SCAN ME", qrX + QR / 2, ly + LABEL_H / 2)
    } else if (hasBanner) {
      // Place banner flush at the bottom; yPad above it acts as the gap (matches the mt-3 in the HTML preview)
      const bannerY = canvasH - LABEL_H
      ctx.fillStyle = frameBgColor
      ctx.beginPath(); ctx.roundRect(0, bannerY, canvasW, LABEL_H, [0, 0, 28, 28]); ctx.fill()
      ctx.fillStyle = "#ffffff"
      ctx.font = "bold 34px system-ui, sans-serif"
      ctx.textAlign = "center"; ctx.textBaseline = "middle"
      ctx.fillText(`${frameText || "SCAN ME"} →`, canvasW / 2, bannerY + LABEL_H / 2)
    } else if (hasScanNow) {
      // Pill badge below the QR
      const text = `↓  ${frameText || "SCAN NOW"}  ↓`
      ctx.font = "bold 30px system-ui, sans-serif"
      ctx.textAlign = "center"; ctx.textBaseline = "middle"
      const textW = ctx.measureText(text).width
      const pillW = textW + 48, pillH = 52, pillX = canvasW / 2 - pillW / 2, pillY = ly + (LABEL_H - pillH) / 2
      ctx.fillStyle = frameBgColor
      ctx.beginPath(); ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2); ctx.fill()
      ctx.fillStyle = "#ffffff"
      ctx.fillText(text, canvasW / 2, ly + LABEL_H / 2)
    }

    // ── Export ───────────────────────────────────────────────────────────────
    const mime = ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png"
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.95))
  } finally {
    URL.revokeObjectURL(rawUrl)
  }
}

/**
 * Build a fully vector SVG.
 * The QR code paths are inlined directly as a nested <svg> element so every
 * dot/corner is an editable vector shape in Illustrator, Inkscape, etc.
 */
async function renderClassicSvg(
  qrInst: QRCodeStyling,
  frameStyle: string,
  frameBgColor: string,
  frameText: string,
): Promise<Blob | null> {
  const rawBlob = await qrInst.getRawData("svg")
  if (!rawBlob) return null

  // Parse the raw QR SVG and extract its inner markup (all child nodes of <svg>)
  const svgText  = await (rawBlob as Blob).text()
  const parser   = new DOMParser()
  const qrDoc    = parser.parseFromString(svgText, "image/svg+xml")
  const qrRoot   = qrDoc.documentElement
  // Serialize inner content — these are the actual vector paths
  const qrInner  = Array.from(qrRoot.childNodes)
    .map(n => new XMLSerializer().serializeToString(n))
    .join("")

  const { QR, LABEL_H, EXTRA, hasTopLabel, hasBotLabel, hasBanner, hasScanNow, hasCorners, topH, canvasW, canvasH, qrX, qrY } = frameGeometry(frameStyle)

  const p: string[] = []
  p.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${canvasW} ${canvasH}" width="${canvasW}" height="${canvasH}">`)

  // ── Defs ──────────────────────────────────────────────────────────────────
  const neonColors: Record<string, string> = {
    "neon-violet": "#8b5cf6", "neon-blue": "#60a5fa", "neon-pink": "#f472b6",
  }
  const needsGlow = frameStyle in neonColors
  if (needsGlow) {
    const color = neonColors[frameStyle]
    // Multi-pass glow: flood the neon color → clip to stroke alpha → blur at two
    // radii → merge layers behind the crisp stroke (matches CSS box-shadow spread).
    p.push(`<defs>`)
    p.push(`  <filter id="neon-glow" x="-80%" y="-80%" width="260%" height="260%" color-interpolation-filters="sRGB">`)
    p.push(`    <!-- colorise the stroke with the neon hue -->`)
    p.push(`    <feFlood flood-color="${color}" flood-opacity="1" result="flood"/>`)
    p.push(`    <feComposite in="flood" in2="SourceAlpha" operator="in" result="colored"/>`)
    p.push(`    <!-- wide soft halo -->`)
    p.push(`    <feGaussianBlur in="colored" stdDeviation="18" result="blur-wide"/>`)
    p.push(`    <!-- tight inner core -->`)
    p.push(`    <feGaussianBlur in="colored" stdDeviation="6"  result="blur-tight"/>`)
    p.push(`    <!-- stack: wide halo → tight core → original stroke on top -->`)
    p.push(`    <feMerge>`)
    p.push(`      <feMergeNode in="blur-wide"/>`)
    p.push(`      <feMergeNode in="blur-wide"/>`)
    p.push(`      <feMergeNode in="blur-tight"/>`)
    p.push(`      <feMergeNode in="SourceGraphic"/>`)
    p.push(`    </feMerge>`)
    p.push(`  </filter>`)
    p.push(`</defs>`)
    p.push(`<rect x="${qrX-8}" y="${qrY-8}" width="${QR+16}" height="${QR+16}" rx="14" fill="none" stroke="${color}" stroke-width="8" filter="url(#neon-glow)"/>`)
  }

  // ── Card / banner white background ────────────────────────────────────────
  if (frameStyle === "card" || frameStyle === "banner") {
    p.push(`<rect width="${canvasW}" height="${canvasH}" rx="28" fill="white"/>`)
  }

  // ── Speech-bubble border ──────────────────────────────────────────────────
  if (frameStyle === "speech-bubble") {
    p.push(`<rect x="${qrX-8}" y="${qrY-8}" width="${QR+16}" height="${QR+16}" rx="14" fill="none" stroke="#7c3aed" stroke-width="8"/>`)
  }

  // ── Border-only frames ────────────────────────────────────────────────────
  if (frameStyle === "box") {
    p.push(`<rect x="${qrX-10}" y="${qrY-10}" width="${QR+20}" height="${QR+20}" rx="14" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="8"/>`)
  } else if (frameStyle === "thick-border") {
    p.push(`<rect x="${qrX-15}" y="${qrY-15}" width="${QR+30}" height="${QR+30}" rx="22" fill="none" stroke="white" stroke-width="22"/>`)
  } else if (frameStyle === "dashed") {
    p.push(`<rect x="${qrX-10}" y="${qrY-10}" width="${QR+20}" height="${QR+20}" rx="14" fill="none" stroke="rgba(255,255,255,0.65)" stroke-width="8" stroke-dasharray="26 13"/>`)
  } else if (frameStyle === "double") {
    p.push(`<rect x="${qrX-10}" y="${qrY-10}" width="${QR+20}" height="${QR+20}" rx="14" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="8"/>`)
    p.push(`<rect x="${qrX-26}" y="${qrY-26}" width="${QR+52}" height="${QR+52}" rx="24" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="8"/>`)
  }

  // ── Top label ─────────────────────────────────────────────────────────────
  if (hasTopLabel) {
    const labelY = qrY - topH
    p.push(`<rect x="${qrX}" y="${labelY}" width="${QR}" height="${LABEL_H}" rx="10" fill="${frameBgColor}"/>`)
    p.push(`<text x="${qrX + QR / 2}" y="${labelY + LABEL_H / 2}" text-anchor="middle" dominant-baseline="central" fill="white" font-size="32" font-weight="bold" font-family="system-ui,sans-serif" letter-spacing="6">${frameText || "SCAN ME"}</text>`)
  }

  // ── QR code — inlined as a nested <svg> so all paths remain editable vectors
  p.push(`<svg x="${qrX}" y="${qrY}" width="${QR}" height="${QR}" viewBox="0 0 ${QR} ${QR}">`)
  p.push(qrInner)
  p.push(`</svg>`)

  // ── Corner brackets ───────────────────────────────────────────────────────
  if (hasCorners) {
    const bs = EXTRA - 10
    const x0 = qrX, y0 = qrY, x1 = qrX + QR, y1 = qrY + QR
    p.push(`<g fill="none" stroke="white" stroke-width="9" stroke-linecap="square">`)
    p.push(`  <polyline points="${x0},${y0+bs} ${x0},${y0} ${x0+bs},${y0}"/>`)
    p.push(`  <polyline points="${x1-bs},${y0} ${x1},${y0} ${x1},${y0+bs}"/>`)
    p.push(`  <polyline points="${x0},${y1-bs} ${x0},${y1} ${x0+bs},${y1}"/>`)
    p.push(`  <polyline points="${x1-bs},${y1} ${x1},${y1} ${x1},${y1-bs}"/>`)
    p.push(`</g>`)
  }

  // ── Bottom label / banner / scan-now ──────────────────────────────────────
  const botLabelY = qrY + QR
  if (hasBotLabel) {
    p.push(`<rect x="${qrX}" y="${botLabelY}" width="${QR}" height="${LABEL_H}" rx="10" fill="${frameBgColor}"/>`)
    p.push(`<text x="${qrX + QR / 2}" y="${botLabelY + LABEL_H / 2}" text-anchor="middle" dominant-baseline="central" fill="white" font-size="32" font-weight="bold" font-family="system-ui,sans-serif" letter-spacing="6">${frameText || "SCAN ME"}</text>`)
  } else if (hasBanner) {
    const bannerY = canvasH - LABEL_H
    p.push(`<rect x="0" y="${bannerY}" width="${canvasW}" height="${LABEL_H}" fill="${frameBgColor}"/>`)
    p.push(`<text x="${canvasW / 2}" y="${bannerY + LABEL_H / 2}" text-anchor="middle" dominant-baseline="central" fill="white" font-size="32" font-weight="bold" font-family="system-ui,sans-serif" letter-spacing="6">${frameText || "SCAN ME"} →</text>`)
  } else if (hasScanNow) {
    const pillH = 52, pillW = 420, pillX = canvasW / 2 - pillW / 2, pillY = botLabelY + (LABEL_H - pillH) / 2
    p.push(`<rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${frameBgColor}"/>`)
    p.push(`<text x="${canvasW / 2}" y="${botLabelY + LABEL_H / 2}" text-anchor="middle" dominant-baseline="central" fill="white" font-size="28" font-weight="bold" font-family="system-ui,sans-serif" letter-spacing="5">↓  ${frameText || "SCAN NOW"}  ↓</text>`)
  }

  p.push(`</svg>`)

  return new Blob([p.join("\n")], { type: "image/svg+xml" })
}

// ─── PDF export (fully editable vectors via jsPDF + svg2pdf.js) ──────────────
/**
 * Builds the same SVG as downloadSVGWithFrame, then passes it through
 * svg2pdf.js which converts every SVG element — including the nested <svg>
 * that contains the inlined QR dot paths — into native PDF vector operations.
 * The result is a PDF where every dot, label, and frame shape is independently
 * selectable and editable in Illustrator, Inkscape, Affinity Designer, etc.
 */
async function renderClassicPdf(
  qrInst: QRCodeStyling,
  frameStyle: string,
  frameBgColor: string,
  frameText: string,
): Promise<Blob | null> {
  const rawBlob = await qrInst.getRawData("svg")
  if (!rawBlob) return null

  const svgText = await (rawBlob as Blob).text()
  const parser  = new DOMParser()
  const qrDoc   = parser.parseFromString(svgText, "image/svg+xml")
  const qrRoot  = qrDoc.documentElement
  const qrInner = Array.from(qrRoot.childNodes)
    .map(n => new XMLSerializer().serializeToString(n))
    .join("")

  const { QR, LABEL_H, EXTRA, hasTopLabel, hasBotLabel, hasBanner, hasScanNow, hasCorners, topH, canvasW, canvasH, qrX, qrY } = frameGeometry(frameStyle)

  // Build the SVG string (same logic as downloadSVGWithFrame)
  const p: string[] = []
  p.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasW} ${canvasH}" width="${canvasW}" height="${canvasH}">`)

  const neonColors: Record<string, string> = {
    "neon-violet": "#8b5cf6", "neon-blue": "#60a5fa", "neon-pink": "#f472b6",
  }
  if (frameStyle in neonColors) {
    const color = neonColors[frameStyle]
    p.push(`<defs><filter id="neon-glow" x="-80%" y="-80%" width="260%" height="260%" color-interpolation-filters="sRGB">`)
    p.push(`  <feFlood flood-color="${color}" flood-opacity="1" result="flood"/>`)
    p.push(`  <feComposite in="flood" in2="SourceAlpha" operator="in" result="colored"/>`)
    p.push(`  <feGaussianBlur in="colored" stdDeviation="18" result="blur-wide"/>`)
    p.push(`  <feGaussianBlur in="colored" stdDeviation="6"  result="blur-tight"/>`)
    p.push(`  <feMerge><feMergeNode in="blur-wide"/><feMergeNode in="blur-wide"/><feMergeNode in="blur-tight"/><feMergeNode in="SourceGraphic"/></feMerge>`)
    p.push(`</filter></defs>`)
    p.push(`<rect x="${qrX-8}" y="${qrY-8}" width="${QR+16}" height="${QR+16}" rx="14" fill="none" stroke="${color}" stroke-width="8" filter="url(#neon-glow)"/>`)
  }
  if (frameStyle === "card" || frameStyle === "banner") p.push(`<rect width="${canvasW}" height="${canvasH}" rx="28" fill="white"/>`)
  if (frameStyle === "speech-bubble") p.push(`<rect x="${qrX-8}" y="${qrY-8}" width="${QR+16}" height="${QR+16}" rx="14" fill="none" stroke="#7c3aed" stroke-width="8"/>`)
  if (frameStyle === "box")          p.push(`<rect x="${qrX-10}" y="${qrY-10}" width="${QR+20}" height="${QR+20}" rx="14" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="8"/>`)
  if (frameStyle === "thick-border") p.push(`<rect x="${qrX-15}" y="${qrY-15}" width="${QR+30}" height="${QR+30}" rx="22" fill="none" stroke="white" stroke-width="22"/>`)
  if (frameStyle === "dashed")       p.push(`<rect x="${qrX-10}" y="${qrY-10}" width="${QR+20}" height="${QR+20}" rx="14" fill="none" stroke="rgba(255,255,255,0.65)" stroke-width="8" stroke-dasharray="26 13"/>`)
  if (frameStyle === "double") {
    p.push(`<rect x="${qrX-10}" y="${qrY-10}" width="${QR+20}" height="${QR+20}" rx="14" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="8"/>`)
    p.push(`<rect x="${qrX-26}" y="${qrY-26}" width="${QR+52}" height="${QR+52}" rx="24" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="8"/>`)
  }
  if (hasTopLabel) {
    const labelY = qrY - topH
    p.push(`<rect x="${qrX}" y="${labelY}" width="${QR}" height="${LABEL_H}" rx="10" fill="${frameBgColor}"/>`)
    p.push(`<text x="${qrX + QR/2}" y="${labelY + LABEL_H/2}" text-anchor="middle" dominant-baseline="central" fill="white" font-size="32" font-weight="bold" font-family="system-ui,sans-serif" letter-spacing="6">${frameText || "SCAN ME"}</text>`)
  }
  // Inline QR as nested <svg> — svg2pdf.js recurses into nested SVGs
  p.push(`<svg x="${qrX}" y="${qrY}" width="${QR}" height="${QR}" viewBox="0 0 ${QR} ${QR}">${qrInner}</svg>`)
  if (hasCorners) {
    const bs = EXTRA - 10, x0 = qrX, y0 = qrY, x1 = qrX+QR, y1 = qrY+QR
    p.push(`<g fill="none" stroke="white" stroke-width="9" stroke-linecap="square">`)
    p.push(`  <polyline points="${x0},${y0+bs} ${x0},${y0} ${x0+bs},${y0}"/>`)
    p.push(`  <polyline points="${x1-bs},${y0} ${x1},${y0} ${x1},${y0+bs}"/>`)
    p.push(`  <polyline points="${x0},${y1-bs} ${x0},${y1} ${x0+bs},${y1}"/>`)
    p.push(`  <polyline points="${x1-bs},${y1} ${x1},${y1} ${x1},${y1-bs}"/>`)
    p.push(`</g>`)
  }
  const botY = qrY + QR
  if (hasBotLabel) {
    p.push(`<rect x="${qrX}" y="${botY}" width="${QR}" height="${LABEL_H}" rx="10" fill="${frameBgColor}"/>`)
    p.push(`<text x="${qrX+QR/2}" y="${botY+LABEL_H/2}" text-anchor="middle" dominant-baseline="central" fill="white" font-size="32" font-weight="bold" font-family="system-ui,sans-serif" letter-spacing="6">${frameText || "SCAN ME"}</text>`)
  } else if (hasBanner) {
    const bannerY = canvasH - LABEL_H
    p.push(`<rect x="0" y="${bannerY}" width="${canvasW}" height="${LABEL_H}" fill="${frameBgColor}"/>`)
    p.push(`<text x="${canvasW/2}" y="${bannerY+LABEL_H/2}" text-anchor="middle" dominant-baseline="central" fill="white" font-size="32" font-weight="bold" font-family="system-ui,sans-serif" letter-spacing="6">${frameText || "SCAN ME"} \u00BB</text>`)
  } else if (hasScanNow) {
    const pillH = 52, pillW = 420, pillX = canvasW/2 - pillW/2, pillY = botY + (LABEL_H - pillH) / 2
    p.push(`<rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH/2}" fill="${frameBgColor}"/>`)
    p.push(`<text x="${canvasW/2}" y="${botY+LABEL_H/2}" text-anchor="middle" dominant-baseline="central" fill="white" font-size="28" font-weight="bold" font-family="system-ui,sans-serif" letter-spacing="5">↓  ${frameText || "SCAN NOW"}  ↓</text>`)
  }
  p.push(`</svg>`)

  // Parse SVG string into a real DOM element so svg2pdf.js can walk its nodes
  const svgDoc = parser.parseFromString(p.join("\n"), "image/svg+xml")
  const svgEl  = svgDoc.documentElement as unknown as SVGSVGElement

  // Points per pixel at 96 DPI (PDF uses pt, browser SVG uses px)
  const PX_TO_PT = 72 / 96
  const pdfW = canvasW * PX_TO_PT
  const pdfH = canvasH * PX_TO_PT

  const pdf = new jsPDF({
    orientation: pdfW > pdfH ? "landscape" : "portrait",
    unit: "pt",
    format: [pdfW, pdfH],
  })

  await svg2pdf(svgEl, pdf, { x: 0, y: 0, width: pdfW, height: pdfH })
  return pdf.output("blob")
}
