import { Link, useLocation } from "react-router-dom"
import {
  QrCode, Wifi, MessageCircle, Instagram, ArrowRight,
  Download, Palette, Phone, MessageSquare, ChevronDown,
  BarChart3, RefreshCw, Shield, Zap, IndianRupee,
  Contact, Mail, MapPin, Type, Youtube,
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
import { Eyebrow } from "@/components/marketing/ui"
import { GENERATOR_GUIDES, type GeneratorGuide } from "@/content/generator-guides"
import { GuideSections, faqJsonLd } from "@/components/marketing/GuideContent"
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
    "url": "https://genxqr.com/generate",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "INR",
      "description": "Free QR code generator for URL, WiFi, WhatsApp, Instagram, UPI, SMS, phone, vCard contact cards, email, Google Maps locations, YouTube and plain text. Custom colours, dot shapes, instant PNG download. No account required.",
    },
    "featureList": [
      "URL QR code generator",
      "WiFi QR code generator",
      "WhatsApp QR code generator",
      "Instagram QR code generator",
      "UPI payment QR code generator",
      "SMS QR code generator",
      "Phone number QR code",
      "vCard contact QR code",
      "Email QR code",
      "Google Maps location QR code",
      "YouTube QR code",
      "Plain text QR code",
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
          "text": "Use GenXQR's free generator at genxqr.com/generate. Pick a QR type (URL, WiFi, WhatsApp, Instagram, UPI, SMS, phone, contact card, email, location, YouTube or plain text), enter your content, customise the colour and dot style, and click Download PNG. No account, no credit card, and no expiry — the QR code is yours to use forever. For QR codes you can edit after printing and track every scan, start a 14-day free trial (no credit card) and use the dynamic QR creator.",
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
          "text": "Yes. GenXQR's free generator lets you pick any foreground (dot) colour and background colour using the colour picker. You can also choose from six dot styles (square, rounded, dots, classy, classy-rounded, extra-rounded) three eye frame shapes, and two eye centre shapes. The preview updates live as you change options. For logo upload and brand-level customisation, use the full QR creator during a 14-day free trial or on a paid plan.",
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

/**
 * A type page's own structured data: the tool at THIS address, its FAQs (the
 * same ones shown on the page) and where it sits in the site. Every type page
 * used to carry the hub's FAQ schema, so all five had the same five questions.
 */
function typeJsonLd(path: string, guide: GeneratorGuide, description: string) {
  const url = `https://genxqr.com${path}`
  return [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": `GenXQR free ${guide.name}`,
      "applicationCategory": "UtilitiesApplication",
      "operatingSystem": "Web",
      "url": url,
      "description": description,
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "INR" },
    },
    faqJsonLd(guide.faqs),
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://genxqr.com" },
        { "@type": "ListItem", "position": 2, "name": "Free QR code generator", "item": "https://genxqr.com/generate" },
        { "@type": "ListItem", "position": 3, "name": guide.name.replace(/^./, (c) => c.toUpperCase()), "item": url },
      ],
    },
  ]
}

// ─── Types ────────────────────────────────────────────────────────────────────

type QRTypeId =
  | "url" | "wifi" | "whatsapp" | "instagram" | "upi" | "sms" | "phone"
  | "vcard" | "email" | "location" | "text" | "youtube"

const qrTypes: { id: QRTypeId; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: "url",       label: "URL / Website", icon: <QrCode size={20} />,       desc: "Link to any page or offer" },
  { id: "wifi",      label: "WiFi",          icon: <Wifi size={20} />,          desc: "Connect guests instantly" },
  { id: "whatsapp",  label: "WhatsApp",      icon: <MessageCircle size={20} />, desc: "Open a chat directly" },
  { id: "instagram", label: "Instagram",     icon: <Instagram size={20} />,     desc: "Drive profile follows" },
  { id: "upi",       label: "UPI Payment",   icon: <IndianRupee size={20} />,   desc: "Get paid by any UPI app" },
  { id: "sms",       label: "SMS",           icon: <MessageSquare size={20} />, desc: "Pre-filled text message" },
  { id: "phone",     label: "Phone",         icon: <Phone size={20} />,         desc: "One tap to call" },
  { id: "vcard",     label: "Contact card",  icon: <Contact size={20} />,       desc: "Save to contacts" },
  { id: "email",     label: "Email",         icon: <Mail size={20} />,          desc: "A ready-to-send email" },
  { id: "location",  label: "Location",      icon: <MapPin size={20} />,        desc: "Open a place in Google Maps" },
  { id: "youtube",   label: "YouTube",       icon: <Youtube size={20} />,       desc: "Open a video or channel" },
  { id: "text",      label: "Plain text",    icon: <Type size={20} />,          desc: "Show a short message" },
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

