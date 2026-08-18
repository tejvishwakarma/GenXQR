import { useEffect, useRef, useCallback, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import QRCodeStyling from "qr-code-styling"
import jsPDF from "jspdf"
import { svg2pdf } from "svg2pdf.js"
import {
  ArrowLeft, BarChart3, Edit, Trash2, Download, Copy, Check,
  Power, Loader2, ExternalLink, QrCode, Calendar, Scan, Tag,
  Settings, GitBranch, FlaskConical,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { getQR, deleteQR, toggleQR, duplicateQR, getQrBaseUrl, type QRCode as QRCodeType } from "@/lib/api"
import { usePlanFeature, PlanChip } from "@/components/PlanFeatureGate"

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  URL: "URL", PDF: "PDF", VIDEO: "Video", LINKS: "Multi-Link",
  SOCIAL_MEDIA: "Social Media", VCARD: "Business Card", IMAGE_GALLERY: "Image Gallery",
  BUSINESS: "Business Info", APP: "App Download", MP3: "Audio / MP3", MENU: "Restaurant Menu",
  WIFI: "WiFi", WHATSAPP: "WhatsApp", INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook", COUPON: "Coupon",
}

const TYPE_EMOJI: Record<string, string> = {
  URL: "🔗", PDF: "📄", VIDEO: "🎬", LINKS: "🔗",
  SOCIAL_MEDIA: "👥", VCARD: "👤", IMAGE_GALLERY: "🖼️",
  BUSINESS: "🏢", APP: "📱", MP3: "🎵", MENU: "🍽️",
  WIFI: "📶", WHATSAPP: "💬", INSTAGRAM: "📸",
  FACEBOOK: "📘", COUPON: "🏷️",
}

// Types that redirect directly (no landing page)
const REDIRECT_TYPES = new Set(["URL", "WIFI", "WHATSAPP", "INSTAGRAM"])

type DownloadExt = "png" | "svg" | "pdf" | "jpeg" | "webp"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  })
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ─── Frame-aware download ─────────────────────────────────────────────────────

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

async function downloadWithFrame(
  qrInst: QRCodeStyling,
  frameStyle: string,
  frameBgColor: string,
  frameText: string,
  filename: string,
  ext: "png" | "jpeg" | "webp",
) {
  const { QR, LABEL_H, EXTRA, hasTopLabel, hasBotLabel, hasBanner, hasScanNow, hasCorners, topH, canvasW, canvasH, qrX, qrY } = frameGeometry(frameStyle)

  const rawBlob = await qrInst.getRawData("png")
  if (!rawBlob) return
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
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a   = document.createElement("a")
      a.href     = url
      a.download = `${filename}.${ext === "jpeg" ? "jpg" : ext}`
      a.click()
      URL.revokeObjectURL(url)
    }, mime, 0.95)
  } finally {
    URL.revokeObjectURL(rawUrl)
  }
}

/**
 * Build and download a fully vector SVG.
 * The QR code paths are inlined directly as a nested <svg> element so every
 * dot/corner is an editable vector shape in Illustrator, Inkscape, etc.
 */
