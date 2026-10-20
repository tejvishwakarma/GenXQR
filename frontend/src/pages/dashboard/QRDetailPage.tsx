import { useEffect, useRef, useCallback, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import QRCodeStyling from "qr-code-styling"
import { ArrowLeft, BarChart3, Edit, Trash2, Download, Copy, Check, Power, Loader2, ExternalLink, QrCode, Calendar, Scan, Tag, Settings, GitBranch, FlaskConical, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { getQR, deleteQR, toggleQR, duplicateQR, getQrBaseUrl, type QRCode as QRCodeType } from "@/lib/api"
import { usePlanFeature, PlanChip } from "@/components/PlanFeatureGate"
import { useWorkspace } from "@/hooks/useWorkspace"
import { FramedPreview } from "@/components/qr-frames/FramedPreview"
import { getFrame, type FrameFields } from "@/lib/frames/compose"
import { downloadQR, type QRDownloadExt } from "@/lib/qrDownload"

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
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const abTesting = usePlanFeature("abTesting")
  const smartRouting = usePlanFeature("smartRouting")
  const { can } = useWorkspace()

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
    onError: (err: unknown) => window.alert(err instanceof Error ? err.message : "Could not change this QR code's status."),
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
      backgroundOptions: { color: d?.backgroundColor ?? "#ffffff" },
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

  const handleDownload = useCallback(async (ext: QRDownloadExt) => {
    if (!qr) return
    setIsDownloading(true)
    setDownloadError(null)
    try {
      await downloadQR(qr, ext)
    } catch {
      setDownloadError("The download could not be created. Please try again.")
    } finally {
      setIsDownloading(false)
    }
  }, [qr])

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
  const libraryFrame = getFrame(qr.design?.frameStyle)

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
        {can("qr:edit") && (
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
        )}
      </div>

      <div className="grid lg:grid-cols-[auto_1fr] gap-6">
        {/* Left — QR image + download */}
        <div className="glass-card p-6 rounded-2xl flex flex-col items-center gap-5 w-full sm:w-fit">
          {libraryFrame && (
            <FramedPreview
              frameId={libraryFrame.id}
              color={qr.design?.frameColor}
              fields={(qr.design?.frameFields ?? null) as FrameFields | null}
              background={qr.design?.backgroundColor}
              className="w-[260px]"
              qr={{
                data: scanUrl,
                dotsOptions: { color: qr.design?.primaryColor ?? "#7c3aed", type: (qr.design?.dotStyle ?? "rounded") as import("qr-code-styling").DotType },
                cornersSquareOptions: { color: qr.design?.primaryColor ?? "#7c3aed", type: (qr.design?.cornerSquareStyle ?? "square") as import("qr-code-styling").CornerSquareType },
                cornersDotOptions: { color: qr.design?.primaryColor ?? "#7c3aed" },
                image: qr.design?.logoUrl ?? undefined,
                imageOptions: { hideBackgroundDots: true, imageSize: (qr.design?.logoSize ?? 35) / 100, margin: 8, crossOrigin: "anonymous" },
                qrOptions: { errorCorrectionLevel: "H" },
              }}
            />
          )}
          {(() => {
            // Same field-name fix as the download handler above: `frameColor`,
            // not `frameBgColor`. This is why the detail page showed a dark
            // navy frame for a QR saved with a red one.
            const previewFrameBg   = qr.design?.frameColor || "#1f2937"
            const previewFrameText = qr.design?.frameText  || "SCAN ME"
            const fs = qr.design?.frameStyle ?? "none"
            return (
          // Stays mounted under a library frame: qrInstance renders into qrRef once.
          <div className={cn("flex flex-col items-center", libraryFrame && "hidden")}>
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
              {(["png", "svg", "jpeg", "webp"] as QRDownloadExt[]).map((ext) => (
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
              {libraryFrame ? "PDF — Print quality" : "PDF — Editable Vector"}
            </button>
            {downloadError && (
              <p className="mt-2 text-center text-xs text-red-500" role="alert">{downloadError}</p>
            )}
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
                        style={{ background: qr.design.backgroundColor ?? "#ffffff" }}
                      />
                      <span className="text-zinc-700 dark:text-zinc-300 font-mono">{qr.design.backgroundColor ?? "#ffffff"}</span>
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
                      {libraryFrame ? (
                        <span className="text-zinc-700 dark:text-zinc-300">{libraryFrame.title}</span>
                      ) : (
                        <span className="text-zinc-700 dark:text-zinc-300 capitalize">{qr.design.frameStyle.replace(/-/g, " ")}</span>
                      )}
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
              through the redirect engine regardless of category. Hidden for
              roles that cannot edit the code (team workspaces). */}
          {can("qr:edit") && (
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
          )}

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            <Link to={`/app/qr/${id}/analytics`}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <BarChart3 size={14} /> Analytics
              </Button>
            </Link>
            {can("qr:edit") && (
              <Link to={`/app/qr/${id}/settings`}>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Settings size={14} /> Settings
                </Button>
              </Link>
            )}
            {can("qr:create") && (
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
            )}
            {can("qr:delete") && (
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
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