/**
 * The QR library stores each character as ONE byte (its char code & 0xff), so
 * anything outside Latin-1 — ₹, Hindi, emoji, even curly quotes — came out as
 * garbage. Handing it the UTF-8 bytes as a byte string fixes that, and every
 * phone scanner reads UTF-8. Plain ASCII is unchanged byte for byte, so codes
 * people made before this scan exactly as they did.
 */
function toQRBytes(text: string): string {
  let out = ""
  for (const b of new TextEncoder().encode(text)) out += String.fromCharCode(b)
  return out
}

/** vCard 3.0 text value: backslash, comma, semicolon and newlines escaped (RFC 2426). */
function vcardText(v: string | undefined): string {
  return (v ?? "").trim().replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/[,;]/g, (ch) => `\\${ch}`)
}

/** A YouTube link from a pasted link, a video ID or an @handle. */
function youtubeLink(input: string | undefined): string {
  const v = (input ?? "").trim()
  if (!v) return "https://www.youtube.com"
  if (/^https?:\/\//i.test(v)) return v
  if (/^(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(v)) return `https://${v}`
  if (/^@[\w.-]{3,30}$/.test(v)) return `https://www.youtube.com/${v}`
  if (/^[\w-]{11}$/.test(v)) return `https://youtu.be/${v}`
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(v)}`
}

function buildQRData(
  type: QRTypeId,
  fields: Record<string, string>
): string {
  switch (type) {
    case "url":
      return fields.url?.trim() || "https://genxqr.com"
    case "wifi": {
      // The WIFI: format (defined by ZXing) uses T:nopass for an open network —
      // "none" is not a recognised value — and requires \ ; , : " in the network
      // name or password to be backslash-escaped, or the fields split wrongly.
      const esc = (v: string) => v.replace(/[\\;,:"]/g, (ch) => `\\${ch}`)
      const sec = fields.security === "none" ? "nopass" : fields.security || "WPA"
      const ssid = esc(fields.ssid || "")
      if (sec === "nopass") return `WIFI:T:nopass;S:${ssid};;`
      return `WIFI:T:${sec};S:${ssid};P:${esc(fields.password || "")};;`
    }
    case "whatsapp": {
      const num = (fields.phone || "").replace(/\D/g, "")
      const msg = encodeURIComponent(fields.message || "")
      return `https://wa.me/${num}${msg ? `?text=${msg}` : ""}`
    }
    case "instagram":
      return `https://instagram.com/${fields.username || ""}`
    case "upi": {
      // NPCI's UPI link, read directly by GPay, PhonePe, Paytm, BHIM and bank apps.
      // The UPI ID goes in as written (its @ unescaped): some UPI apps don't decode %40.
      const upiId = (fields.upiId || "").trim().replace(/[^a-zA-Z0-9.@_-]/g, "")
      const amount = (fields.upiAmount || "").trim()
      const am = /^\d{1,6}(\.\d{1,2})?$/.test(amount) && Number(amount) > 0 ? `&am=${Number(amount).toFixed(2)}` : ""
      const note = (fields.upiNote || "").trim().slice(0, 50)
      return `upi://pay?pa=${upiId}&pn=${encodeURIComponent((fields.upiName || "").trim())}${am}&cu=INR${note ? `&tn=${encodeURIComponent(note)}` : ""}`
    }
    case "sms": {
      const num = (fields.smsPhone || "").replace(/[^+\d]/g, "")
      const body = encodeURIComponent(fields.smsBody || "")
      return `sms:${num}${body ? `?body=${body}` : ""}`
    }
    case "phone": {
      const num = (fields.phoneNumber || "").replace(/[^+\d]/g, "")
      return `tel:${num}`
    }
    case "vcard": {
      // vCard 3.0 is what the iPhone and Android cameras recognise as "add
      // contact". Empty fields are left out rather than sent blank.
      const first = vcardText(fields.vcFirst)
      const last = vcardText(fields.vcLast)
      const org = vcardText(fields.vcOrg)
      const full = [first, last].filter(Boolean).join(" ") || org || "Contact"
      const lines = ["BEGIN:VCARD", "VERSION:3.0", `N:${last};${first};;;`, `FN:${full}`]
      if (org) lines.push(`ORG:${org}`)
      if (fields.vcTitle?.trim()) lines.push(`TITLE:${vcardText(fields.vcTitle)}`)
      const tel = (fields.vcPhone || "").replace(/[^+\d]/g, "")
      if (tel) lines.push(`TEL;TYPE=CELL:${tel}`)
      if (fields.vcEmail?.trim()) lines.push(`EMAIL:${fields.vcEmail.trim()}`)
      if (fields.vcWebsite?.trim()) lines.push(`URL:${fields.vcWebsite.trim()}`)
      if (fields.vcAddress?.trim()) lines.push(`ADR;TYPE=WORK:;;${vcardText(fields.vcAddress)};;;;`)
      lines.push("END:VCARD")
      return lines.join("\r\n")
    }
    case "email": {
      const to = (fields.emailTo || "").replace(/\s/g, "")
      const params = [
        fields.emailSubject?.trim() && `subject=${encodeURIComponent(fields.emailSubject.trim())}`,
        fields.emailBody?.trim() && `body=${encodeURIComponent(fields.emailBody.trim())}`,
      ].filter(Boolean)
      return `mailto:${to}${params.length ? `?${params.join("&")}` : ""}`
    }
    case "location": {
      // A Google Maps link (their documented "search" URL) rather than a geo:
      // URI, which scanner apps handle unevenly: an https link opens the Maps
      // app or the browser on any phone. A pasted Maps link is used as it is.
      const place = (fields.place || "").trim()
      if (/^https?:\/\//i.test(place)) return place
      const coords = place.match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/)
      const query = coords ? `${coords[1]},${coords[2]}` : place
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    }
    case "youtube":
      return youtubeLink(fields.youtube)
    case "text":
      return fields.text?.trim() ? fields.text : "Your text here"
    default:
      return "https://genxqr.com"
  }
}

