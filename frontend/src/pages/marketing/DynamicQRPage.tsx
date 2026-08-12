import { useState, useEffect, useRef } from "react"
import { Link } from "react-router-dom"
import {
  ArrowRight,
  BarChart3,
  Globe,
  Pencil,
  Printer,
  Zap,
  Check,
  X,
  Smartphone,
  QrCode,
  Webhook,
  Server,
  Link2,
  Hash,
  AlertTriangle,
  Lightbulb,
  MapPin,
  Shield,
  Monitor,
  Tablet,
} from "lucide-react"
import { SEOMeta } from "@/components/SEOMeta"
import { PageHero } from "@/components/marketing/PageHero"
import { MktContainer, SectionHead, MktButton, MktCard } from "@/components/marketing/ui"
import { FaqAccordion } from "@/components/marketing/FaqAccordion"
import { cn } from "@/lib/utils"

// ─── JSON-LD schema ────────────────────────────────────────────────────────────
// Deliverable 8: WebPage + SoftwareApplication + FAQPage

const DYNAMIC_JSON_LD = [
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "Dynamic QR Code Generator — Edit After Printing | GenXQR",
    "description":
      "Create dynamic QR codes you can edit after printing. Track every scan by city, device and time. Change the URL in seconds — no reprint needed.",
    "url": "https://genxqr.com/dynamic-qr",
    "breadcrumb": {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://genxqr.com" },
        { "@type": "ListItem", "position": 2, "name": "Dynamic QR Codes", "item": "https://genxqr.com/dynamic-qr" },
      ],
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "GenXQR — Dynamic QR Code Generator",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web",
    "url": "https://genxqr.com",
    "description":
      "Dynamic QR code generator with edit-after-print, real-time scan analytics, smart routing by device and city, A/B testing, and scheduled expiry. Free trial, INR pricing.",
    "featureList": [
      "Edit QR code destination after printing",
      "Real-time scan analytics — city, device, browser",
      "Smart routing by location and device type",
      "A/B testing with auto-winner selection",
      "Scheduled activation and expiry",
      "Password-protected QR codes",
      "Scan webhooks to external systems",
      "Bulk API updates",
      "UTM parameter passthrough",
      "Per-QR scan limits with fallback URL",
    ],
    "offers": {
      "@type": "AggregateOffer",
      "lowPrice": "299",
      "priceCurrency": "INR",
      "description": "Dynamic QR codes from ₹299/month. 14-day free trial.",
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What is a dynamic QR code?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "A dynamic QR code stores a short redirect URL instead of the final destination. You can change where that redirect points at any time — even after the QR code is printed. Dynamic QR codes also track every scan with timestamp, city, country, device type, and browser. GenXQR includes dynamic QR codes from the Starter plan at ₹299/month.",
        },
      },
      {
        "@type": "Question",
        "name": "Can you edit a QR code after printing?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes — if it is a dynamic QR code. With GenXQR, you can change the destination URL, swap the PDF, or update the linked content at any time from your dashboard. The change goes live in under one second. The printed QR code image never needs to change.",
        },
      },
      {
        "@type": "Question",
        "name": "What is the difference between static and dynamic QR codes?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "A static QR code has the destination permanently encoded into the image at the moment of creation. It can never be changed. A dynamic QR code contains a short redirect link. You can update the destination any time without reprinting. Dynamic QR codes also track scan analytics. Use static QR codes for permanent, never-changing content. Use dynamic QR codes for anything that might change — menus, campaigns, documents, or events.",
        },
      },
      {
        "@type": "Question",
        "name": "How do I track QR code scans?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "GenXQR tracks every scan automatically. Your analytics dashboard shows the exact time, city, country, device type (mobile, tablet, desktop), operating system, and browser for every scan — updated in real time. No setup is required and no app is needed for the person scanning.",
        },
      },
      {
        "@type": "Question",
        "name": "How long do dynamic QR codes last?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "GenXQR dynamic QR codes last as long as your active subscription. They never expire on their own unless you set a custom expiry date. If your subscription lapses, QR codes are paused — not deleted. Renew your subscription and they reactivate instantly. You can also set optional expiry dates and fallback URLs per QR code.",
        },
      },
    ],
  },
]

// ─── Data ──────────────────────────────────────────────────────────────────────

