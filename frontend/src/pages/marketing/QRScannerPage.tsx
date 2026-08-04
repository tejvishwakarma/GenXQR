import { Camera, Upload, AlertCircle, CheckCircle2, X, ExternalLink, Copy, FlipHorizontal, Wifi, Phone, Mail, MessageSquare, User, MapPin, Globe, Lock, Eye, EyeOff, Download, FileText } from "lucide-react"
import React, { useRef, useState, useEffect, useCallback } from "react"
import jsQR from "jsqr"
import { SEOMeta } from "@/components/SEOMeta"
import { MktContainer, MktCard } from "@/components/marketing/ui"
import { PageHero } from "@/components/marketing/PageHero"

// ── Types ────────────────────────────────────────────────────────────────────

type ScanMode = "idle" | "camera" | "upload"

interface ScanResult {
  text: string
  timestamp: Date
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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
function decodeImageData(imageData: ImageData): string | null {
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

// ── QR Type Parsing ────────────────────────────────────────────────────────

interface VCardData {
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
interface WiFiData  { type: "wifi";     ssid: string; password?: string; security: "WPA" | "WEP" | "nopass"; hidden?: boolean }
interface URLData   { type: "url";      url: string }
interface SMSData   { type: "sms";      phone: string; body?: string }
interface TelData   { type: "tel";      phone: string }
interface EmailData { type: "email";    address: string; subject?: string; body?: string }
interface WAppData  { type: "whatsapp"; phone: string; message?: string; url: string }
interface TextData  { type: "text";     text: string }
type ParsedQR = VCardData | WiFiData | URLData | SMSData | TelData | EmailData | WAppData | TextData

function parseVCard(raw: string): VCardData {
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

function parseWiFi(raw: string): WiFiData {
  const get = (key: string) => {
    const m = new RegExp(`[;:]${key}:([^;]*)`, "i").exec(raw)
    return m ? m[1].trim() : undefined
  }
  const sec = (get("T") ?? "nopass").toUpperCase()
  return {
    type: "wifi",
    ssid: get("S") ?? "Unknown",
    password: get("P") || undefined,
    security: (sec === "WPA" || sec === "WEP" ? sec : "nopass") as WiFiData["security"],
    hidden: get("H")?.toLowerCase() === "true",
  }
}

function parseSMS(raw: string): SMSData {
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

function parseMailto(raw: string): EmailData {
  const inner = raw.replace(/^mailto:/i, "")
  const q = inner.indexOf("?")
  if (q === -1) return { type: "email", address: inner.trim() }
  const params = new URLSearchParams(inner.slice(q + 1))
  return { type: "email", address: inner.slice(0, q).trim(), subject: params.get("subject") ?? undefined, body: params.get("body") ?? undefined }
}

function parseQRData(text: string): ParsedQR {
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

// ── Local presentational primitive ─────────────────────────────────────────
// Plain <button> (not <MktButton>) — every scanner action here is a client-side
// JS handler (camera control, clipboard, file save), never navigation.

function ActionButton({
  onClick,
  children,
  className = "",
  variant = "outline",
}: {
  onClick: () => void
  children: React.ReactNode
  className?: string
  variant?: "outline" | "primary"
}) {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-full text-sm font-medium h-9 px-4 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
  const variants = {
    outline: "border border-line bg-paper-pure text-ink hover:border-ink/30 hover:shadow-card",
    primary: "bg-accent text-white hover:bg-accent-ink shadow-[0_12px_34px_-12px_rgba(91,75,255,0.65)]",
  }
  return (
    <button type="button" onClick={onClick} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  )
}

// ── Result Modal Sub-views ─────────────────────────────────────────────────

function FieldRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-line last:border-0">
      <div className="text-ink-faint mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-ink-faint text-xs mb-0.5">{label}</p>
        <p className="text-ink text-sm break-words">{value}</p>
      </div>
    </div>
  )
}

function VCardView({ data }: { data: VCardData }) {
  const saveVCF = () => {
    const blob = new Blob([data.raw], { type: "text/vcard" })
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = blobUrl
    a.download = `${(data.fullName ?? "contact").replace(/\s+/g, "_")}.vcf`
    a.click()
    URL.revokeObjectURL(blobUrl)
  }
  const initials = (data.fullName ?? "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
  return (
    <div>
      <div className="flex items-center gap-4 mb-5">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xl font-bold shrink-0">
          {initials}
        </div>
        <div>
          {data.fullName && <p className="text-ink text-lg font-semibold leading-tight">{data.fullName}</p>}
          {data.title    && <p className="text-ink-soft text-sm">{data.title}</p>}
          {data.org      && <p className="text-ink-faint text-sm">{data.org}</p>}
        </div>
      </div>
      {data.phones.map((p, i) => <FieldRow key={`p${i}`} icon={<Phone size={14} />} label="Phone" value={p} />)}
      {data.emails.map((e, i) => <FieldRow key={`e${i}`} icon={<Mail size={14} />}  label="Email" value={e} />)}
      {data.address && <FieldRow icon={<MapPin size={14} />}    label="Address" value={data.address} />}
      {data.url     && <FieldRow icon={<Globe size={14} />}     label="Website" value={data.url} />}
      {data.note    && <FieldRow icon={<FileText size={14} />}  label="Note"    value={data.note} />}
      <div className="flex gap-2 mt-4">
        <ActionButton className="flex-1" onClick={() => navigator.clipboard.writeText(data.raw)}>
          <Copy size={14} /> Copy vCard
        </ActionButton>
        <ActionButton className="flex-1" onClick={saveVCF}>
          <Download size={14} /> Save .vcf
        </ActionButton>
      </div>
    </div>
  )
}

function WiFiView({ data }: { data: WiFiData }) {
  const [showPass, setShowPass] = useState(false)
  return (
    <div className="space-y-1">
      <FieldRow icon={<Wifi size={14} />} label="Network (SSID)" value={data.ssid} />
      <FieldRow icon={<Lock size={14} />} label="Security" value={data.security === "nopass" ? "Open (no password)" : data.security} />
      {data.password && (
        <div className="flex items-start gap-3 py-2.5 border-b border-line">
          <div className="text-ink-faint mt-0.5 shrink-0"><Lock size={14} /></div>
          <div className="flex-1 min-w-0">
            <p className="text-ink-faint text-xs mb-0.5">Password</p>
            <p className="text-ink text-sm font-mono break-all">
              {showPass ? data.password : "•".repeat(Math.min(data.password.length, 20))}
            </p>
          </div>
          <button onClick={() => setShowPass(p => !p)} className="text-ink-faint hover:text-ink transition-colors mt-0.5">
            {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      )}
      <div className="flex gap-2 mt-4">
        {data.password && (
          <ActionButton className="flex-1" onClick={() => navigator.clipboard.writeText(data.password!)}>
            <Copy size={14} /> Copy Password
          </ActionButton>
        )}
        <ActionButton className="flex-1" onClick={() => navigator.clipboard.writeText(data.ssid)}>
          <Copy size={14} /> Copy SSID
        </ActionButton>
      </div>
    </div>
  )
}

function URLView({ data }: { data: URLData }) {
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard.writeText(data.url); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  let domain = ""
  try { domain = new URL(data.url).hostname } catch { domain = data.url }
  return (
    <div>
      <div className="bg-paper rounded-xl p-4 mb-4 border border-line">
        <p className="text-ink-faint text-xs mb-1">{domain}</p>
        <p className="text-ink text-sm font-mono break-all">{data.url}</p>
      </div>
      <div className="flex gap-2">
        <ActionButton className="flex-1" onClick={copy}>
          <Copy size={14} /> {copied ? "Copied!" : "Copy URL"}
        </ActionButton>
        <ActionButton className="flex-1" onClick={() => window.open(data.url, "_blank", "noopener,noreferrer")}>
          <ExternalLink size={14} /> Open
        </ActionButton>
      </div>
    </div>
  )
}

function SMSView({ data }: { data: SMSData }) {
  const href = `sms:${data.phone}${data.body ? `?body=${encodeURIComponent(data.body)}` : ""}`
  return (
    <div className="space-y-1">
      <FieldRow icon={<Phone size={14} />}         label="Phone Number" value={data.phone} />
      {data.body && <FieldRow icon={<MessageSquare size={14} />} label="Message" value={data.body} />}
      <div className="mt-4">
        <ActionButton className="w-full" onClick={() => { window.location.href = href }}>
          <MessageSquare size={14} /> Send SMS
        </ActionButton>
      </div>
    </div>
  )
}

function TelView({ data }: { data: TelData }) {
  return (
    <div>
      <div className="bg-paper rounded-xl p-5 mb-4 border border-line text-center">
        <p className="text-ink text-2xl font-mono tracking-wider">{data.phone}</p>
      </div>
      <ActionButton className="w-full" onClick={() => { window.location.href = `tel:${data.phone}` }}>
        <Phone size={14} /> Call
      </ActionButton>
    </div>
  )
}

function EmailView({ data }: { data: EmailData }) {
  const qs = [
    data.subject ? `subject=${encodeURIComponent(data.subject)}` : "",
    data.body    ? `body=${encodeURIComponent(data.body)}` : "",
  ].filter(Boolean).join("&")
  const href = `mailto:${data.address}${qs ? `?${qs}` : ""}`
  return (
    <div className="space-y-1">
      <FieldRow icon={<Mail size={14} />}           label="Email Address" value={data.address} />
      {data.subject && <FieldRow icon={<FileText size={14} />}      label="Subject" value={data.subject} />}
      {data.body    && <FieldRow icon={<MessageSquare size={14} />} label="Body"    value={data.body} />}
      <div className="mt-4">
        <ActionButton className="w-full" onClick={() => { window.location.href = href }}>
          <Mail size={14} /> Compose Email
        </ActionButton>
      </div>
    </div>
  )
}

function WAppView({ data }: { data: WAppData }) {
  return (
    <div className="space-y-1">
      {data.phone   && <FieldRow icon={<Phone size={14} />}         label="Phone"   value={`+${data.phone}`} />}
      {data.message && <FieldRow icon={<MessageSquare size={14} />} label="Message" value={data.message} />}
      <div className="mt-4">
        <ActionButton className="w-full" onClick={() => window.open(data.url, "_blank", "noopener,noreferrer")}>
          <ExternalLink size={14} /> Open in WhatsApp
        </ActionButton>
      </div>
    </div>
  )
}

function TextView({ data }: { data: TextData }) {
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard.writeText(data.text); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  return (
    <div>
      <div className="bg-paper rounded-xl p-4 mb-4 border border-line max-h-48 overflow-y-auto">
        <p className="text-ink text-sm font-mono break-all whitespace-pre-wrap">{data.text}</p>
      </div>
      <ActionButton className="w-full" onClick={copy}>
        <Copy size={14} /> {copied ? "Copied!" : "Copy Text"}
      </ActionButton>
    </div>
  )
}

// ── Scan Result Modal ──────────────────────────────────────────────────────

const TYPE_CONFIG: Record<ParsedQR["type"], { label: string; icon: React.ReactNode; color: string }> = {
  vcard:    { label: "Contact Card",  icon: <User size={18} />,          color: "text-blue-500"    },
  wifi:     { label: "Wi-Fi Network", icon: <Wifi size={18} />,          color: "text-cyan-500"    },
  url:      { label: "URL",           icon: <Globe size={18} />,         color: "text-violet-500"  },
  sms:      { label: "SMS",           icon: <MessageSquare size={18} />, color: "text-emerald-500" },
  tel:      { label: "Phone Number",  icon: <Phone size={18} />,         color: "text-teal-500"    },
  email:    { label: "Email",         icon: <Mail size={18} />,          color: "text-amber-500"   },
  whatsapp: { label: "WhatsApp",      icon: <MessageSquare size={18} />, color: "text-green-500"   },
  text:     { label: "Plain Text",    icon: <FileText size={18} />,      color: "text-ink-faint"   },
}

function ScanResultModal({ result, onClose, onClear }: { result: ScanResult; onClose: () => void; onClear: () => void }) {
  const parsed = parseQRData(result.text)
  const { label, icon, color } = TYPE_CONFIG[parsed.type]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-ink/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-paper-pure border border-line p-6 max-h-[85vh] overflow-y-auto shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className={`flex items-center gap-2 font-semibold ${color}`}>
            {icon}
            <span>{label}</span>
          </div>
          <button
            onClick={onClose}
            className="text-ink-faint hover:text-ink transition-colors p-1 rounded-lg hover:bg-ink/5"
          >
            <X size={18} />
          </button>
        </div>

        {/* Type-specific content */}
        {parsed.type === "vcard"    && <VCardView data={parsed} />}
        {parsed.type === "wifi"     && <WiFiView  data={parsed} />}
        {parsed.type === "url"      && <URLView   data={parsed} />}
        {parsed.type === "sms"      && <SMSView   data={parsed} />}
        {parsed.type === "tel"      && <TelView   data={parsed} />}
        {parsed.type === "email"    && <EmailView data={parsed} />}
        {parsed.type === "whatsapp" && <WAppView  data={parsed} />}
        {parsed.type === "text"     && <TextView  data={parsed} />}

        {/* Footer */}
        <div className="mt-5 pt-4 border-t border-line flex items-center justify-between">
          <p className="text-ink-faint text-xs">Scanned at {result.timestamp.toLocaleTimeString()}</p>
          <button onClick={onClear} className="text-xs text-ink-faint hover:text-red-500 transition-colors">
            Clear &amp; Scan Again
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function QRScannerPage() {
  const [mode, setMode] = useState<ScanMode>("idle")
  const [result, setResult] = useState<ScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment")
  const [dragOver, setDragOver] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Prevents the RAF loop continuing after a result or stop
  const scanningRef = useRef(false)

  // ── Camera ────────────────────────────────────────────────────────────────

  const stopCamera = useCallback(() => {
    scanningRef.current = false
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  // Runs inside the RAF loop — reads a frame from the live video into canvas and decodes.
  const tickScan = useCallback(() => {
    if (!scanningRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current

    // Wait until the video has real dimensions (readyState ≥ HAVE_CURRENT_DATA)
    if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) {
      rafRef.current = requestAnimationFrame(tickScan)
      return
    }

    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const decoded = decodeImageData(imageData)

    if (decoded) {
      setResult({ text: decoded, timestamp: new Date() })
      setShowModal(true)
      stopCamera()
      setMode("idle")
      return
    }

    rafRef.current = requestAnimationFrame(tickScan)
  }, [stopCamera])

  const startCamera = useCallback(async (facing: "environment" | "user") => {
    stopCamera()
    setError(null)
    setResult(null)

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Your browser does not support camera access. Try Chrome or Firefox over HTTPS.")
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })

      const video = videoRef.current
      if (!video) { stream.getTracks().forEach((t) => t.stop()); return }

      streamRef.current = stream
      video.srcObject = stream

      // Wait for the video to be ready to play before starting the scan loop
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => {
          video.play().then(resolve).catch(reject)
        }
        video.onerror = () => reject(new Error("Video element error"))
        // Timeout safety — if metadata never fires within 8s, abort
        setTimeout(() => reject(new Error("Camera timed out. Try refreshing.")), 8000)
      })

      setMode("camera")
      scanningRef.current = true
      rafRef.current = requestAnimationFrame(tickScan)
    } catch (err) {
      stopCamera()
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.match(/permission|denied|not allowed/i)) {
        setError("Camera permission denied. Please allow camera access in your browser settings and refresh.")
      } else if (msg.match(/timeout/i)) {
        setError(msg)
      } else {
        setError(`Could not start camera: ${msg}`)
      }
    }
  }, [stopCamera, tickScan])

  // Restart camera when facing mode changes (only while already in camera mode)
  useEffect(() => {
    if (mode === "camera") startCamera(facingMode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode])

  // Cleanup on unmount
  useEffect(() => () => stopCamera(), [stopCamera])

  const handleEnableCamera = () => startCamera(facingMode)

  const handleFlipCamera = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"))
  }

  // ── Upload ────────────────────────────────────────────────────────────────

  const processFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload a valid image file (PNG, JPG, WEBP).")
      return
    }
    setError(null)
    setResult(null)

    const reader = new FileReader()
    reader.onload = (e) => {
      const src = e.target?.result as string
      const img = new Image()
      img.onload = () => {
        const offscreen = document.createElement("canvas")
        // Cap at 1024px — jsQR accuracy peaks here; larger just wastes CPU
        const MAX = 1024
        const scale = Math.min(1, MAX / Math.max(img.width, img.height))
        offscreen.width = Math.round(img.width * scale)
        offscreen.height = Math.round(img.height * scale)

        const ctx = offscreen.getContext("2d", { willReadFrequently: true })!
        ctx.drawImage(img, 0, 0, offscreen.width, offscreen.height)
        const imageData = ctx.getImageData(0, 0, offscreen.width, offscreen.height)

        const decoded = decodeImageData(imageData)
        if (decoded) {
          setResult({ text: decoded, timestamp: new Date() })
          setShowModal(true)
          setMode("idle")
        } else {
          setError("No QR code found in this image. Try a clearer or higher-resolution photo.")
        }
      }
      img.onerror = () => setError("Could not load the image. The file may be corrupt.")
      img.src = src
    }
    reader.onerror = () => setError("Could not read the file.")
    reader.readAsDataURL(file)
    setMode("upload")
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ""
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleClear = () => {
    setResult(null)
    setError(null)
    setShowModal(false)
    stopCamera()
    setMode("idle")
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="pb-24 md:pb-32">
      <SEOMeta
        title="Free QR Code Scanner"
        description="Scan any QR code instantly using your camera or by uploading an image — no app required."
        url="/scanner"
      />

      <PageHero
        eyebrow="Scanner"
        title={
          <>
            Free Online <span className="text-accent">QR Scanner</span>
          </>
        }
        intro="Scan any QR code instantly using your device camera or by uploading an image. No app download required."
      />

      <MktContainer>
        <div className="grid md:grid-cols-2 gap-8">

          {/* ── Camera panel ── */}
          <MktCard interactive={false} className="p-0 overflow-hidden">
            <div className="h-[400px] flex flex-col items-center justify-center relative bg-paper">

              {/* Live video */}
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover"
                style={{ display: mode === "camera" ? "block" : "none" }}
                autoPlay
                muted
                playsInline
              />

              {/* Scan overlay */}
              {mode === "camera" && (
                <>
                  <div className="absolute inset-0 bg-ink/30 pointer-events-none" />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-52 h-52 pointer-events-none">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-accent rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-accent rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-accent rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-accent rounded-br-lg" />
                    <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-accent shadow-[0_0_12px_rgba(91,75,255,0.8)] animate-pulse" />
                  </div>
                  <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3 z-10">
                    <ActionButton onClick={handleFlipCamera}>
                      <FlipHorizontal size={14} /> Flip
                    </ActionButton>
                    <ActionButton onClick={handleClear}>
                      <X size={14} /> Stop
                    </ActionButton>
                  </div>
                </>
              )}

              {/* Idle state */}
              {mode !== "camera" && (
                <>
                  <div className="absolute inset-x-12 inset-y-24 border-2 border-line rounded-3xl pointer-events-none" />
                  <div className="z-10 flex flex-col items-center text-center px-6">
                    <Camera className="text-ink-faint mb-4" size={48} />
                    <h3 className="text-ink font-medium mb-2">Use your camera</h3>
                    <p className="text-ink-soft text-sm mb-6 max-w-xs">
                      Point your camera at a QR code to scan it in real time.
                    </p>
                    <ActionButton variant="primary" className="h-12 px-8" onClick={handleEnableCamera}>
                      Enable Camera
                    </ActionButton>
                  </div>
                </>
              )}

              {/* Hidden canvas for frame decoding */}
              <canvas ref={canvasRef} className="hidden" />
            </div>
          </MktCard>

          {/* ── Right panel: upload + result ── */}
          <div className="space-y-6 flex flex-col">

            {/* Upload dropzone */}
            <MktCard interactive={false} className="p-6 flex-1 flex flex-col">
              <h3 className="text-ink font-semibold mb-4 flex items-center gap-2">
                <Upload size={18} className="text-accent" />
                Upload Image
              </h3>
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl flex-1 flex flex-col items-center justify-center p-8 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? "border-accent bg-accent-soft"
                    : "border-line hover:border-accent/50 hover:bg-paper"
                }`}
              >
                <div className="w-12 h-12 rounded-full bg-paper border border-line flex items-center justify-center mb-4">
                  <Upload size={20} className="text-ink-faint" />
                </div>
                <p className="text-ink font-medium mb-1">Click to upload</p>
                <p className="text-ink-faint text-sm">or drag and drop a QR code image</p>
                <p className="text-ink-faint text-xs mt-4 opacity-70">Supports PNG, JPG, WEBP, GIF</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </MktCard>

            {/* Result / error card */}
            {error ? (
              <MktCard interactive={false} className="p-6 border-red-500/30 bg-red-500/5 flex items-start gap-3">
                <AlertCircle className="text-red-500 mt-0.5 shrink-0" size={20} />
                <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
              </MktCard>
            ) : result ? (
              <MktCard interactive={false} className="p-6 border-accent/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className={`flex items-center gap-2 font-semibold text-sm ${TYPE_CONFIG[parseQRData(result.text).type].color}`}>
                    <CheckCircle2 size={16} className="text-emerald-500" />
                    <span className="text-ink">{TYPE_CONFIG[parseQRData(result.text).type].label} Decoded</span>
                  </div>
                  <button onClick={handleClear} className="text-ink-faint hover:text-ink transition-colors">
                    <X size={16} />
                  </button>
                </div>
                <p className="text-ink-faint text-xs font-mono truncate">
                  {result.text.length > 60 ? `${result.text.slice(0, 60)}…` : result.text}
                </p>
                <ActionButton className="w-full" onClick={() => setShowModal(true)}>
                  View Result Details
                </ActionButton>
              </MktCard>
            ) : (
              <MktCard interactive={false} className="p-6 opacity-60 flex flex-col items-center justify-center text-center py-6">
                <AlertCircle className="text-ink-faint mb-3" size={32} />
                <h3 className="text-ink-soft font-medium">No Code Detected</h3>
                <p className="text-ink-faint text-sm mt-1">Scan or upload a QR code to see the result here.</p>
              </MktCard>
            )}
          </div>
        </div>
      </MktContainer>

      {/* Result modal — opens automatically on scan, dismissible without clearing */}
      {showModal && result && (
        <ScanResultModal
          result={result}
          onClose={() => setShowModal(false)}
          onClear={handleClear}
        />
      )}
    </div>
  )
}