/** Same look as <Input>, for the two multi-line fields. */
const TEXTAREA_CLASS =
  "flex min-h-[96px] w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 " +
  "placeholder:text-zinc-400 focus-visible:outline-none focus-visible:border-violet-500 focus-visible:ring-1 " +
  "focus-visible:ring-violet-500/50 transition-colors dark:border-zinc-800 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-500"

/** Plain text above this many bytes makes a dense code that small prints struggle with. */
const TEXT_SOFT_LIMIT = 300

// ─── FAQ accordion ────────────────────────────────────────────────────────────
// Deliverable 7: 5 questions targeting Cluster D featured snippets

const faqs = [
  {
    q: "How do I create a QR code for free?",
    a: "Use the generator on this page. Pick a QR type (URL, WiFi, WhatsApp, Instagram, UPI, SMS, phone, contact card, email, location, YouTube or plain text), enter your content, customise the colour and dot style, then click Download PNG. No account, no credit card, and no expiry — the QR code is yours forever. For QR codes you can edit after printing and track every scan, start a 14-day GenXQR free trial (no credit card) and use the dynamic QR creator.",
  },
  {
    q: "What is the difference between a static and dynamic QR code?",
    a: "A static QR code has the destination permanently encoded — once printed, it cannot be changed. A dynamic QR code contains a short redirect link you can update at any time without reprinting. Dynamic codes also track every scan with city, device, and time data. Use static for permanent content; use dynamic for menus, packaging, and campaigns that may need updating. Dynamic QR codes are available from ₹299/month on GenXQR.",
  },
  {
    q: "Can I customise the colour of my QR code?",
    a: "Yes — pick any foreground dot colour and background colour using the colour picker in Step 3. You can also choose from six dot styles (square, rounded, dots, classy, classy-rounded, extra-rounded) three eye frame shapes, and two eye centre shapes. The preview updates live. For logo upload and full brand customisation, use the full QR editor during a 14-day free trial or on a paid plan.",
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

/** The written guide for one QR type (content/generator-guides.ts). */
function TypeGuide({ guide }: { guide: GeneratorGuide }) {
  return <GuideSections sections={guide.sections} className="mt-20" />
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-line rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left text-ink font-semibold text-sm hover:bg-paper transition-colors"
        aria-expanded={open}
      >
        <span>{q}</span>
        <ChevronDown
          size={18}
          className={cn("text-ink-soft shrink-0 transition-transform duration-200", open && "rotate-180")}
        />
      </button>
      {/* Always in the HTML, hidden when collapsed — see FaqAccordion. */}
      <div hidden={!open} className="px-6 pb-5 text-ink-soft text-sm leading-relaxed border-t border-line">
        <p className="pt-4">{a}</p>
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * /generate and its four type routes used to render one identical page — the
 * URL tab selected and canonical /generate on every route — so search engines
 * saw /generate/wifi etc. as duplicates of /generate. Each type route now opens
 * its own tab and has its own title, description, H1, intro and self-canonical.
 * Copy describes only what the generator encodes (see the payload builder).
 */
const TYPE_PAGES: Partial<Record<QRTypeId, { title: string; description: string; h1: string; accent: string; intro: string }>> = {
  url: {
    title: "Free URL to QR Code Generator — Any Website Address",
    description: "Turn any website address (URL) into a free QR code. Custom colours and dot styles, instant 600px PNG download. No account or credit card needed.",
    h1: "Free URL to QR code generator —",
    accent: "turn any web address into a QR code",
    intro: "Paste any URL or website address and get a QR code that opens it when scanned. The link is stored in the code itself, so it works without an account and never expires.",
  },
  wifi: {
    title: "Free WiFi QR Code Generator — Share Your Network",
    description: "Make a free WiFi QR code from your network name, password and security type. Guests scan it to join without typing the password. PNG download, no account.",
    h1: "Free WiFi QR code generator —",
    accent: "share your network",
    intro: "Enter your network name, password and security type (WPA/WPA2, WEP or none). The code stores them in the standard WiFi QR format, so guests can scan it with their phone camera to join without typing the password.",
  },
  whatsapp: {
    title: "Free WhatsApp QR Code Generator — Open a Chat",
    description: "Make a free WhatsApp QR code that opens a chat with your number, with an optional pre-filled message. Custom colours, PNG download, no account needed.",
    h1: "Free WhatsApp QR code generator —",
    accent: "open a chat in one scan",
    intro: "Enter your WhatsApp number and, optionally, a message. The code opens a wa.me link, which starts a WhatsApp chat with you and the message already typed in.",
  },
  instagram: {
    title: "Free Instagram QR Code Generator — Link Your Profile",
    description: "Make a free Instagram QR code that opens your profile when scanned. Custom colours and dot styles, instant PNG download, no account needed.",
    h1: "Free Instagram QR code generator —",
    accent: "link your profile",
    intro: "Enter your Instagram username and get a QR code that opens your profile at instagram.com when scanned. Print it on packaging, menus or signage to turn visitors into followers.",
  },
  upi: {
    title: "Free UPI QR Code Generator — Get Paid by Any UPI App",
    description: "Make a free UPI payment QR code from your UPI ID, with an optional fixed amount. Scans in Google Pay, PhonePe, Paytm and BHIM. PNG download, no account needed.",
    h1: "Free UPI QR code generator —",
    accent: "get paid by any UPI app",
    intro: "Enter your UPI ID and the name payments go to, and optionally a fixed amount and a note. The code holds a standard UPI payment link, so customers scan it in Google Pay, PhonePe, Paytm, BHIM or their bank's app and the details are filled in for them. Check a small test payment before you print.",
  },
  sms: {
    title: "Free SMS QR Code Generator — Pre-Filled Text Message",
    description: "Make a free SMS QR code that opens the messaging app with your number and a message already typed. Works on any phone. PNG download, no account needed.",
    h1: "Free SMS QR code generator —",
    accent: "a text message, ready to send",
    intro: "Enter a phone number and, optionally, a message. Scanning the code opens the phone's messaging app with both filled in, so the person only has to tap Send.",
  },
  phone: {
    title: "Free Phone Number QR Code Generator — Tap to Call",
    description: "Make a free QR code that opens the dialler with your phone number filled in. Ideal for signboards, vehicles and stickers. PNG download, no account needed.",
    h1: "Free phone number QR code generator —",
    accent: "one tap to call",
    intro: "Enter your phone number with its country code. Scanning the code opens the dialler with the number already entered, so nobody misdials.",
  },
  vcard: {
    title: "Free vCard QR Code Generator — Digital Business Card",
    description: "Make a free vCard QR code: scan it and your name, number, email and company are saved to contacts in one tap. Works on iPhone and Android. PNG download, no account.",
    h1: "Free vCard QR code generator —",
    accent: "save your contact in one scan",
    intro: "Enter your name, mobile number, email and, if you like, your company, title, website and address. The code holds a standard vCard, so a phone camera offers to add you to contacts with every detail filled in.",
  },
  email: {
    title: "Free Email QR Code Generator — Pre-Filled Email",
    description: "Make a free email QR code that opens a new email to your address, with an optional subject and message already written. PNG download, no account needed.",
    h1: "Free email QR code generator —",
    accent: "an email, ready to send",
    intro: "Enter the address emails should go to and, optionally, a subject and message. Scanning the code opens the phone's email app with everything filled in, so the person only has to tap Send.",
  },
  location: {
    title: "Free Location QR Code Generator — Open Google Maps",
    description: "Make a free QR code that opens a place in Google Maps: enter an address, place name or coordinates, or paste a Maps link. PNG download, no account needed.",
    h1: "Free location QR code generator —",
    accent: "open your place in Google Maps",
    intro: "Enter an address, a place name or coordinates, or paste a link from Google Maps. Scanning the code opens Google Maps at that place, so visitors can get directions without typing anything.",
  },
  youtube: {
    title: "Free YouTube QR Code Generator — Video or Channel",
    description: "Make a free YouTube QR code that opens your video, Short, playlist or channel. Paste the link or type your @handle. Custom colours, PNG download, no account.",
    h1: "Free YouTube QR code generator —",
    accent: "open your video or channel",
    intro: "Paste a YouTube video, Short, playlist or channel link, or type your channel's @handle. Scanning the code opens it on YouTube, usually in the YouTube app if the phone has it.",
  },
  text: {
    title: "Free Text QR Code Generator — Show a Message",
    description: "Make a free QR code that shows a short text message when scanned: instructions, a code, a note. Works offline, no link needed. PNG download, no account.",
    h1: "Free text QR code generator —",
    accent: "show a message when scanned",
    intro: "Type a short message. The text is stored in the code itself, so scanning shows it on the phone without opening a website, even without an internet connection.",
  },
}

const TYPE_FROM_PATH: Record<string, QRTypeId> = {
  "/generate/url": "url",
  "/generate/wifi": "wifi",
  "/generate/whatsapp": "whatsapp",
  "/generate/instagram": "instagram",
  "/generate/upi": "upi",
  "/generate/sms": "sms",
  "/generate/phone": "phone",
  "/generate/vcard": "vcard",
  "/generate/email": "email",
  "/generate/location": "location",
  "/generate/youtube": "youtube",
  "/generate/text": "text",
}

export default function StaticGeneratePage() {
  const { pathname } = useLocation()
  const routeType = TYPE_FROM_PATH[pathname]
  const typePage = routeType ? TYPE_PAGES[routeType] : undefined
  const guide = routeType ? GENERATOR_GUIDES[routeType] : undefined
  const pageFaqs = guide ? guide.faqs : faqs
  const [activeType, setActiveType] = useState<QRTypeId>(routeType ?? "url")
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
      data: "https://genxqr.com",
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
      data: toQRBytes(buildQRData(activeType, fields)),
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
      data: toQRBytes(buildQRData(activeType, fields)),
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
        title={typePage?.title ?? "Free QR Code Generator — No Account Needed"}
        description={typePage?.description ?? "Free QR code generator for links, WiFi, WhatsApp, UPI, contact cards, email, maps, YouTube and more. Custom colours and dot shapes, PNG download. No account needed."}
        url={routeType ? `/generate/${routeType}` : "/generate"}
        jsonLd={guide && typePage ? typeJsonLd(`/generate/${routeType}`, guide, typePage.description) : GENERATE_JSON_LD}
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
          {/* Uses the shared marketing Eyebrow rather than the legacy
              `.section-header` pill: that class is violet-400 on a violet tint,
              which fails contrast on the light paper background. Its three
              remaining users are auth pages — a separate surface — so it is
              left in place there. */}
          <Eyebrow className="justify-center">Free QR code generator — no account needed</Eyebrow>
          <h1 className="text-3xl md:text-5xl font-bold text-ink mt-4 mb-4">
            {typePage ? typePage.h1 : "Generate a free QR code —"}{" "}
            <span className="text-accent">{typePage ? typePage.accent : "custom style, instant download"}</span>
          </h1>
          {/*
            Deliverable 4: Subheading rewrite — benefit-led, India-first
            Deliverable 5: Secondary CTA — no "sign up" verb
            Deliverable 9: Internal link to /dynamic-qr
          */}
          <p className="text-ink-soft text-lg max-w-2xl mx-auto">
            {typePage
              ? typePage.intro
              : "No account. No credit card. No expiry. Paste your link or content, pick a style, and download a 600px PNG — ready to print or share in under a minute."}
          </p>
          <p className="text-ink-faint text-sm mt-3">
            Need to edit it after printing or track every scan?{" "}
            <Link to="/dynamic-qr" className="text-accent hover:text-accent-ink underline underline-offset-2">
              See how dynamic QR codes work →
            </Link>
          </p>

          {/* Trust bar */}
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 mt-6 text-xs text-ink-faint">
            {["No account required", "600px PNG download", "6 dot styles", "Custom colours", "Never expires"].map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-accent inline-block" />
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* ── Generator tool ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">

          {/* Left: Controls */}
          <div className="space-y-6">

            {/* Step 1 — Type */}
            {/* Deliverable 4: QR type descriptions rewritten benefit-led */}
            <div className="glass-card p-6 rounded-2xl">
              <h2 className="text-ink font-semibold mb-4 flex items-center gap-2">
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
                      activeType === type.id ? "text-accent" : "text-ink-faint"
                    )}>
                      {type.icon}
                    </span>
                    <div>
                      <div className="text-ink text-sm font-medium">{type.label}</div>
                      <div className="text-ink-faint text-xs">{type.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2 — Content */}
            <div className="glass-card p-6 rounded-2xl">
              <h2 className="text-ink font-semibold mb-4 flex items-center gap-2">
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
                    {/* A WiFi passphrase being encoded into a QR code — nothing
                        to do with a GenXQR account, so the browser must not
                        offer the saved one. This page is public. */}
                    <Input
                      type="password"
                      name="wifi-passphrase"
                      autoComplete="off"
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
                      <SelectContent className="bg-paper-pure border-line text-ink-soft">
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
                    <span className="flex items-center px-3 bg-paper border border-r-0 border-line rounded-l-xl text-ink-soft text-sm">@</span>
                    <Input
                      className="rounded-l-none"
                      placeholder="yourusername"
                      value={fields.username ?? ""}
                      onChange={(e) => setField("username", e.target.value)}
                    />
                  </div>
                </div>
              )}

              {activeType === "upi" && (
                <div className="space-y-3">
                  <div>
                    <label className="label-text">UPI ID</label>
                    <Input
                      placeholder="yourshop@okhdfcbank"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={fields.upiId ?? ""}
                      onChange={(e) => setField("upiId", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label-text">Pay to (name shown to the customer)</label>
                    <Input
                      placeholder="Blue Cafe"
                      value={fields.upiName ?? ""}
                      onChange={(e) => setField("upiName", e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label-text">Amount in ₹ (optional)</label>
                      <Input
                        inputMode="decimal"
                        placeholder="Customer enters it"
                        value={fields.upiAmount ?? ""}
                        onChange={(e) => setField("upiAmount", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label-text">Note (optional)</label>
                      <Input
                        maxLength={50}
                        placeholder="Order 123"
                        value={fields.upiNote ?? ""}
                        onChange={(e) => setField("upiNote", e.target.value)}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-ink-soft leading-relaxed">
                    The payment details are stored in the code itself, so it can't be changed or tracked after printing. For a code you can edit, with scan counts, use a dynamic UPI code in your GenXQR dashboard.
                  </p>
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

              {activeType === "vcard" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label-text">First name</label>
                      <Input placeholder="Priya" autoComplete="off" value={fields.vcFirst ?? ""} onChange={(e) => setField("vcFirst", e.target.value)} />
                    </div>
                    <div>
                      <label className="label-text">Last name</label>
                      <Input placeholder="Sharma" autoComplete="off" value={fields.vcLast ?? ""} onChange={(e) => setField("vcLast", e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="label-text">Mobile number (with country code)</label>
                    <Input placeholder="+91 98765 43210" autoComplete="off" value={fields.vcPhone ?? ""} onChange={(e) => setField("vcPhone", e.target.value)} />
                  </div>
                  <div>
                    <label className="label-text">Email</label>
                    <Input type="email" placeholder="priya@example.com" autoComplete="off" value={fields.vcEmail ?? ""} onChange={(e) => setField("vcEmail", e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label-text">Company (optional)</label>
                      <Input placeholder="Sharma Interiors" autoComplete="off" value={fields.vcOrg ?? ""} onChange={(e) => setField("vcOrg", e.target.value)} />
                    </div>
                    <div>
                      <label className="label-text">Job title (optional)</label>
                      <Input placeholder="Founder" autoComplete="off" value={fields.vcTitle ?? ""} onChange={(e) => setField("vcTitle", e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="label-text">Website (optional)</label>
                    <Input placeholder="https://example.com" autoComplete="off" value={fields.vcWebsite ?? ""} onChange={(e) => setField("vcWebsite", e.target.value)} />
                  </div>
                  <div>
                    <label className="label-text">Address (optional)</label>
                    <Input placeholder="12 MG Road, Bengaluru 560001" autoComplete="off" value={fields.vcAddress ?? ""} onChange={(e) => setField("vcAddress", e.target.value)} />
                  </div>
                  <p className="text-xs text-ink-soft leading-relaxed">
                    Every detail is stored in the code itself, so more details make a denser code. Leave out what people don't need.
                  </p>
                </div>
              )}

              {activeType === "email" && (
                <div className="space-y-3">
                  <div>
                    <label className="label-text">Send to (email address)</label>
                    <Input type="email" placeholder="hello@example.com" autoComplete="off" value={fields.emailTo ?? ""} onChange={(e) => setField("emailTo", e.target.value)} />
                  </div>
                  <div>
                    <label className="label-text">Subject (optional)</label>
                    <Input placeholder="Enquiry from your poster" value={fields.emailSubject ?? ""} onChange={(e) => setField("emailSubject", e.target.value)} />
                  </div>
                  <div>
                    <label className="label-text">Message (optional)</label>
                    <textarea
                      className={TEXTAREA_CLASS}
                      placeholder="Hi, I'd like to know more about…"
                      value={fields.emailBody ?? ""}
                      onChange={(e) => setField("emailBody", e.target.value)}
                    />
                  </div>
                </div>
              )}

              {activeType === "location" && (
                <div>
                  <label className="label-text">Place name, address, coordinates or a Google Maps link</label>
                  <Input
                    placeholder="India Gate, New Delhi  ·  or  28.6129, 77.2295"
                    value={fields.place ?? ""}
                    onChange={(e) => setField("place", e.target.value)}
                  />
                  <p className="text-xs text-ink-soft leading-relaxed mt-2">
                    Scanning opens Google Maps searching for what you enter. For an exact pin, use coordinates or paste the link from Google Maps → Share.
                  </p>
                </div>
              )}

              {activeType === "youtube" && (
                <div>
                  <label className="label-text">YouTube video or channel link</label>
                  <Input
                    placeholder="https://youtu.be/…  or  @yourchannel"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={fields.youtube ?? ""}
                    onChange={(e) => setField("youtube", e.target.value)}
                  />
                  <p className="text-xs text-ink-soft leading-relaxed mt-2">
                    Paste a video, Short, playlist or channel link from the Share button, or type a channel @handle.
                  </p>
                </div>
              )}

              {activeType === "text" && (
                <div>
                  <label className="label-text">Your text</label>
                  <textarea
                    className={TEXTAREA_CLASS}
                    maxLength={1000}
                    placeholder="Gate code 4471. Parcels to the side door, please."
                    value={fields.text ?? ""}
                    onChange={(e) => setField("text", e.target.value)}
                  />
                  <p className={cn("text-xs leading-relaxed mt-2", new TextEncoder().encode(fields.text ?? "").length > TEXT_SOFT_LIMIT ? "text-amber-700 dark:text-amber-400" : "text-ink-soft")}>
                    {new TextEncoder().encode(fields.text ?? "").length > TEXT_SOFT_LIMIT
                      ? "This is a lot of text for one code. It will be dense: print it large, or shorten it."
                      : "The text is stored in the code and shown on the phone when scanned. Keep it short."}
                  </p>
                </div>
              )}
            </div>

            {/* Step 3 — Colors */}
            <div className="glass-card p-6 rounded-2xl">
              <h2 className="text-ink font-semibold mb-4 flex items-center gap-2">
                <span className="step-indicator active">3</span>
                <Palette size={16} className="text-ink-soft" />
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
                      className="w-10 h-10 rounded-lg border border-line bg-transparent cursor-pointer p-0.5"
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
                      className="w-10 h-10 rounded-lg border border-line bg-transparent cursor-pointer p-0.5"
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
              <h2 className="text-ink font-semibold mb-5 flex items-center gap-2">
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
                            ? "border-accent bg-accent-soft text-accent"
                            : "border-line text-ink-soft hover:border-accent/40 hover:text-ink"
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
                            ? "border-accent bg-accent-soft text-accent"
                            : "border-line text-ink-soft hover:border-accent/40 hover:text-ink"
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
                            ? "border-accent bg-accent-soft text-accent"
                            : "border-line text-ink-soft hover:border-accent/40 hover:text-ink"
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
              <h2 className="text-ink font-semibold mb-1">Your QR code</h2>
              <p className="text-ink-faint text-xs mb-6">Updates live as you make changes</p>

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
              <div className="rounded-xl border border-accent/20 bg-accent-soft p-4 text-left">
                <p className="text-accent text-xs font-semibold mb-1">
                  Want to edit this QR code after printing?
                </p>
                <p className="text-ink-faint text-xs mb-3">
                  Dynamic QR codes let you change the destination any time — and track
                  every scan by city, device, and time. 14-day free trial, no card needed.
                </p>
                <Link to="/dynamic-qr">
                  <Button variant="ghost" size="sm" className="text-accent hover:text-accent-ink w-full justify-start px-0">
                    See how dynamic QR works
                    <ArrowRight size={14} />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {guide && <TypeGuide guide={guide} />}

        {/* ── Why upgrade section ──────────────────────────────────────────── */}
        {/* Deliverable 4: New below-the-fold section for SEO + conversion */}
        {/* Deliverable 9: Internal links — /features, /pricing, /dynamic-qr */}
        <section className="mt-20 max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold text-ink mb-3">
              This is a static QR code.{" "}
              <span className="text-accent">Here's what you're missing.</span>
            </h2>
            <p className="text-ink-soft max-w-xl mx-auto text-sm">
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
                icon: <BarChart3 size={20} className="text-accent" />,
                bg: "bg-accent-soft border-accent/20",
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
                desc: "Split traffic between two destinations and see how many scans each version gets.",
              },
            ].map((card) => (
              <div key={card.title} className={`glass-card rounded-xl p-5 border ${card.bg}`}>
                <div className={`w-10 h-10 rounded-lg border flex items-center justify-center mb-3 ${card.bg}`}>
                  {card.icon}
                </div>
                <h3 className="text-ink font-semibold text-sm mb-1">{card.title}</h3>
                <p className="text-ink-soft text-xs leading-relaxed">{card.desc}</p>
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
            <h2 className="text-2xl md:text-3xl font-bold text-ink mb-3">
              Questions about{" "}
              <span className="text-accent">{guide ? `${guide.name.replace(/ generator$/, "")}s` : "QR code generators"}</span>
            </h2>
            <p className="text-ink-soft text-sm">
              Everything you need to know before you generate and print.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {pageFaqs.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
          <p className="text-center text-ink-faint text-xs mt-8">
            More questions?{" "}
            <Link to="/faq" className="text-accent hover:text-accent-ink underline underline-offset-2">
              See the full FAQ →
            </Link>
            {" "}or{" "}
            <Link to="/features" className="text-accent hover:text-accent-ink underline underline-offset-2">
              explore all features →
            </Link>
          </p>
        </section>

      </div>
    </div>
  )
}