const powerFeatures = [
  {
    icon: <BarChart3 size={22} />,
    color: "text-violet-400",
    bg: "bg-violet-500/10 border-violet-500/20",
    title: "Know every city that scanned you",
    desc: "Export the full scan log — date, city, device, OS, browser — to CSV or JSON. Plug straight into your BI tool, Google Sheets, or analytics stack.",
  },
  {
    icon: <Link2 size={22} />,
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
    title: "Attribution stays intact",
    desc: "UTM parameters from the QR scan pass through to the destination URL automatically. Your Google Analytics campaign data is never broken by the redirect.",
  },
  {
    icon: <Webhook size={22} />,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
    title: "Every scan triggers your systems",
    desc: "Fire a POST webhook on every scan. Update your CRM, send a Slack alert, or log to your own database — in real time, without polling.",
  },
  {
    icon: <Server size={22} />,
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
    title: "Update 1,000 QR codes in one API call",
    desc: "Seasonal pivot? Campaign refresh? Update the destination of every QR code in your catalogue with a single REST API call. Essential for large-scale rollouts.",
  },
  {
    icon: <Globe size={22} />,
    color: "text-pink-400",
    bg: "bg-pink-500/10 border-pink-500/20",
    title: "Your brand on every redirect",
    desc: "Use your own domain — qr.yourbrand.com — for every GenXQR redirect. Scanners see your brand in the address bar, not ours.",
  },
  {
    icon: <Hash size={22} />,
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
    title: "Cap scans and redirect to a fallback",
    desc: "Set a maximum scan count per QR code, then automatically redirect to a sold-out or expired page. Perfect for limited offers, flash sales, and gated content.",
  },
]

const smartRoutingFeatures = [
  {
    icon: <MapPin size={20} />,
    color: "text-violet-400",
    bg: "bg-violet-500/10 border-violet-500/20",
    title: "Route by city or country",
    desc: "Send Mumbai scanners to a Hindi page, Bangalore to English, Delhi to a different offer entirely — one QR code handles all of it.",
  },
  {
    icon: <Smartphone size={20} />,
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
    title: "Route by device type",
    desc: "Mobile scanners go to your app store listing. Desktop users get the full web page. One QR code, the right destination every time.",
  },
  {
    icon: <Zap size={20} />,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
    title: "Route by time of day",
    desc: "Lunch menu until 3 PM, dinner menu after. Happy hour offer on Fridays. Scheduled routes that switch automatically — no manual changes needed.",
  },
  {
    icon: <Shield size={20} />,
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
    title: "A/B test your destinations",
    desc: "Split traffic 50/50 between two landing pages. GenXQR tracks the scan-to-conversion rate and can auto-select the winner.",
  },
]

const comparison = [
  { feature: "Edit destination after printing",  dynamic: true,  static: false },
  { feature: "Scan analytics & reporting",        dynamic: true,  static: false },
  { feature: "Geo / device-based routing",        dynamic: true,  static: false },
  { feature: "Scheduled activation & expiry",     dynamic: true,  static: false },
  { feature: "Password protection",              dynamic: true,  static: false },
  { feature: "A/B testing with auto-winner",      dynamic: true,  static: false },
  { feature: "Works without an account",          dynamic: false, static: true },
  { feature: "Free forever",                      dynamic: false, static: true },
  { feature: "Instant generation (no login)",     dynamic: false, static: true },
]

const stories = [
  {
    industry: "Events",
    /* Full-width header strip colours */
    headerBg: "bg-violet-600",
    headerText: "text-white",
    /* Large result metric — the visual hero */
    metric: "₹3.8L",
    metricSub: "in reprint costs avoided",
    metricColor: "text-violet-400",
    metricGlow: "from-violet-600/20 via-transparent to-transparent",
    /* Supporting detail under the metric */
    resultDetail: "Attendee confusion eliminated. Sponsor logos stayed on all materials. Done in 30 seconds.",
    /* Two-column context below */
    pain: {
      text: "TechSummit 2025 printed 8,000 badges and 400 banners with schedule QR codes — then half the speaker sessions were rescheduled two days out.",
    },
    fix: {
      text: "The organiser updated the destination link in 30 seconds. Every badge and banner instantly pointed to the new schedule. No reprint.",
    },
    borderColor: "border-violet-500/30",
  },
  {
    industry: "Packaging",
    headerBg: "bg-blue-600",
    headerText: "text-white",
    metric: "62%",
    metricSub: "fewer support tickets",
    metricColor: "text-blue-400",
    metricGlow: "from-blue-600/20 via-transparent to-transparent",
    resultDetail: "No factory recall. No sticker campaign. 1,20,000 units in the field corrected with one dashboard update.",
    pain: {
      text: "Aurex Electronics shipped 1,20,000 routers with a QR linking to the Quick-Start guide. A firmware update made the old guide dangerously wrong.",
    },
    fix: {
      text: "Support swapped the destination to the updated PDF. Every sold, gifted, or warehoused unit now scans to the correct document automatically.",
    },
    borderColor: "border-blue-500/30",
  },
  {
    industry: "Marketing",
    headerBg: "bg-pink-600",
    headerText: "text-white",
    metric: "2.3×",
    metricSub: "conversion lift, same flyers",
    metricColor: "text-pink-400",
    metricGlow: "from-pink-600/20 via-transparent to-transparent",
    resultDetail: "Three destination swaps mid-campaign. Scan analytics identified the winning variant. Zero extra ad spend.",
    pain: {
      text: "A D2C brand ran a Diwali campaign with 50,000 printed flyers. The first landing page underperformed — and static QR codes made mid-campaign testing impossible.",
    },
    fix: {
      text: "With GenXQR dynamic codes they swapped the destination three times, testing different offers and reading scan analytics in real time to find the winner.",
    },
    borderColor: "border-pink-500/30",
  },
]

