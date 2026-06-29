import { Link } from "react-router-dom"
import {
  QrCode, Wifi, MessageCircle, Instagram, ArrowRight,
  Download, Palette, Phone, MessageSquare, ChevronDown,
  BarChart3, RefreshCw, Shield, Zap,
} from "lucide-react"
import { useState, useEffect, useRef, useCallback } from "react"
import QRCodeStyling, {
  type DotType,
  type CornerSquareType,
  type CornerDotType,
} from "qr-code-styling"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue
} from "@/components/ui/select"
import { SEOMeta } from "@/components/SEOMeta"
import { cn } from "@/lib/utils"

// ─── JSON-LD schema ───────────────────────────────────────────────────────────
// Deliverable 8: SoftwareApplication + FAQPage

const GENERATE_JSON_LD = [
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "GenXQR Free QR Code Generator",
    "applicationCategory": "UtilitiesApplication",
    "operatingSystem": "Web",
    "url": "https://genxqr.streamsnatcher.com/generate",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "INR",
      "description": "Free QR code generator for URL, WiFi, WhatsApp, Instagram, SMS, and phone. Custom colours, dot shapes, instant PNG download. No account required.",
    },
    "featureList": [
      "URL QR code generator",
      "WiFi QR code generator",
      "WhatsApp QR code generator",
      "Instagram QR code generator",
      "SMS QR code generator",
      "Phone number QR code",
      "Custom colour and dot shape",
      "600px PNG download",
      "No account required",
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "How do I create a QR code for free?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Use GenXQR's free generator at genxqr.streamsnatcher.com/generate. Pick a QR type (URL, WiFi, WhatsApp, Instagram, SMS, or phone), enter your content, customise the colour and dot style, and click Download PNG. No account, no credit card, and no expiry — the QR code is yours to use forever. For QR codes you can edit after printing and track every scan, create a free account and use the dynamic QR creator.",
        },
      },
      {
        "@type": "Question",
        "name": "What is the difference between a static and dynamic QR code?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "A static QR code has the destination permanently encoded into the image. Once printed, it cannot be changed. A dynamic QR code contains a short redirect link you can update any time without reprinting — you can change the URL, swap the PDF, or point to a new offer. Dynamic QR codes also track every scan with city, device, and time data. Use static for permanent content that will never change; use dynamic for menus, campaigns, packaging, and anything that may need updating. GenXQR offers dynamic QR codes from ₹299/month.",
        },
      },
      {
        "@type": "Question",
        "name": "Can I customise the colour of my QR code?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. GenXQR's free generator lets you pick any foreground (dot) colour and background colour using the colour picker. You can also choose from six dot styles (square, rounded, dots, classy, classy-rounded, extra-rounded) and three eye frame and eye centre shapes. The preview updates live as you change options. For logo upload and brand-level customisation, use the full QR creator after creating a free account.",
        },
      },
      {
        "@type": "Question",
        "name": "How do I create a QR code for WhatsApp?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Select 'WhatsApp' from the QR type selector on this page. Enter your WhatsApp number with the country code (e.g. +91 98765 43210 for India) and optionally add a pre-filled message. The QR code will open WhatsApp directly to a chat with that number — no need for the scanner to save the contact first. Download the PNG and place it on your menu, business card, or flyer.",
        },
      },
      {
        "@type": "Question",
        "name": "Can I create a QR code for WiFi?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. Select 'WiFi' from the QR type selector. Enter your network name (SSID), password, and security type (WPA/WPA2 is most common). When someone scans the QR code with their phone camera, it connects to the WiFi automatically — no typing needed. This works on both Android and iPhone. Ideal for cafes, offices, hotels, restaurants, and co-working spaces.",
        },
      },
    ],
  },
]

// ─── Types ────────────────────────────────────────────────────────────────────

type QRTypeId = "url" | "wifi" | "whatsapp" | "instagram" | "sms" | "phone"

const qrTypes: { id: QRTypeId; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: "url",       label: "URL / Website", icon: <QrCode size={20} />,       desc: "Link to any page or offer" },
  { id: "wifi",      label: "WiFi",          icon: <Wifi size={20} />,          desc: "Connect guests instantly" },
  { id: "whatsapp",  label: "WhatsApp",      icon: <MessageCircle size={20} />, desc: "Open a chat directly" },
  { id: "instagram", label: "Instagram",     icon: <Instagram size={20} />,     desc: "Drive profile follows" },
  { id: "sms",       label: "SMS",           icon: <MessageSquare size={20} />, desc: "Pre-filled text message" },
  { id: "phone",     label: "Phone",         icon: <Phone size={20} />,         desc: "One tap to call" },
]

