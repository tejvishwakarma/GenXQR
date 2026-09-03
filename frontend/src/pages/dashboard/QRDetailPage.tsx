import { useEffect, useRef, useCallback, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import QRCodeStyling from "qr-code-styling"
import jsPDF from "jspdf"
import { svg2pdf } from "svg2pdf.js"
import { ArrowLeft, BarChart3, Edit, Trash2, Download, Copy, Check, Power, Loader2, ExternalLink, QrCode, Calendar, Scan, Tag, Settings, GitBranch, FlaskConical, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { getQR, deleteQR, toggleQR, duplicateQR, getQrBaseUrl, type QRCode as QRCodeType } from "@/lib/api"
import { usePlanFeature, PlanChip } from "@/components/PlanFeatureGate"
import { buildFrameScene, drawSceneToCanvas, sceneToSvgDocument, loadFrameAsset, FramePreview, type FrameScene } from "@/lib/qr-frames"

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

/**
 * Illustrated (asset) frames need their artwork alongside the scene: a raster
 * image for the canvas export, and the inner vectors for SVG/PDF. Code-drawn
 * frames have no asset, so this resolves to nothing and costs no request.
 */
async function frameArtwork(scene: FrameScene, tint: string): Promise<{ inner?: string; dataUri?: string }> {
  if (!scene.asset) return {}
  return loadFrameAsset(scene.asset, tint)
}

/** Serialize the inner markup of a qr-code-styling SVG (its child nodes), so it
 *  can be inlined into the frame SVG as editable vectors. */
function qrInnerSvg(svgText: string): string {
  const qrDoc = new DOMParser().parseFromString(svgText, "image/svg+xml")
  return Array.from(qrDoc.documentElement.childNodes)
    .map((n) => new XMLSerializer().serializeToString(n))
    .join("")
}

async function downloadWithFrame(
  qrInst: QRCodeStyling,
  frameStyle: string,
  frameBgColor: string,
  frameText: string,
  filename: string,
  ext: "png" | "jpeg" | "webp",
) {
  const scene = buildFrameScene(frameStyle, { color: frameBgColor, text: frameText })
  const art = await frameArtwork(scene, frameBgColor)
  const rawBlob = await qrInst.getRawData("png")
  if (!rawBlob) return
  const rawUrl = URL.createObjectURL(rawBlob as Blob)

  try {
    const qrImg = await loadImg(rawUrl)
    const assetImg = art.dataUri ? await loadImg(art.dataUri) : undefined
    const canvas = document.createElement("canvas")
    canvas.width  = scene.geom.canvasW
    canvas.height = scene.geom.canvasH
    const ctx = canvas.getContext("2d")!

    drawSceneToCanvas(ctx, scene, qrImg, assetImg)

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

  const scene = buildFrameScene(frameStyle, { color: frameBgColor, text: frameText })
  const art   = await frameArtwork(scene, frameBgColor)
  const svg   = sceneToSvgDocument(scene, qrInnerSvg(await (rawBlob as Blob).text()), art.inner)

  const blob = new Blob([svg], { type: "image/svg+xml" })
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

  const scene     = buildFrameScene(frameStyle, { color: frameBgColor, text: frameText })
  const art       = await frameArtwork(scene, frameBgColor)
  const svgString = sceneToSvgDocument(scene, qrInnerSvg(await (rawBlob as Blob).text()), art.inner)

  // Parse SVG string into a real DOM element so svg2pdf.js can walk its nodes
  const svgDoc = new DOMParser().parseFromString(svgString, "image/svg+xml")
  const svgEl  = svgDoc.documentElement as unknown as SVGSVGElement
  const { canvasW, canvasH } = scene.geom

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

/**
 * The per-QR destination features. Kept as data so the section, the plan chips
 * and the links cannot drift apart, and adding a third feature is one entry.
 */
const ADVANCED_FEATURES = [
  {
    key: "smartRouting" as const,
    path: "smart-routing",
    title: "Smart Routing",
    blurb: "Send scans to different pages by device, country, or time of day.",
    Icon: GitBranch,
    tint: "text-violet-500 dark:text-violet-400",
  },
  {
    key: "abTesting" as const,
    path: "ab-test",
    title: "A/B Testing",
    blurb: "Split scans between two destinations and see which performs better.",
    Icon: FlaskConical,
    tint: "text-emerald-500 dark:text-emerald-400",
  },
]

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
          {/* Frame + QR preview — renders the SAME scene the downloads do (see
              @/lib/qr-frames), so what's shown here is exactly what exports. */}
          <FramePreview
            frameStyle={qr.design?.frameStyle ?? "none"}
            color={qr.design?.frameColor || "#1f2937"}
            text={qr.design?.frameText || "SCAN ME"}
            qrPx={220}
          >
            {/* QR code — stable single element; FramePreview positions it in the scene */}
            <div ref={qrRef} className="w-[220px] h-[220px]" />
          </FramePreview>

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

          {/* Advanced — surfaced as an explained section rather than two anonymous
              buttons in the action row, so the capability is discoverable at the
              point someone is actually looking at a QR code. Works for static
              codes too: every dashboard QR encodes /r/<slug>, so all scans pass
              through the redirect engine regardless of category. */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Advanced</CardTitle>
              <p className="text-xs text-zinc-500">
                Change where this code sends people, without reprinting it.
              </p>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ADVANCED_FEATURES.map((f) => {
                const gate = f.key === "abTesting" ? abTesting : smartRouting
                return (
                  <Link key={f.key} to={gate.allowed ? `/app/qr/${id}/${f.path}` : "/app/billing"}>
                    <div className="h-full flex items-start gap-3 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors cursor-pointer">
                      {gate.allowed
                        ? <f.Icon size={18} className={cn("shrink-0 mt-0.5", f.tint)} />
                        : <Lock size={18} className="shrink-0 mt-0.5 text-zinc-400 dark:text-zinc-500" />}
                      <div>
                        <div className="flex items-center gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-200">
                          {f.title}
                          {!gate.allowed && <PlanChip plan={gate.requiredPlan} />}
                        </div>
                        <div className="text-xs text-zinc-500 leading-relaxed">{f.blurb}</div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </CardContent>
          </Card>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            <Link to={`/app/qr/${id}/analytics`}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <BarChart3 size={14} /> Analytics
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