const editFlow = [
  {
    step: "1",
    icon: <Printer size={28} />,
    title: "Already printed? Perfect.",
    desc: "Your QR code is live — on flyers, menus, packaging, signage. GenXQR stores a permanent short URL inside it. That URL never changes.",
    detail: "The QR image is fixed. The destination is not.",
    color: "text-zinc-400",
    bg: "bg-zinc-800/60 border-zinc-700/50",
    accentColor: "border-l-zinc-600",
  },
  {
    step: "2",
    icon: <Pencil size={28} />,
    title: "Open your dashboard. Change the destination.",
    desc: "Find the QR code in your list, click 'Edit destination', paste the new URL or update your content. One click to save.",
    detail: "No reprint. No new QR. No downtime.",
    color: "text-violet-400",
    bg: "bg-violet-500/10 border-violet-500/20",
    accentColor: "border-l-violet-500",
  },
  {
    step: "3",
    icon: <Zap size={28} />,
    title: "Live everywhere in under one second.",
    desc: "The next scan — anywhere in the field — hits the new destination. Our edge network propagates the change in milliseconds. Every printed QR code updates instantly.",
    detail: "Every scan already in the field updates instantly.",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
    accentColor: "border-l-emerald-500",
  },
]

const faqs = [
  {
    q: "What is a dynamic QR code?",
    a: "A dynamic QR code stores a short redirect URL instead of the final destination. You can change where that redirect points at any time — even after the QR code is already printed. Dynamic QR codes also track every scan with timestamp, city, country, device type, and browser. GenXQR includes dynamic QR codes from the Starter plan at ₹299/month.",
  },
  {
    q: "Can you edit a QR code after printing?",
    a: "Yes — if it is a dynamic QR code. With GenXQR, you can change the destination URL, swap the PDF, or update the linked content at any time from your dashboard. The change goes live in under one second. The printed QR code image never needs to change.",
  },
  {
    q: "What is the difference between static and dynamic QR codes?",
    a: "A static QR code has the destination permanently encoded into the image at creation — it can never be changed. A dynamic QR code contains a short redirect link you can update any time without reprinting. Dynamic QR codes also track scan analytics. Use static for permanent content; use dynamic for anything that may change — menus, campaigns, documents, or events.",
  },
  {
    q: "How do I track QR code scans?",
    a: "GenXQR tracks every scan automatically — no setup required. Your analytics dashboard shows the exact time, city, country, device type, operating system, and browser for every scan, updated in real time. No app is needed for the person scanning.",
  },
  {
    q: "How long do dynamic QR codes last?",
    a: "GenXQR dynamic QR codes stay active as long as your subscription is active. They never expire automatically unless you set a custom expiry date. If your subscription lapses, QR codes are paused — not deleted. Renew and they reactivate instantly. You can also set optional expiry dates and fallback URLs per QR code for campaigns that have a natural end date.",
  },
]

// ─── Live scan demo data ───────────────────────────────────────────────────────

const SCAN_FEED: { city: string; country: string; device: string; flag: string; ago: string }[] = [
  { city: "Mumbai",    country: "India",     device: "Mobile",  flag: "🇮🇳", ago: "just now" },
  { city: "Bangalore", country: "India",     device: "Mobile",  flag: "🇮🇳", ago: "2s ago" },
  { city: "Delhi",     country: "India",     device: "Desktop", flag: "🇮🇳", ago: "5s ago" },
  { city: "Dubai",     country: "UAE",       device: "Mobile",  flag: "🇦🇪", ago: "11s ago" },
  { city: "Chennai",   country: "India",     device: "Tablet",  flag: "🇮🇳", ago: "18s ago" },
  { city: "Singapore", country: "Singapore", device: "Mobile",  flag: "🇸🇬", ago: "24s ago" },
  { city: "Hyderabad", country: "India",     device: "Mobile",  flag: "🇮🇳", ago: "31s ago" },
  { city: "London",    country: "UK",        device: "Desktop", flag: "🇬🇧", ago: "38s ago" },
  { city: "Pune",      country: "India",     device: "Mobile",  flag: "🇮🇳", ago: "45s ago" },
  { city: "New York",  country: "USA",       device: "Mobile",  flag: "🇺🇸", ago: "52s ago" },
]