// ─── Shape options ────────────────────────────────────────────────────────────

const DOT_SHAPES: { type: DotType; label: string }[] = [
  { type: "square",         label: "Square" },
  { type: "rounded",        label: "Rounded" },
  { type: "dots",           label: "Dots" },
  { type: "classy",         label: "Classy" },
  { type: "classy-rounded", label: "Classy Round" },
  { type: "extra-rounded",  label: "Extra Round" },
]

const EYE_SHAPES: { type: CornerSquareType; label: string }[] = [
  { type: "square",        label: "Square" },
  { type: "extra-rounded", label: "Rounded" },
  { type: "dot",           label: "Dot" },
]

const EYE_DOT_SHAPES: { type: CornerDotType; label: string }[] = [
  { type: "square", label: "Square" },
  { type: "dot",    label: "Dot" },
]

// ─── QR data builders ─────────────────────────────────────────────────────────

function buildQRData(
  type: QRTypeId,
  fields: Record<string, string>
): string {
  switch (type) {
    case "url":
      return fields.url?.trim() || "https://genxqr.streamsnatcher.com"
    case "wifi": {
      const sec = fields.security || "WPA"
      const ssid = fields.ssid || ""
      const pass = fields.password || ""
      return `WIFI:T:${sec};S:${ssid};P:${pass};;`
    }
    case "whatsapp": {
      const num = (fields.phone || "").replace(/\D/g, "")
      const msg = encodeURIComponent(fields.message || "")
      return `https://wa.me/${num}${msg ? `?text=${msg}` : ""}`
    }
    case "instagram":
      return `https://instagram.com/${fields.username || ""}`
    case "sms": {
      const num = (fields.smsPhone || "").replace(/[^+\d]/g, "")
      const body = encodeURIComponent(fields.smsBody || "")
      return `sms:${num}${body ? `?body=${body}` : ""}`
    }
    case "phone": {
      const num = (fields.phoneNumber || "").replace(/[^+\d]/g, "")
      return `tel:${num}`
    }
    default:
      return "https://genxqr.streamsnatcher.com"
  }
}

// ─── FAQ accordion ────────────────────────────────────────────────────────────
// Deliverable 7: 5 questions targeting Cluster D featured snippets