async function downloadSVGWithFrame(
  qrInst: QRCodeStyling,
  frameStyle: string,
  frameBgColor: string,
  frameText: string,
  filename: string,
) {
  const rawBlob = await qrInst.getRawData("svg")
  if (!rawBlob) return

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

  const blob = new Blob([p.join("\n")], { type: "image/svg+xml" })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement("a")
  a.href     = url
  a.download = `${filename}.svg`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── PDF export (fully editable vectors via jsPDF + svg2pdf.js) ──────────────
/**
 * Builds the same SVG as downloadSVGWithFrame, then passes it through
 * svg2pdf.js which converts every SVG element — including the nested <svg>
 * that contains the inlined QR dot paths — into native PDF vector operations.
 * The result is a PDF where every dot, label, and frame shape is independently
 * selectable and editable in Illustrator, Inkscape, Affinity Designer, etc.
 */
async function downloadPDFWithFrame(
  qrInst: QRCodeStyling,
  frameStyle: string,
  frameBgColor: string,
  frameText: string,
  filename: string,
) {
  const rawBlob = await qrInst.getRawData("svg")
  if (!rawBlob) return

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
  pdf.save(`${filename}.pdf`)
}

// ─── CopyButton ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
      title={copied ? "Copied!" : "Copy to clipboard"}
    >
      {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
    </button>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function QRDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const qrRef = useRef<HTMLDivElement>(null)
  const qrInstance = useRef<QRCodeStyling | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const abTesting = usePlanFeature("abTesting")
  const smartRouting = usePlanFeature("smartRouting")

  const { data, isLoading, isError } = useQuery({
    queryKey: ["qr", id],
    queryFn: () => getQR(id!),
    enabled: !!id,
  })

  const qr = data?.data as QRCodeType | undefined

  const { mutate: remove, isPending: isDeleting } = useMutation({
    mutationFn: () => deleteQR(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qr-codes"] })
      navigate("/app/dashboard")
    },
  })

  const { mutate: toggle, isPending: isToggling } = useMutation({
    mutationFn: () => toggleQR(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qr", id] })
      queryClient.invalidateQueries({ queryKey: ["qr-codes"] })
    },
  })

  const { mutate: duplicate, isPending: isDuplicating } = useMutation({
    mutationFn: () => duplicateQR(id!),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["qr-codes"] })
      navigate(`/app/qr/${res.data.id}`)
    },
  })

  const scanUrl = qr ? `${getQrBaseUrl()}/r/${qr.slug}` : ""

  // Initialise QR instance from saved design
  useEffect(() => {
    if (!qr) return
    const d = qr.design
    qrInstance.current = new QRCodeStyling({
      width: 220,
      height: 220,
      type: "svg",
      data: scanUrl,
      dotsOptions: {
        color: d?.primaryColor ?? "#7c3aed",
        type: (d?.dotStyle ?? "rounded") as import("qr-code-styling").DotType,
      },
      cornersSquareOptions: {
        color: d?.primaryColor ?? "#7c3aed",
        type: (d?.cornerSquareStyle ?? "square") as import("qr-code-styling").CornerSquareType,
      },
      cornersDotOptions: { color: d?.primaryColor ?? "#7c3aed" },
      backgroundOptions: { color: d?.backgroundColor ?? "#000000" },
      image: d?.logoUrl ?? undefined,
      imageOptions: { hideBackgroundDots: true, imageSize: 0.35, margin: 8, crossOrigin: "anonymous" },
      qrOptions: { errorCorrectionLevel: "H" },
      margin: 16,
    })
    if (qrRef.current) {
      qrRef.current.innerHTML = ""
      qrInstance.current.append(qrRef.current)
    }
  }, [qr, scanUrl])

  const handleDownload = useCallback(async (ext: DownloadExt) => {
    if (!qr) return
    setIsDownloading(true)
    try {
      const d = qr.design
      const filename = qr.name.replace(/[^a-z0-9_-]/gi, "_")
      const frameStyle = d?.frameStyle ?? "none"
      const primaryColor = d?.primaryColor ?? "#7c3aed"
      const sharedOpts = {
        data: scanUrl,
        dotsOptions: { color: primaryColor, type: (d?.dotStyle ?? "rounded") as import("qr-code-styling").DotType },
        cornersSquareOptions: { color: primaryColor, type: (d?.cornerSquareStyle ?? "square") as import("qr-code-styling").CornerSquareType },
        cornersDotOptions: { color: primaryColor },
        backgroundOptions: { color: d?.backgroundColor ?? "#000000" },
        image: d?.logoUrl ?? undefined,
        imageOptions: { hideBackgroundDots: true, imageSize: (((d as any)?.logoSize as number) ?? 35) / 100, margin: 8, crossOrigin: "anonymous" },
        qrOptions: { errorCorrectionLevel: "H" as const },
      }
      // The API field is `frameColor` (matching the Prisma model). This read
      // `frameBgColor`, which is never present, so every download — PNG, SVG,
      // JPEG, WEBP and the vector PDF — rendered the frame in the #1f2937
      // fallback instead of the colour the user chose.
      const frameBgColor = d?.frameColor || "#1f2937"
      const frameText    = d?.frameText  || "SCAN ME"

      if (ext === "svg") {
        const inst = new QRCodeStyling({ ...sharedOpts, width: 900, height: 900, type: "svg", margin: 30 })
        await downloadSVGWithFrame(inst, frameStyle, frameBgColor, frameText, filename)
      } else if (ext === "pdf") {
        // Fully editable vector PDF — every QR dot and frame shape is a native PDF path
        const inst = new QRCodeStyling({ ...sharedOpts, width: 900, height: 900, type: "svg", margin: 30 })
        await downloadPDFWithFrame(inst, frameStyle, frameBgColor, frameText, filename)
      } else {
        const inst = new QRCodeStyling({ ...sharedOpts, width: 900, height: 900, type: "canvas", margin: 30 })
        await downloadWithFrame(inst, frameStyle, frameBgColor, frameText, filename, ext)
      }
    } finally {
      setIsDownloading(false)
    }
  }, [qr, scanUrl])

  const handleDelete = useCallback(() => {
    if (!qr) return
    if (!window.confirm(`Delete "${qr.name}"? This cannot be undone.`)) return
    remove()
  }, [qr, remove])

  // ── Loading / error states ──────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32 text-zinc-500">
        <Loader2 size={24} className="animate-spin mr-2" />
        Loading QR code…
      </div>
    )
  }

  if (isError || !qr) {
    return (
      <div className="text-center py-32 text-zinc-500">
        <QrCode size={40} className="mx-auto mb-3 opacity-30" />
        <p className="mb-4">QR code not found.</p>
        <Link to="/app/dashboard">
          <Button variant="secondary" size="sm">Back to Dashboard</Button>
        </Link>
      </div>
    )
  }

  const hasLandingPage = !REDIRECT_TYPES.has(qr.type)

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Link to="/app/dashboard">
            <button className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
              <ArrowLeft size={16} />
            </button>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{TYPE_EMOJI[qr.type] ?? "🔲"}</span>
              <h1 className="text-xl font-bold text-zinc-900 dark:text-white truncate">{qr.name}</h1>
              <Badge variant={qr.isActive ? "success" : "secondary"} className="shrink-0">
                {qr.isActive ? "active" : "inactive"}
              </Badge>
            </div>
            <p className="text-zinc-500 text-sm mt-0.5">{TYPE_LABEL[qr.type] ?? qr.type} · Created {formatDate(qr.createdAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link to={`/app/qr/${id}/edit`}>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Edit size={14} /> Edit
            </Button>
          </Link>
          <Button
            onClick={() => toggle()}
            disabled={isToggling}
            variant={qr.isActive ? "secondary" : "default"}
            size="sm"
            className="gap-1.5"
          >
            {isToggling ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
            {qr.isActive ? "Deactivate" : "Activate"}
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[auto_1fr] gap-6">
        {/* Left — QR image + download */}
        <div className="glass-card p-6 rounded-2xl flex flex-col items-center gap-5 w-full sm:w-fit">
          {(() => {
            // Same field-name fix as the download handler above: `frameColor`,
            // not `frameBgColor`. This is why the detail page showed a dark
            // navy frame for a QR saved with a red one.
            const previewFrameBg   = qr.design?.frameColor || "#1f2937"
            const previewFrameText = qr.design?.frameText  || "SCAN ME"
            const fs = qr.design?.frameStyle ?? "none"
            return (
          <div className="flex flex-col items-center">
            {/* Top label — outside frame wrapper so qrRef stays at stable position inside */}
            {(fs === "top-label" || fs === "both-labels") && (
              <div
                className="w-[220px] text-white text-[10px] font-bold text-center py-2 tracking-widest rounded-t-lg"
                style={{ backgroundColor: previewFrameBg }}
              >
                {previewFrameText}
              </div>
            )}

            {/* Frame wrapper */}
            <div
              style={(fs === "top-label" || fs === "both-labels") ? { borderColor: previewFrameBg } : undefined}
              className={cn(
                "relative flex flex-col items-center transition-all",
                fs === "box"          && "border-2 border-white/50 p-2 rounded-xl",
                fs === "thick-border" && "border-[5px] border-white p-1 rounded-2xl",
                fs === "dashed"       && "border-2 border-dashed border-white/65 p-2 rounded-xl",
                fs === "double"       && "border-2 border-white/80 p-1.5 rounded-xl outline outline-2 outline-white/25 outline-offset-[3px]",
                fs === "corners"      && "p-5",
                fs === "speech-bubble"&& "border-2 border-violet-500 p-2 rounded-xl shadow-[0_0_0_5px_rgba(124,58,237,0.2)]",
                fs === "neon-violet"  && "border-2 border-violet-400 p-2 rounded-xl shadow-[0_0_25px_8px_rgba(139,92,246,0.55)]",
                fs === "neon-blue"    && "border-2 border-blue-400 p-2 rounded-xl shadow-[0_0_25px_8px_rgba(59,130,246,0.55)]",
                fs === "neon-pink"    && "border-2 border-pink-400 p-2 rounded-xl shadow-[0_0_25px_8px_rgba(236,72,153,0.55)]",
                fs === "card"         && "bg-white p-3 rounded-2xl shadow-2xl shadow-black/50",
                fs === "banner"       && "bg-white p-3 pb-0 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden",
                (fs === "top-label" || fs === "both-labels") && "border-x-2 border-b-2 rounded-b-lg",
              )}
            >
              {/* Corner brackets */}
              {fs === "corners" && (
                <>
                  <div className="absolute top-0 left-0 w-6 h-6 border-t-[3px] border-l-[3px] border-white" />
                  <div className="absolute top-0 right-0 w-6 h-6 border-t-[3px] border-r-[3px] border-white" />
                  <div className="absolute bottom-0 left-0 w-6 h-6 border-b-[3px] border-l-[3px] border-white" />
                  <div className="absolute bottom-0 right-0 w-6 h-6 border-b-[3px] border-r-[3px] border-white" />
                </>
              )}

              {/* QR code — first non-absolute child, stable */}
              <div ref={qrRef} className="w-[220px] h-[220px]" />

              {/* Bottom label */}
              {(fs === "simple" || fs === "both-labels") && (
                <div
                  className="w-[220px] text-white text-[10px] font-bold text-center py-2 tracking-widest rounded-b-lg"
                  style={{ backgroundColor: previewFrameBg }}
                >
                  {previewFrameText}
                </div>
              )}

              {/* Banner CTA strip */}
              {fs === "banner" && (
                <div
                  className="-mx-3 mt-3 py-2 text-white text-[11px] font-bold text-center tracking-widest"
                  style={{ background: previewFrameBg, width: "calc(220px + 24px)" }}
                >{previewFrameText} →</div>
              )}
            </div>

            {/* Scan Now label */}
            {fs === "scan-now" && (
              <div
                className="mt-2.5 text-white text-[10px] font-bold tracking-widest px-3 py-1.5 rounded-full opacity-90"
                style={{ backgroundColor: previewFrameBg }}
              >
                ↓&nbsp;{previewFrameText}&nbsp;↓
              </div>
            )}
          </div>
            )
          })()}

          {/* Download buttons */}
          <div className="w-full">
            <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-semibold mb-2 text-center">Download</p>
            <div className="grid grid-cols-2 gap-1.5">
              {(["png", "svg", "jpeg", "webp"] as DownloadExt[]).map((ext) => (
                <button
                  key={ext}
                  onClick={() => handleDownload(ext)}
                  disabled={isDownloading}
                  className="py-1.5 rounded-lg text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-white transition-colors disabled:opacity-40 uppercase"
                >
                  {ext}
                </button>
              ))}
            </div>
            {/* PDF — full-width, visually distinct as the editable vector option */}
            <button
              onClick={() => handleDownload("pdf")}
              disabled={isDownloading}
              className="mt-1.5 w-full py-1.5 rounded-lg text-xs font-semibold text-violet-300 bg-violet-500/10 border border-violet-500/30 hover:bg-violet-500/20 hover:text-violet-200 transition-colors disabled:opacity-40 uppercase tracking-widest"
            >
              PDF — Editable Vector
            </button>
          </div>
        </div>

        {/* Right — details */}
        <div className="space-y-4">
          {/* Scan URL */}
          <Card>
            <CardHeader className="py-3 px-5">
              <CardTitle className="text-sm font-semibold">Scan URL</CardTitle>
            </CardHeader>
            <CardContent className="py-0 px-5 pb-4 space-y-2">
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs text-violet-300 bg-violet-500/10 px-3 py-2 rounded-lg truncate font-mono">
                  {scanUrl}
                </code>
                <CopyButton text={scanUrl} />
                <a
                  href={scanUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
                  title="Open in new tab"
                >
                  <ExternalLink size={14} />
                </a>
              </div>
              {hasLandingPage && (
                <p className="text-zinc-500 text-xs">
                  Scans redirect to a{" "}
                  <a
                    href={`/l/${qr.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-400 hover:underline"
                  >
                    hosted landing page
                  </a>
                  .
                </p>
              )}
            </CardContent>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1 text-zinc-500">
                <Scan size={14} />
                <span className="text-xs font-medium">Total Scans</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">{qr.scanCount.toLocaleString()}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1 text-zinc-500">
                <Calendar size={14} />
                <span className="text-xs font-medium">Last Scanned</span>
              </div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                {qr.lastScannedAt ? timeAgo(qr.lastScannedAt) : "Never"}
              </p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1 text-zinc-500">
                <Tag size={14} />
                <span className="text-xs font-medium">Category</span>
              </div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white capitalize">{qr.category.toLowerCase()}</p>
            </Card>
          </div>

          {/* Expiry / schedule notice */}
          {(qr.activeUntil || qr.activeFrom) && (
            <Card className="p-4">
              <div className="flex flex-wrap gap-4 text-xs">
                {qr.activeFrom && (
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Calendar size={13} className="text-violet-400 shrink-0" />
                    <span>Active from <span className="text-zinc-900 dark:text-white font-medium">{formatDate(qr.activeFrom)}</span></span>
                  </div>
                )}
                {qr.activeUntil && (
                  <div className={cn(
                    "flex items-center gap-2",
                    new Date(qr.activeUntil) < new Date() ? "text-red-400" : "text-zinc-400"
                  )}>
                    <Calendar size={13} className={cn("shrink-0", new Date(qr.activeUntil) < new Date() ? "text-red-400" : "text-amber-400")} />
                    <span>
                      {new Date(qr.activeUntil) < new Date() ? "Expired" : "Expires"}{" "}
                      <span className="font-medium">{formatDate(qr.activeUntil)}</span>
                    </span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Tags */}
          {qr.tags.length > 0 && (
            <Card className="p-4">
              <p className="text-xs text-zinc-500 font-medium mb-2">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {qr.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                ))}
              </div>
            </Card>
          )}

          {/* Design summary */}
          {qr.design && (
            <Card>
              <CardHeader className="py-3 px-5">
                <CardTitle className="text-sm font-semibold">Design</CardTitle>
              </CardHeader>
              <CardContent className="py-0 px-5 pb-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Primary color</span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-4 h-4 rounded-full border border-zinc-300 dark:border-zinc-700 inline-block"
                        style={{ background: qr.design.primaryColor ?? "#7c3aed" }}
                      />
                      <span className="text-zinc-700 dark:text-zinc-300 font-mono">{qr.design.primaryColor ?? "#7c3aed"}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Background</span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-4 h-4 rounded-full border border-zinc-300 dark:border-zinc-700 inline-block"
                        style={{ background: qr.design.backgroundColor ?? "#000000" }}
                      />
                      <span className="text-zinc-700 dark:text-zinc-300 font-mono">{qr.design.backgroundColor ?? "#000000"}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Dot style</span>
                    <span className="text-zinc-700 dark:text-zinc-300 capitalize">{qr.design.dotStyle ?? "rounded"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Corner style</span>
                    <span className="text-zinc-700 dark:text-zinc-300 capitalize">{qr.design.cornerSquareStyle ?? "square"}</span>
                  </div>
                  {qr.design.frameStyle && qr.design.frameStyle !== "none" && (
                    <div className="flex items-center justify-between col-span-2">
                      <span className="text-zinc-500">Frame</span>
                      <span className="text-zinc-700 dark:text-zinc-300 capitalize">{qr.design.frameStyle.replace(/-/g, " ")}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            <Link to={`/app/qr/${id}/analytics`}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <BarChart3 size={14} /> Analytics
              </Button>
            </Link>
            <Link to={smartRouting.allowed ? `/app/qr/${id}/smart-routing` : "/app/billing"}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <GitBranch size={14} /> Smart Routing
                {!smartRouting.allowed && <PlanChip plan={smartRouting.requiredPlan} />}
              </Button>
            </Link>
            <Link to={abTesting.allowed ? `/app/qr/${id}/ab-test` : "/app/billing"}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <FlaskConical size={14} /> A/B Test
                {!abTesting.allowed && <PlanChip plan={abTesting.requiredPlan} />}
              </Button>
            </Link>
            <Link to={`/app/qr/${id}/settings`}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Settings size={14} /> Settings
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => duplicate()}
              disabled={isDuplicating}
            >
              {isDuplicating ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Duplicate
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-red-400 border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