const SPARKLINE_HEIGHTS = [20, 35, 28, 48, 38, 55, 42, 68, 58, 75, 62, 88, 72, 95, 80]

const DEVICE_ICON: Record<string, React.ReactNode> = {
  Mobile:  <Smartphone size={11} />,
  Desktop: <Monitor    size={11} />,
  Tablet:  <Tablet     size={11} />,
}

// ─── Local styling helpers (restyle-only — new design tokens) ─────────────────
// These are NOT part of the preserved data arrays above; they only translate
// each section's existing accent-color intent into the new light/dark-aware
// token palette used for icon tiles, story cards, and the edit-flow steps.

type Tint = "violet" | "blue" | "emerald" | "amber" | "pink" | "red"

const TILE_BG: Record<Tint, string> = {
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  pink: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  red: "bg-red-500/10 text-red-600 dark:text-red-400",
}

const TILE_TEXT: Record<Tint, string> = {
  violet: "text-violet-600 dark:text-violet-400",
  blue: "text-blue-600 dark:text-blue-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
  amber: "text-amber-600 dark:text-amber-400",
  pink: "text-pink-600 dark:text-pink-400",
  red: "text-red-600 dark:text-red-400",
}

const POWER_TINTS: Tint[] = ["violet", "blue", "emerald", "amber", "pink", "red"]
const ROUTING_TINTS: Tint[] = ["violet", "blue", "emerald", "amber"]
const STORY_TINTS: Tint[] = ["violet", "blue", "pink"]

const STEP_STYLES: { ring: string; tile: string }[] = [
  { ring: "bg-ink/10", tile: "border-line bg-paper-pure text-ink-faint" },
  { ring: "bg-accent/25", tile: "border-accent/30 bg-accent-soft text-accent" },
  { ring: "bg-live/25", tile: "border-live/30 bg-live/10 text-live" },
]

// ─── LiveScanDemo — animated analytics dashboard ───────────────────────────────
// Competitive gap fix: QR Tiger shows a live scan counter on their dynamic QR
// page. This component simulates real-time scan activity to prove the feature
// before the user creates an account.