const faqs = [
  {
    q: "How do I create a QR code for free?",
    a: "Use the generator on this page. Pick a QR type (URL, WiFi, WhatsApp, Instagram, SMS, or phone), enter your content, customise the colour and dot style, then click Download PNG. No account, no credit card, and no expiry — the QR code is yours forever. For QR codes you can edit after printing and track every scan, create a free GenXQR account and use the dynamic QR creator.",
  },
  {
    q: "What is the difference between a static and dynamic QR code?",
    a: "A static QR code has the destination permanently encoded — once printed, it cannot be changed. A dynamic QR code contains a short redirect link you can update at any time without reprinting. Dynamic codes also track every scan with city, device, and time data. Use static for permanent content; use dynamic for menus, packaging, and campaigns that may need updating. Dynamic QR codes are available from ₹299/month on GenXQR.",
  },
  {
    q: "Can I customise the colour of my QR code?",
    a: "Yes — pick any foreground dot colour and background colour using the colour picker in Step 3. You can also choose from six dot styles (square, rounded, dots, classy, classy-rounded, extra-rounded) and three eye frame shapes. The preview updates live. For logo upload and full brand customisation, create a free GenXQR account and use the full QR editor.",
  },
  {
    q: "How do I create a QR code for WhatsApp?",
    a: "Select 'WhatsApp' from the QR type list. Enter your WhatsApp number with the country code (e.g. +91 98765 43210 for India) and optionally add a pre-filled message. When someone scans the QR code, WhatsApp opens directly to a chat with your number — no need for the scanner to save your contact first. Download the PNG and use it on menus, business cards, or flyers.",
  },
  {
    q: "Can I create a QR code for WiFi?",
    a: "Yes. Select 'WiFi', enter your network name (SSID), password, and security type (WPA/WPA2 is most common for modern routers). When a customer or guest scans the code, their phone connects to the WiFi automatically — no typing needed. Works on both Android and iPhone. Used widely in cafes, restaurants, hotels, co-working spaces, and offices across India.",
  },
]

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left text-white font-semibold text-sm hover:bg-zinc-800/40 transition-colors"
        aria-expanded={open}
      >
        <span>{q}</span>
        <ChevronDown
          size={18}
          className={cn("text-zinc-400 shrink-0 transition-transform duration-200", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="px-6 pb-5 text-zinc-400 text-sm leading-relaxed border-t border-zinc-800">
          <p className="pt-4">{a}</p>
        </div>
      )}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StaticGeneratePage() {
  const [activeType, setActiveType] = useState<QRTypeId>("url")
  const [fields, setFields] = useState<Record<string, string>>({})
  const [fgColor, setFgColor] = useState("#7c3aed")
  const [bgColor, setBgColor] = useState("#ffffff")
  const [dotShape, setDotShape] = useState<DotType>("square")
  const [eyeShape, setEyeShape] = useState<CornerSquareType>("square")
  const [eyeDotShape, setEyeDotShape] = useState<CornerDotType>("square")

  const qrRef = useRef<HTMLDivElement>(null)
  const qrInstance = useRef<QRCodeStyling | null>(null)

  const setField = (key: string, value: string) =>
    setFields((prev) => ({ ...prev, [key]: value }))

  // Initialise qr-code-styling once
  useEffect(() => {
    qrInstance.current = new QRCodeStyling({
      width: 200,
      height: 200,
      type: "svg",
      data: "https://genxqr.streamsnatcher.com",
      dotsOptions: { color: fgColor, type: dotShape },
      cornersSquareOptions: { color: fgColor, type: eyeShape },
      cornersDotOptions: { color: fgColor, type: eyeDotShape },
      backgroundOptions: { color: bgColor },
      qrOptions: { errorCorrectionLevel: "M" },
      imageOptions: { hideBackgroundDots: true, imageSize: 0.4, margin: 4 },
      margin: 16,
    })
    if (qrRef.current) {
      qrRef.current.innerHTML = ""
      qrInstance.current.append(qrRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-update QR on any option change
  const updateQR = useCallback(() => {
    qrInstance.current?.update({
      data: buildQRData(activeType, fields),
      dotsOptions: { color: fgColor, type: dotShape },
      cornersSquareOptions: { color: fgColor, type: eyeShape },
      cornersDotOptions: { color: fgColor, type: eyeDotShape },
      backgroundOptions: { color: bgColor },
    })
  }, [activeType, fields, fgColor, bgColor, dotShape, eyeShape, eyeDotShape])

  useEffect(() => { updateQR() }, [updateQR])

  const handleDownload = () => {
    // qr-code-styling's .download() uses the constructor canvas, not the
    // one mutated by .update(). Create a fresh instance with current state.
    const downloadQR = new QRCodeStyling({
      width: 600,
      height: 600,
      type: "canvas",
      data: buildQRData(activeType, fields),
      dotsOptions: { color: fgColor, type: dotShape },
      cornersSquareOptions: { color: fgColor, type: eyeShape },
      cornersDotOptions: { color: fgColor, type: eyeDotShape },
      backgroundOptions: { color: bgColor },
      qrOptions: { errorCorrectionLevel: "M" },
      margin: 40,
    })
    downloadQR.download({ name: "GenXQR", extension: "png" })
  }

  return (
    <div className="pt-16 pb-24 px-4">

      {/*
        Deliverable 1: SEO title (53 chars) — target keyword: "qr code generator"
        Deliverable 2: Meta description (153 chars) — benefit-led with CTA
        Deliverable 8: JSON-LD — SoftwareApplication + FAQPage
      */}
      <SEOMeta
        title="Free QR Code Generator — No Account Needed"
        description="Free QR code generator for URL, WiFi, WhatsApp, Instagram, SMS and phone. Custom colours, dot shapes, instant PNG download. No account or credit card needed."
        url="/generate"
        jsonLd={GENERATE_JSON_LD}
      />

      <div className="max-w-7xl mx-auto">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        {/*
          Deliverable 3: H1 rewrite — differs from title tag
          Deliverable 6: 3 A/B variants
            Variant A (active): "Generate a Free QR Code — Custom Style, Instant Download"
            Variant B: "Pick a Type. Add Your Content. Download Your Free QR Code."
            Variant C: "Your Free QR Code is Ready Before Your Coffee Gets Cold"
        */}
        <div className="text-center mb-12 pt-8">
          <span className="section-header">
            <QrCode size={14} />
            Free QR code generator — no account needed
          </span>
          <h1 className="text-3xl md:text-5xl font-bold text-white mt-4 mb-4">
            Generate a free QR code —{" "}
            <span className="gradient-text">custom style, instant download</span>
          </h1>
          {/*
            Deliverable 4: Subheading rewrite — benefit-led, India-first
            Deliverable 5: Secondary CTA — no "sign up" verb
            Deliverable 9: Internal link to /dynamic-qr
          */}
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
            No account. No credit card. No expiry. Paste your link or content, pick a
            style, and download a 600px PNG — ready to print or share in under a minute.
          </p>
          <p className="text-zinc-500 text-sm mt-3">
            Need to edit it after printing or track every scan?{" "}
            <Link to="/dynamic-qr" className="text-violet-400 hover:text-violet-300 underline underline-offset-2">
              See how dynamic QR codes work →
            </Link>
          </p>

          {/* Trust bar */}
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 mt-6 text-xs text-zinc-500">
            {["No account required", "600px PNG download", "6 dot styles", "Custom colours", "Works on all printers"].map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-violet-500 inline-block" />
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* ── Generator tool ───────────────────────────────────────────────── */}
        <div className="grid lg:grid-cols-2 gap-8 max-w-5xl mx-auto">

          {/* Left: Controls */}
          <div className="space-y-6">

            {/* Step 1 — Type */}
            {/* Deliverable 4: QR type descriptions rewritten benefit-led */}
            <div className="glass-card p-6 rounded-2xl">
              <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
                <span className="step-indicator active">1</span>
                What do you want your QR code to do?
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {qrTypes.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setActiveType(type.id)}
                    className={cn(
                      "qr-type-card flex items-center gap-3 rounded-xl p-4 text-left",
                      activeType === type.id && "selected"
                    )}
                  >
                    <span className={cn(
                      "flex-shrink-0",
                      activeType === type.id ? "text-violet-400" : "text-zinc-500"
                    )}>
                      {type.icon}
                    </span>
                    <div>
                      <div className="text-white text-sm font-medium">{type.label}</div>
                      <div className="text-zinc-500 text-xs">{type.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2 — Content */}
            <div className="glass-card p-6 rounded-2xl">
              <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
                <span className="step-indicator active">2</span>
                Add your content
              </h2>

              {activeType === "url" && (
                <div>
                  <label className="label-text">Website URL</label>
                  <Input
                    placeholder="https://example.com"
                    value={fields.url ?? ""}
                    onChange={(e) => setField("url", e.target.value)}
                  />
                </div>
              )}

              {activeType === "wifi" && (
                <div className="space-y-3">
                  <div>
                    <label className="label-text">Network Name (SSID)</label>
                    <Input
                      placeholder="MyWiFiNetwork"
                      value={fields.ssid ?? ""}
                      onChange={(e) => setField("ssid", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label-text">Password</label>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={fields.password ?? ""}
                      onChange={(e) => setField("password", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label-text mb-1 block">Security</label>
                    <Select
                      defaultValue="WPA"
                      onValueChange={(v) => setField("security", v)}
                    >
                      <SelectTrigger className="input-field bg-transparent h-10 px-3 py-2">
                        <SelectValue placeholder="Select security" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-950 border-zinc-800 text-zinc-300">
                        <SelectItem value="WPA">WPA/WPA2</SelectItem>
                        <SelectItem value="WEP">WEP</SelectItem>
                        <SelectItem value="none">None</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {activeType === "whatsapp" && (
                <div className="space-y-3">
                  <div>
                    <label className="label-text">Phone Number (with country code)</label>
                    <Input
                      placeholder="+91 98765 43210"
                      value={fields.phone ?? ""}
                      onChange={(e) => setField("phone", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label-text">Pre-filled message (optional)</label>
                    <Input
                      placeholder="Hello! I found your QR code..."
                      value={fields.message ?? ""}
                      onChange={(e) => setField("message", e.target.value)}
                    />
                  </div>
                </div>
              )}

              {activeType === "instagram" && (
                <div>
                  <label className="label-text">Instagram Username</label>
                  <div className="flex">
                    <span className="flex items-center px-3 bg-zinc-800 border border-r-0 border-zinc-700 rounded-l-xl text-zinc-400 text-sm">@</span>
                    <Input
                      className="rounded-l-none"
                      placeholder="yourusername"
                      value={fields.username ?? ""}
                      onChange={(e) => setField("username", e.target.value)}
                    />
                  </div>
                </div>
              )}

              {activeType === "sms" && (
                <div className="space-y-3">
                  <div>
                    <label className="label-text">Phone Number (with country code)</label>
                    <Input
                      placeholder="+91 98765 43210"
                      value={fields.smsPhone ?? ""}
                      onChange={(e) => setField("smsPhone", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label-text">Pre-filled message (optional)</label>
                    <Input
                      placeholder="Your message..."
                      value={fields.smsBody ?? ""}
                      onChange={(e) => setField("smsBody", e.target.value)}
                    />
                  </div>
                </div>
              )}

              {activeType === "phone" && (
                <div>
                  <label className="label-text">Phone Number (with country code)</label>
                  <Input
                    placeholder="+91 98765 43210"
                    value={fields.phoneNumber ?? ""}
                    onChange={(e) => setField("phoneNumber", e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Step 3 — Colors */}
            <div className="glass-card p-6 rounded-2xl">
              <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
                <span className="step-indicator active">3</span>
                <Palette size={16} className="text-zinc-400" />
                Choose your colours
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-text">Dot colour</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="color"
                      value={fgColor}
                      onChange={(e) => setFgColor(e.target.value)}
                      className="w-10 h-10 rounded-lg border border-zinc-700 bg-transparent cursor-pointer p-0.5"
                    />
                    <Input
                      value={fgColor}
                      onChange={(e) => setFgColor(e.target.value)}
                      className="font-mono text-sm"
                      maxLength={7}
                    />
                  </div>
                </div>
                <div>
                  <label className="label-text">Background colour</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="color"
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="w-10 h-10 rounded-lg border border-zinc-700 bg-transparent cursor-pointer p-0.5"
                    />
                    <Input
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="font-mono text-sm"
                      maxLength={7}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Step 4 — Shapes */}
            <div className="glass-card p-6 rounded-2xl">
              <h2 className="text-white font-semibold mb-5 flex items-center gap-2">
                <span className="step-indicator active">4</span>
                Dot &amp; eye shapes
              </h2>

              <div className="space-y-5">
                {/* Dot shape */}
                <div>
                  <label className="label-text mb-2 block">Dot style</label>
                  <div className="grid grid-cols-3 gap-2">
                    {DOT_SHAPES.map(({ type, label }) => (
                      <button
                        key={type}
                        onClick={() => setDotShape(type)}
                        className={cn(
                          "py-2 px-3 rounded-lg border text-xs font-medium transition-all",
                          dotShape === type
                            ? "border-violet-500 bg-violet-500/15 text-violet-300"
                            : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Eye (corner square) shape */}
                <div>
                  <label className="label-text mb-2 block">Eye frame shape</label>
                  <div className="grid grid-cols-3 gap-2">
                    {EYE_SHAPES.map(({ type, label }) => (
                      <button
                        key={type}
                        onClick={() => setEyeShape(type)}
                        className={cn(
                          "py-2 px-3 rounded-lg border text-xs font-medium transition-all",
                          eyeShape === type
                            ? "border-violet-500 bg-violet-500/15 text-violet-300"
                            : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Eye dot (corner dot) shape */}
                <div>
                  <label className="label-text mb-2 block">Eye centre shape</label>
                  <div className="grid grid-cols-3 gap-2">
                    {EYE_DOT_SHAPES.map(({ type, label }) => (
                      <button
                        key={type}
                        onClick={() => setEyeDotShape(type)}
                        className={cn(
                          "py-2 px-3 rounded-lg border text-xs font-medium transition-all",
                          eyeDotShape === type
                            ? "border-violet-500 bg-violet-500/15 text-violet-300"
                            : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Preview */}
          {/*
            Deliverable 5: Download CTA + upgrade CTA
            Deliverable 9: Internal links — /dynamic-qr, /app/create
          */}
          <div className="sticky top-24 self-start">
            <div className="glass-card p-8 rounded-2xl text-center">
              <h2 className="text-white font-semibold mb-1">Your QR code</h2>
              <p className="text-zinc-500 text-xs mb-6">Updates live as you make changes</p>

              {/* Real QR output */}
              <div
                className="mx-auto mb-6 rounded-2xl overflow-hidden flex items-center justify-center"
                style={{ background: bgColor, padding: 20, display: "inline-flex" }}
              >
                <div ref={qrRef} />
              </div>

              {/* Deliverable 5: Primary CTA — Download */}
              <Button className="w-full mb-4" size="lg" onClick={handleDownload}>
                <Download size={16} />
                Download PNG (600×600px)
              </Button>

              {/* Upgrade nudge — no "sign up" verb */}
              <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 text-left">
                <p className="text-violet-300 text-xs font-semibold mb-1">
                  Want to edit this QR code after printing?
                </p>
                <p className="text-zinc-500 text-xs mb-3">
                  Dynamic QR codes let you change the destination any time — and track
                  every scan by city, device, and time. Free plan available.
                </p>
                <Link to="/dynamic-qr">
                  <Button variant="ghost" size="sm" className="text-violet-400 hover:text-violet-300 w-full justify-start px-0">
                    See how dynamic QR works
                    <ArrowRight size={14} />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* ── Why upgrade section ──────────────────────────────────────────── */}
        {/* Deliverable 4: New below-the-fold section for SEO + conversion */}
        {/* Deliverable 9: Internal links — /features, /pricing, /dynamic-qr */}
        <section className="mt-20 max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
              This is a static QR code.{" "}
              <span className="gradient-text">Here's what you're missing.</span>
            </h2>
            <p className="text-zinc-400 max-w-xl mx-auto text-sm">
              Static QR codes work — but once printed, they're frozen. Dynamic QR codes
              on GenXQR give you control after the QR code leaves your hands.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                icon: <RefreshCw size={20} className="text-blue-400" />,
                bg: "bg-blue-500/10 border-blue-500/20",
                title: "Edit after printing",
                desc: "Change the destination URL any time — same QR code, no reprint. Live in under one second.",
              },
              {
                icon: <BarChart3 size={20} className="text-violet-400" />,
                bg: "bg-violet-500/10 border-violet-500/20",
                title: "Track every scan",
                desc: "See city, device, OS, and browser for every scan. Updated in real time on your dashboard.",
              },
              {
                icon: <Shield size={20} className="text-red-400" />,
                bg: "bg-red-500/10 border-red-500/20",
                title: "Password & expiry",
                desc: "Lock with a password, set active date windows, or cap total scans — per QR code.",
              },
              {
                icon: <Zap size={20} className="text-amber-400" />,
                bg: "bg-amber-500/10 border-amber-500/20",
                title: "A/B test campaigns",
                desc: "Split traffic between two destinations and see which version drives more conversions.",
              },
            ].map((card) => (
              <div key={card.title} className={`glass-card rounded-xl p-5 border ${card.bg}`}>
                <div className={`w-10 h-10 rounded-lg border flex items-center justify-center mb-3 ${card.bg}`}>
                  {card.icon}
                </div>
                <h3 className="text-white font-semibold text-sm mb-1">{card.title}</h3>
                <p className="text-zinc-400 text-xs leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
            <Link to="/app/create">
              <Button size="lg" variant="glow">
                Create a trackable QR code — free
                <ArrowRight size={16} />
              </Button>
            </Link>
            <Link to="/pricing">
              <Button size="lg" variant="secondary">
                View plans from ₹299/month
              </Button>
            </Link>
          </div>
        </section>

        {/* ── FAQ section ─────────────────────────────────────────────────── */}
        {/* Deliverable 7: 5 questions targeting Cluster D featured snippets */}
        <section className="mt-20 max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
              Questions about{" "}
              <span className="gradient-text">QR code generators</span>
            </h2>
            <p className="text-zinc-400 text-sm">
              Everything you need to know before you generate and print.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {faqs.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
          <p className="text-center text-zinc-600 text-xs mt-8">
            More questions?{" "}
            <Link to="/faq" className="text-violet-400 hover:text-violet-300 underline underline-offset-2">
              See the full FAQ →
            </Link>
            {" "}or{" "}
            <Link to="/features" className="text-violet-400 hover:text-violet-300 underline underline-offset-2">
              explore all features →
            </Link>
          </p>
        </section>

      </div>
    </div>
  )
}