function LiveScanDemo() {
  const [totalScans, setTotalScans]   = useState(14_837)
  const [feedItems, setFeedItems]     = useState(SCAN_FEED.slice(0, 5))
  const [flashIdx, setFlashIdx]       = useState<number | null>(null)
  const [barHeights, setBarHeights]   = useState(SPARKLINE_HEIGHTS)
  const feedCursor                    = useRef(0)
  const isVisible                     = useRef(false)
  const sectionRef                    = useRef<HTMLDivElement>(null)

  // Only run animation when the section is in the viewport
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { isVisible.current = entry.isIntersecting },
      { threshold: 0.2 },
    )
    if (sectionRef.current) observer.observe(sectionRef.current)
    return () => observer.disconnect()
  }, [])

  // New scan every 2.2 seconds
  useEffect(() => {
    const id = setInterval(() => {
      if (!isVisible.current) return

      // Increment total
      setTotalScans((n) => n + Math.floor(Math.random() * 3) + 1)

      // Rotate feed — prepend next entry, keep 5 visible
      feedCursor.current = (feedCursor.current + 1) % SCAN_FEED.length
      const next = SCAN_FEED[feedCursor.current]
      setFeedItems((prev) => [next, ...prev.slice(0, 4)])

      // Flash the newest row
      setFlashIdx(0)
      setTimeout(() => setFlashIdx(null), 600)

      // Shift sparkline bars left and append a new random bar
      setBarHeights((prev) => {
        const shifted = prev.slice(1)
        shifted.push(Math.floor(Math.random() * 70) + 20)
        return shifted
      })
    }, 2200)
    return () => clearInterval(id)
  }, [])

  return (
    <div ref={sectionRef} className="mt-8" aria-label="Live scan analytics demo">
      <div className="rounded-2xl overflow-hidden border border-line bg-paper-pure shadow-lift">

        {/* Window chrome */}
        <div className="flex items-center gap-2 px-4 py-3 bg-ink border-b border-line-dark">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-live/70" />
          <span className="ml-3 text-paper-pure/50 text-xs font-mono">genxqr.com / dashboard / analytics</span>
          <span className="ml-auto flex items-center gap-1.5 text-live text-xs font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulse" />
            LIVE
          </span>
        </div>

        <div className="p-5 bg-ink text-paper-pure">

          {/* Top stat row */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {/* Total scans — live counter */}
            <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 col-span-1">
              <p className="text-paper-pure/40 text-[10px] font-medium uppercase tracking-widest mb-1">Total Scans</p>
              <p className="text-paper-pure text-2xl font-bold tabular-nums transition-all duration-300">
                {totalScans.toLocaleString("en-IN")}
              </p>
              <p className="text-live text-[10px] mt-1">↑ live</p>
            </div>

            {/* Sparkline chart */}
            <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 col-span-2">
              <p className="text-paper-pure/40 text-[10px] font-medium uppercase tracking-widest mb-3">Scans — last 15 min</p>
              <div className="flex items-end gap-[3px] h-10">
                {barHeights.map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-sm bg-accent/70 transition-all duration-700"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Device breakdown */}
          <div className="grid grid-cols-3 gap-2 mb-5">
            {[
              { label: "Mobile",  pct: 68, color: "bg-accent" },
              { label: "Desktop", pct: 24, color: "bg-blue-400" },
              { label: "Tablet",  pct: 8,  color: "bg-pink-400" },
            ].map((d) => (
              <div key={d.label} className="bg-white/[0.04] rounded-xl p-3 border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-paper-pure/50 text-[10px]">{d.label}</span>
                  <span className="text-paper-pure text-xs font-bold">{d.pct}%</span>
                </div>
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${d.color}`} style={{ width: `${d.pct}%` }} />
                </div>
              </div>
            ))}
          </div>

          {/* Live scan feed */}
          <div className="bg-white/[0.04] rounded-xl border border-white/10 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
              <p className="text-paper-pure/40 text-[10px] font-medium uppercase tracking-widest">Recent Scans</p>
              <span className="flex items-center gap-1 text-live text-[10px] font-semibold">
                <span className="w-1 h-1 rounded-full bg-live animate-pulse" />
                updating live
              </span>
            </div>
            <div className="divide-y divide-white/10">
              {feedItems.map((scan, i) => (
                <div
                  key={`${scan.city}-${i}`}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 transition-colors duration-500",
                    flashIdx === i ? "bg-accent/10" : "bg-transparent",
                  )}
                >
                  <span className="text-base leading-none">{scan.flag}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-paper-pure text-xs font-medium">{scan.city}</span>
                    <span className="text-paper-pure/30 text-xs"> · {scan.country}</span>
                  </div>
                  <span className={cn(
                    "flex items-center gap-1 text-paper-pure/40 text-[10px] px-2 py-0.5 rounded-full border border-white/10",
                    i === 0 && flashIdx === 0 && "text-accent border-accent/30 bg-accent/10",
                  )}>
                    {DEVICE_ICON[scan.device]}
                    {scan.device}
                  </span>
                  <span className={cn(
                    "text-paper-pure/30 text-[10px] shrink-0 tabular-nums",
                    i === 0 && flashIdx === 0 && "text-live",
                  )}>
                    {i === 0 && flashIdx === 0 ? "just now" : scan.ago}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-center text-paper-pure/25 text-[10px] mt-3">
            This is what your analytics dashboard looks like — live, the moment someone scans.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function DynamicQRPage() {
  return (
    <div className="bg-paper">

      {/* ── Deliverables 1, 2, 8: SEO + Schema ── */}
      <SEOMeta
        title="Dynamic QR Code Generator — Edit After Printing | GenXQR"
        description="Create dynamic QR codes you can edit after printing. Track every scan by city, device & time. Change the URL in seconds — no reprint needed. Free trial, INR pricing."
        url="/dynamic-qr"
        jsonLd={DYNAMIC_JSON_LD}
      />

      {/* ── 1. Hero ─────────────────────────────────────────────────────────── */}
      <PageHero
        eyebrow="Dynamic QR Code Generator — India's most advanced"
        title={
          <>
            The Dynamic QR Code{" "}
            <span className="text-accent">Generator That Lets You</span>
            <br />
            Edit After Printing
          </>
        }
        intro={
          <>
            Print your QR code today. Change where it leads tomorrow.{" "}
            Update the URL, swap the PDF, refresh the offer — the printed code never changes.{" "}
            <Link to="/features" className="text-accent hover:text-accent-ink underline underline-offset-2">
              Scan analytics
            </Link>{" "}
            included on every plan.
          </>
        }
        actions={
          <>
            <MktButton href="/signup?next=/app/create" variant="accent" size="lg">
              Create Your First Dynamic QR — Free
              <ArrowRight size={16} />
            </MktButton>
            <MktButton href="/generate" variant="outline" size="lg">
              Try the free generator →
            </MktButton>
          </>
        }
      >
        <p className="text-sm text-ink-faint">
          Dynamic QR codes from ₹299/mo · 14-day free trial · No credit card
        </p>
        {/* Live animated analytics demo — competitive gap fix vs QR Tiger */}
        <LiveScanDemo />
      </PageHero>

      {/* ── 2. Static vs Dynamic comparison ─────────────────────────────────── */}
      <section className="py-20 md:py-28 bg-paper-pure border-y border-line">
        <MktContainer className="max-w-4xl">
          <SectionHead
            eyebrow="Static vs Dynamic — the honest comparison"
            title={<>Why static QR codes <span className="text-accent">cost businesses money</span></>}
            intro={
              <>
                Static QR codes lock your destination the moment they're created.
                One URL change means reprinting every flyer, menu, banner, and badge.{" "}
                <Link to="/use-cases" className="text-accent hover:text-accent-ink underline underline-offset-2">
                  See real examples →
                </Link>
              </>
            }
            align="center"
          />

          <div className="mt-12 overflow-x-auto rounded-2xl border border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="text-left px-5 py-4 text-ink-soft font-medium w-1/2">Capability</th>
                  <th className="px-5 py-4 text-center">
                    <span className="inline-flex items-center gap-1.5 text-ink-soft font-medium">
                      <QrCode size={14} /> Static QR
                    </span>
                  </th>
                  <th className="px-5 py-4 text-center bg-accent-soft">
                    <span className="inline-flex items-center gap-1.5 text-accent font-semibold">
                      <Zap size={14} /> Dynamic QR
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row, i) => (
                  <tr key={row.feature} className={cn("border-b border-line", i % 2 !== 0 && "bg-ink/[0.02]")}>
                    <td className="px-5 py-3.5 text-ink">{row.feature}</td>
                    <td className="px-5 py-3.5 text-center">
                      {row.static
                        ? <Check size={17} className="text-live mx-auto" />
                        : <X size={17} className="text-ink-faint/50 mx-auto" />}
                    </td>
                    <td className="px-5 py-3.5 text-center bg-accent-soft">
                      {row.dynamic
                        ? <Check size={17} className="text-accent mx-auto" />
                        : <X size={17} className="text-ink-faint/50 mx-auto" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-center text-ink-faint text-xs mt-4">
            Need a permanent, never-changing QR code?{" "}
            <Link to="/generate" className="text-ink-soft hover:text-ink underline underline-offset-2">
              Try the free static generator →
            </Link>
          </p>
        </MktContainer>
      </section>

      {/* ── 3. Edit-after-print flow ──────────────────────────────────────────── */}
      <section className="py-20 md:py-28 bg-paper">
        <MktContainer className="max-w-5xl">
          <SectionHead
            eyebrow="How edit-after-print works"
            title={<>Already printed?{" "}<span className="text-accent">Still completely editable.</span></>}
            intro={
              <>
                The printed QR code never changes. The destination does — instantly, from your{" "}
                <Link to="/app/dashboard" className="text-accent hover:text-accent-ink underline underline-offset-2">
                  dashboard
                </Link>.
              </>
            }
            align="center"
          />

          {/* Desktop: horizontal timeline — Mobile: vertical stepper */}
          <div className="mt-16 relative">

            {/* Connecting line (desktop only) */}
            <div className="hidden md:block absolute top-[52px] left-[16.66%] right-[16.66%] h-px bg-gradient-to-r from-line via-accent/40 to-live/40 z-0" />

            <div className="grid md:grid-cols-3 gap-6 md:gap-8 relative z-10">
              {editFlow.map((step, i) => {
                const style = STEP_STYLES[i]
                return (
                  <div key={step.step} className="flex flex-col items-center text-center">
                    {/* Step number bubble + icon */}
                    <div className="relative mb-6">
                      {/* Outer glow ring */}
                      <div className={cn("absolute inset-0 rounded-2xl blur-xl opacity-40 scale-110", style.ring)} />
                      <div className={cn(
                        "relative w-[104px] h-[104px] rounded-2xl border-2 flex flex-col items-center justify-center gap-1 shadow-lg",
                        style.tile,
                      )}>
                        <div className="opacity-80">{step.icon}</div>
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Step {step.step}</span>
                      </div>
                      {/* Connector arrow — between steps on mobile */}
                      {i < editFlow.length - 1 && (
                        <div className="md:hidden absolute -bottom-8 left-1/2 -translate-x-1/2 text-line">
                          <svg width="16" height="24" viewBox="0 0 16 24" fill="none">
                            <path d="M8 0v20M2 14l6 8 6-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Text */}
                    <h3 className="text-ink font-bold text-lg mb-2 leading-snug">{step.title}</h3>
                    <p className="text-ink-soft text-sm leading-relaxed mb-4 max-w-[240px]">{step.desc}</p>

                    {/* Detail pill */}
                    <span className={cn("inline-block text-xs font-semibold px-3 py-1.5 rounded-full border", style.tile)}>
                      {step.detail}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Bottom proof bar */}
          <div className="mt-16 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm text-ink-soft">
            <span className="flex items-center gap-2"><Check size={14} className="text-live" /> Change takes effect in &lt; 1 second</span>
            <span className="flex items-center gap-2"><Check size={14} className="text-live" /> No reprint required — ever</span>
            <span className="flex items-center gap-2"><Check size={14} className="text-live" /> Every printed copy updates instantly</span>
          </div>
        </MktContainer>
      </section>

      {/* ── 4. Smart routing ─────────────────────────────────────────────────── */}
      <section className="py-20 md:py-28 bg-paper-pure border-y border-line">
        <MktContainer>
          <SectionHead
            eyebrow="Smart routing — PRO & above"
            title={<>One QR code.{" "}<span className="text-accent">Different pages for different people.</span></>}
            intro={
              <>
                Route scans automatically by city, country, device type, or time of day —
                no code, no manual switching, no reprinting.{" "}
                <Link to="/pricing" className="text-accent hover:text-accent-ink underline underline-offset-2">
                  Available on PRO plans →
                </Link>
              </>
            }
            align="center"
          />

          <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {smartRoutingFeatures.map((f, i) => (
              <MktCard key={f.title}>
                <span className={cn(
                  "inline-grid place-items-center shrink-0 rounded-xl border border-line w-11 h-11 mb-4",
                  TILE_BG[ROUTING_TINTS[i]],
                )}>
                  {f.icon}
                </span>
                <h3 className="text-ink font-semibold text-sm mb-2">{f.title}</h3>
                <p className="text-ink-soft text-xs leading-relaxed">{f.desc}</p>
              </MktCard>
            ))}
          </div>
        </MktContainer>
      </section>

      {/* ── 5. Power features ────────────────────────────────────────────────── */}
      <section className="py-20 md:py-28 bg-paper">
        <MktContainer>
          <SectionHead
            eyebrow="Built for your existing stack"
            title={<>More than a redirect —{" "}<span className="text-accent">a live data pipeline</span></>}
            intro="GenXQR dynamic QR codes connect directly to your analytics, CRM, and automation tools. Export, automate, and integrate — no workaround needed."
            align="center"
          />

          <div className="mt-14 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {powerFeatures.map((f, i) => (
              <MktCard key={f.title}>
                <span className={cn(
                  "inline-grid place-items-center shrink-0 rounded-xl border border-line w-11 h-11 mb-4",
                  TILE_BG[POWER_TINTS[i]],
                )}>
                  {f.icon}
                </span>
                <h3 className="text-ink font-semibold text-base mb-2">{f.title}</h3>
                <p className="text-ink-soft text-sm leading-relaxed">{f.desc}</p>
              </MktCard>
            ))}
          </div>
        </MktContainer>
      </section>

      {/* ── 6. Real stories ───────────────────────────────────────────────────── */}
      <section className="py-20 md:py-28 bg-paper-pure border-y border-line">
        <MktContainer className="max-w-5xl">
          <SectionHead
            eyebrow="Real stories, real savings"
            title={<>Problems only{" "}<span className="text-accent">dynamic QR codes solve</span></>}
            intro="These aren't hypothetical. They're the exact situations where a static QR code would have cost real money — or caused a product recall."
            align="center"
          />

          <div className="mt-14 grid md:grid-cols-3 gap-6">
            {stories.map((s, i) => {
              const tint = STORY_TINTS[i]
              return (
                <div
                  key={s.industry}
                  className="rounded-2xl border border-line bg-paper-pure overflow-hidden shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift flex flex-col"
                >
                  {/* ── Industry label ── */}
                  <div className="px-5 py-3 border-b border-line">
                    <span className={cn("text-[11px] font-mono font-bold uppercase tracking-widest", TILE_TEXT[tint])}>
                      {s.industry}
                    </span>
                  </div>

                  {/* ── Result metric — the visual hero ── */}
                  <div className="px-6 pt-8 pb-6 text-center">
                    <div className={cn("text-5xl font-black font-display tabular-nums leading-none mb-1", TILE_TEXT[tint])}>
                      {s.metric}
                    </div>
                    <div className="text-ink-soft text-sm font-medium">{s.metricSub}</div>
                    <p className="text-ink-faint text-xs leading-relaxed mt-3 px-1">{s.resultDetail}</p>
                  </div>

                  {/* ── Divider ── */}
                  <div className="mx-5 border-t border-line" />

                  {/* ── Pain / Fix context ── */}
                  <div className="grid grid-cols-2 divide-x divide-line flex-1">
                    <div className="px-4 py-4">
                      <div className="flex items-center gap-1.5 text-ink-faint text-[10px] font-bold uppercase tracking-wider mb-2">
                        <AlertTriangle size={11} />
                        Problem
                      </div>
                      <p className="text-ink-soft text-xs leading-relaxed">{s.pain.text}</p>
                    </div>
                    <div className="px-4 py-4">
                      <div className="flex items-center gap-1.5 text-ink-faint text-[10px] font-bold uppercase tracking-wider mb-2">
                        <Lightbulb size={11} />
                        Fix
                      </div>
                      <p className="text-ink-soft text-xs leading-relaxed">{s.fix.text}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </MktContainer>
      </section>

      {/* ── 7. Pricing teaser ────────────────────────────────────────────────── */}
      <section className="py-20 md:py-28 bg-paper">
        <MktContainer className="max-w-3xl text-center">
          <SectionHead
            eyebrow="INR pricing · 14-day free trial"
            title={<>Start free.{" "}<span className="text-accent">Upgrade when you're ready.</span></>}
            intro={
              <>
                All paid plans include{" "}
                <Link to="/features" className="text-accent hover:text-accent-ink underline underline-offset-2">
                  dynamic QR codes
                </Link>,{" "}
                scan analytics, all 16 QR types, and no ads.
                Pay with UPI, net banking, or card.
              </>
            }
            align="center"
            className="mx-auto"
          />

          <div className="mt-10 grid sm:grid-cols-3 gap-4 mb-10 text-left">
            {[
              {
                plan: "Starter",
                price: "₹299",
                qrs: "50 dynamic QR codes",
                analytics: "90-day scan history",
                highlight: false,
                badge: "Most Popular",
              },
              {
                plan: "Pro",
                price: "₹799",
                qrs: "250 dynamic QR codes",
                analytics: "1-year history + A/B testing",
                highlight: true,
                badge: null,
              },
              {
                plan: "Business",
                price: "₹2,499",
                qrs: "2,000 dynamic QR codes",
                analytics: "20 team seats, API, webhooks",
                highlight: false,
                badge: null,
              },
            ].map((p) => (
              <div
                key={p.plan}
                className={cn(
                  "rounded-2xl border bg-paper-pure p-5",
                  p.highlight ? "border-accent shadow-lift" : "border-line shadow-card",
                )}
              >
                {p.badge && (
                  <span className="text-[10px] font-bold uppercase tracking-widest text-accent bg-accent-soft px-2 py-0.5 rounded-full mb-3 inline-block">
                    {p.badge}
                  </span>
                )}
                <div className="text-ink font-bold text-lg">{p.plan}</div>
                <div className="text-2xl font-bold text-ink mt-1">
                  {p.price}<span className="text-ink-faint text-sm font-normal">/mo</span>
                </div>
                <div className="text-ink-soft text-xs mt-2">{p.qrs}</div>
                <div className="text-ink-faint text-xs mt-1">{p.analytics}</div>
              </div>
            ))}
          </div>

          <MktButton href="/pricing" variant="outline" size="lg">
            Compare all plans &amp; features
            <ArrowRight size={15} />
          </MktButton>
        </MktContainer>
      </section>

      {/* ── 8. FAQ ───────────────────────────────────────────────────────────── */}
      {/* Deliverable 7: 5 featured-snippet-targeting questions */}
      <section className="py-20 md:py-28 bg-paper">
        <MktContainer className="max-w-3xl">
          <SectionHead
            eyebrow="Common questions"
            title={<>Dynamic QR codes — answered</>}
            intro="Everything you need to know before creating your first dynamic QR code."
            align="center"
          />

          <div className="mt-10">
            <FaqAccordion items={faqs} />
          </div>

          <p className="text-center text-ink-soft text-sm mt-8">
            More questions?{" "}
            <Link to="/faq" className="text-accent hover:text-accent-ink underline underline-offset-2">
              Visit the full FAQ →
            </Link>
          </p>
        </MktContainer>
      </section>

      {/* ── 9. Final CTA ─────────────────────────────────────────────────────── */}
      <section className="py-20 md:py-28 bg-paper">
        <MktContainer>
          <div className="relative overflow-hidden rounded-[32px] bg-band px-6 py-16 md:px-16 md:py-20 text-center">
            <div className="pointer-events-none absolute -bottom-24 left-1/2 -translate-x-1/2 h-72 w-[560px] rounded-full bg-accent/25 blur-3xl" />
            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-3xl md:text-5xl font-bold font-display tracking-tightest leading-[1.15] text-band-fg">
                Your QR code is printed.
                <br />
                <span className="text-accent">It can still change.</span>
              </h2>
              <p className="mt-4 mx-auto max-w-md text-band-fg/70 text-sm leading-relaxed">
                Create a dynamic QR code in 60 seconds. Free trial — no credit card.
                Dynamic QR codes from ₹299/mo after trial.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
                <MktButton href="/signup?next=/app/create" variant="accent" size="lg">
                  Create Your First Dynamic QR — Free
                  <ArrowRight size={16} />
                </MktButton>
                <MktButton href="/generate" variant="outlineOnDark" size="lg">
                  Try static QR first →
                </MktButton>
              </div>
              <p className="mt-5 text-band-fg/50 text-xs">
                No credit card · UPI &amp; net banking accepted · Cancel any time
              </p>
            </div>
          </div>
        </MktContainer>
      </section>

    </div>
  )
}
