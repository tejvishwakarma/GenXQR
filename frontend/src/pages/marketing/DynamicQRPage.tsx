import { useState, useEffect, useRef } from "react"
import { Link } from "react-router-dom"
import {
  ArrowRight,
  RefreshCw,
  BarChart3,
  Globe,
  Pencil,
  Printer,
  Zap,
  Check,
  X,
  Smartphone,
  QrCode,
  ChevronDown,
  Webhook,
  Server,
  Link2,
  Hash,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  MapPin,
  Shield,
  Monitor,
  Tablet,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { SEOMeta } from "@/components/SEOMeta"
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
    "url": "https://genxqr.streamsnatcher.com/dynamic-qr",
    "breadcrumb": {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://genxqr.streamsnatcher.com" },
        { "@type": "ListItem", "position": 2, "name": "Dynamic QR Codes", "item": "https://genxqr.streamsnatcher.com/dynamic-qr" },
      ],
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "GenXQR — Dynamic QR Code Generator",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web",
    "url": "https://genxqr.streamsnatcher.com",
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
    <div
      ref={sectionRef}
      className="mt-12 max-w-2xl mx-auto animate-fade-in animate-delay-400"
      aria-label="Live scan analytics demo"
    >
      <div className="glass-card rounded-2xl overflow-hidden border border-zinc-700/50 shadow-[0_0_40px_rgba(124,58,237,0.12)]">

        {/* Window chrome */}
        <div className="flex items-center gap-2 px-4 py-3 bg-zinc-900 border-b border-zinc-800">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
          <span className="ml-3 text-zinc-500 text-xs font-mono">genxqr.streamsnatcher.com / dashboard / analytics</span>
          <span className="ml-auto flex items-center gap-1.5 text-emerald-400 text-xs font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            LIVE
          </span>
        </div>

        <div className="p-5 bg-zinc-950/60">

          {/* Top stat row */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {/* Total scans — live counter */}
            <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 col-span-1">
              <p className="text-zinc-500 text-[10px] font-medium uppercase tracking-widest mb-1">Total Scans</p>
              <p className="text-white text-2xl font-bold tabular-nums transition-all duration-300">
                {totalScans.toLocaleString("en-IN")}
              </p>
              <p className="text-emerald-400 text-[10px] mt-1">↑ live</p>
            </div>

            {/* Sparkline chart */}
            <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 col-span-2">
              <p className="text-zinc-500 text-[10px] font-medium uppercase tracking-widest mb-3">Scans — last 15 min</p>
              <div className="flex items-end gap-[3px] h-10">
                {barHeights.map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-sm bg-violet-500/60 transition-all duration-700"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Device breakdown */}
          <div className="grid grid-cols-3 gap-2 mb-5">
            {[
              { label: "Mobile",  pct: 68, color: "bg-violet-500" },
              { label: "Desktop", pct: 24, color: "bg-blue-500" },
              { label: "Tablet",  pct: 8,  color: "bg-pink-500" },
            ].map((d) => (
              <div key={d.label} className="bg-zinc-900 rounded-xl p-3 border border-zinc-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-zinc-400 text-[10px]">{d.label}</span>
                  <span className="text-white text-xs font-bold">{d.pct}%</span>
                </div>
                <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${d.color}`} style={{ width: `${d.pct}%` }} />
                </div>
              </div>
            ))}
          </div>

          {/* Live scan feed */}
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
              <p className="text-zinc-500 text-[10px] font-medium uppercase tracking-widest">Recent Scans</p>
              <span className="flex items-center gap-1 text-emerald-400 text-[10px] font-semibold">
                <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                updating live
              </span>
            </div>
            <div className="divide-y divide-zinc-800/60">
              {feedItems.map((scan, i) => (
                <div
                  key={`${scan.city}-${i}`}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 transition-colors duration-500",
                    flashIdx === i ? "bg-violet-500/10" : "bg-transparent",
                  )}
                >
                  <span className="text-base leading-none">{scan.flag}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-white text-xs font-medium">{scan.city}</span>
                    <span className="text-zinc-600 text-xs"> · {scan.country}</span>
                  </div>
                  <span className={cn(
                    "flex items-center gap-1 text-zinc-500 text-[10px] px-2 py-0.5 rounded-full border border-zinc-800",
                    i === 0 && flashIdx === 0 && "text-violet-400 border-violet-500/30 bg-violet-500/10",
                  )}>
                    {DEVICE_ICON[scan.device]}
                    {scan.device}
                  </span>
                  <span className={cn(
                    "text-zinc-600 text-[10px] shrink-0 tabular-nums",
                    i === 0 && flashIdx === 0 && "text-emerald-400",
                  )}>
                    {i === 0 && flashIdx === 0 ? "just now" : scan.ago}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-center text-zinc-700 text-[10px] mt-3">
            This is what your analytics dashboard looks like — live, the moment someone scans.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-zinc-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left text-white font-medium text-sm hover:bg-zinc-900/60 transition-colors"
        aria-expanded={open}
      >
        <span>{q}</span>
        <ChevronDown
          size={16}
          className={cn("shrink-0 text-zinc-400 transition-transform duration-300", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="px-6 pb-5 text-zinc-400 text-sm leading-relaxed border-t border-zinc-800/60 pt-4">
          {a}
        </div>
      )}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function DynamicQRPage() {
  return (
    <div className="relative overflow-hidden">

      {/* ── Deliverables 1, 2, 8: SEO + Schema ── */}
      <SEOMeta
        title="Dynamic QR Code Generator — Edit After Printing | GenXQR"
        description="Create dynamic QR codes you can edit after printing. Track every scan by city, device & time. Change the URL in seconds — no reprint needed. Free trial, INR pricing."
        url="/dynamic-qr"
        jsonLd={DYNAMIC_JSON_LD}
      />

      {/* ── 1. Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative pt-20 pb-28 px-4">
        <div className="absolute inset-0 bg-hero-glow pointer-events-none" />
        <div className="absolute inset-0 bg-dots opacity-20 pointer-events-none" />
        <div className="absolute top-32 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-violet-600/8 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center relative">
          {/* Badge */}
          <span className="section-header animate-fade-in">
            <RefreshCw size={14} className="text-violet-400" />
            Dynamic QR Code Generator — India's most advanced
          </span>

          {/* ── Deliverable 3: H1 (Variant A active) ── */}
          {/*
            A/B variants (Deliverable 6):
            Variant A (active): keyword-forward + core benefit
            Variant B: "Create Dynamic QR Codes — Change the Destination Any Time"
            Variant C: "QR Codes You Can Edit, Track & Update After Printing"
          */}
          <h1 className="hero-text text-white mt-8 mb-6 animate-fade-in animate-delay-100">
            The Dynamic QR Code{" "}
            <span className="gradient-text">Generator That Lets You</span>
            <br />
            Edit After Printing
          </h1>

          <p className="text-zinc-400 text-lg md:text-xl max-w-2xl mx-auto mb-4 leading-relaxed animate-fade-in animate-delay-200">
            Print your QR code today. Change where it leads tomorrow.{" "}
            Update the URL, swap the PDF, refresh the offer — the printed code never changes.{" "}
            <Link to="/features" className="text-violet-400 hover:text-violet-300 underline underline-offset-2">
              Scan analytics
            </Link>{" "}
            included on every plan.
          </p>

          {/* ── Deliverable 5: Hero CTAs ── */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8 animate-fade-in animate-delay-300">
            <Link to="/signup?next=/app/create">
              <Button size="xl" variant="glow" className="group">
                Create Your First Dynamic QR — Free
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Link to="/generate">
              <Button size="xl" variant="outline">
                Try the free generator →
              </Button>
            </Link>
          </div>

          <p className="text-zinc-600 text-sm mt-5 animate-fade-in animate-delay-400">
            Dynamic QR codes from ₹299/mo · 14-day free trial · No credit card
          </p>

          {/* Live animated analytics demo — competitive gap fix vs QR Tiger */}
          <LiveScanDemo />
        </div>
      </section>

      {/* ── 2. Static vs Dynamic comparison ─────────────────────────────────── */}
      <section className="py-20 px-4 border-y border-zinc-800 bg-zinc-900/30">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <span className="section-header">
              <Zap size={14} />
              Static vs Dynamic — the honest comparison
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-white mt-4 mb-3">
              Why static QR codes{" "}
              <span className="gradient-text">cost businesses money</span>
            </h2>
            <p className="text-zinc-400 max-w-xl mx-auto">
              Static QR codes lock your destination the moment they're created.
              One URL change means reprinting every flyer, menu, banner, and badge.{" "}
              <Link to="/use-cases" className="text-violet-400 hover:text-violet-300 underline underline-offset-2">
                See real examples →
              </Link>
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-5 py-4 text-zinc-400 font-medium w-1/2">Capability</th>
                  <th className="px-5 py-4 text-center">
                    <span className="inline-flex items-center gap-1.5 text-zinc-400 font-medium">
                      <QrCode size={14} /> Static QR
                    </span>
                  </th>
                  <th className="px-5 py-4 text-center bg-violet-500/5">
                    <span className="inline-flex items-center gap-1.5 text-violet-300 font-semibold">
                      <Zap size={14} /> Dynamic QR
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row, i) => (
                  <tr key={row.feature} className={`border-b border-zinc-800/60 ${i % 2 === 0 ? "" : "bg-zinc-900/20"}`}>
                    <td className="px-5 py-3.5 text-zinc-300">{row.feature}</td>
                    <td className="px-5 py-3.5 text-center">
                      {row.static
                        ? <Check size={17} className="text-green-400 mx-auto" />
                        : <X size={17} className="text-zinc-700 mx-auto" />}
                    </td>
                    <td className="px-5 py-3.5 text-center bg-violet-500/5">
                      {row.dynamic
                        ? <Check size={17} className="text-violet-400 mx-auto" />
                        : <X size={17} className="text-zinc-700 mx-auto" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-center text-zinc-600 text-xs mt-4">
            Need a permanent, never-changing QR code?{" "}
            <Link to="/generate" className="text-zinc-400 hover:text-zinc-300 underline underline-offset-2">
              Try the free static generator →
            </Link>
          </p>
        </div>
      </section>

      {/* ── 3. Edit-after-print flow ──────────────────────────────────────────── */}
      <section className="py-28 px-4 relative overflow-hidden">
        {/* Subtle radial glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_40%_at_50%_50%,rgba(124,58,237,0.06),transparent)] pointer-events-none" />

        <div className="max-w-5xl mx-auto relative">
          <div className="text-center mb-20">
            <span className="section-header">
              <RefreshCw size={14} />
              How edit-after-print works
            </span>
            <h2 className="text-3xl md:text-5xl font-bold text-white mt-4 mb-4">
              Already printed?{" "}
              <span className="gradient-text">Still completely editable.</span>
            </h2>
            <p className="text-zinc-400 max-w-lg mx-auto text-lg">
              The printed QR code never changes. The destination does — instantly, from your{" "}
              <Link to="/app/dashboard" className="text-violet-400 hover:text-violet-300 underline underline-offset-2">
                dashboard
              </Link>.
            </p>
          </div>

          {/* Desktop: horizontal timeline — Mobile: vertical stepper */}
          <div className="relative">

            {/* Connecting line (desktop only) */}
            <div className="hidden md:block absolute top-[52px] left-[16.66%] right-[16.66%] h-px bg-gradient-to-r from-zinc-700 via-violet-500/50 to-emerald-500/50 z-0" />

            <div className="grid md:grid-cols-3 gap-6 md:gap-8 relative z-10">
              {editFlow.map((step, i) => (
                <div
                  key={step.step}
                  className="flex flex-col items-center text-center animate-fade-in"
                  style={{ animationDelay: `${i * 150}ms` }}
                >
                  {/* Step number bubble + icon */}
                  <div className="relative mb-6">
                    {/* Outer glow ring */}
                    <div className={cn(
                      "absolute inset-0 rounded-2xl blur-xl opacity-40 scale-110",
                      i === 0 ? "bg-zinc-500" : i === 1 ? "bg-violet-600" : "bg-emerald-500",
                    )} />
                    <div className={cn(
                      "relative w-[104px] h-[104px] rounded-2xl border-2 flex flex-col items-center justify-center gap-1 shadow-lg",
                      step.bg, step.color,
                    )}>
                      <div className="opacity-80">{step.icon}</div>
                      <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Step {step.step}</span>
                    </div>
                    {/* Connector arrow — between steps on mobile */}
                    {i < editFlow.length - 1 && (
                      <div className="md:hidden absolute -bottom-8 left-1/2 -translate-x-1/2 text-zinc-700">
                        <svg width="16" height="24" viewBox="0 0 16 24" fill="none">
                          <path d="M8 0v20M2 14l6 8 6-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Text */}
                  <h3 className="text-white font-bold text-lg mb-2 leading-snug">{step.title}</h3>
                  <p className="text-zinc-400 text-sm leading-relaxed mb-4 max-w-[240px]">{step.desc}</p>

                  {/* Detail pill */}
                  <span className={cn(
                    "inline-block text-xs font-semibold px-3 py-1.5 rounded-full border",
                    step.bg, step.color,
                  )}>
                    {step.detail}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom proof bar */}
          <div className="mt-16 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm text-zinc-500">
            <span className="flex items-center gap-2"><Check size={14} className="text-emerald-400" /> Change takes effect in &lt; 1 second</span>
            <span className="flex items-center gap-2"><Check size={14} className="text-emerald-400" /> No reprint required — ever</span>
            <span className="flex items-center gap-2"><Check size={14} className="text-emerald-400" /> Every printed copy updates instantly</span>
          </div>
        </div>
      </section>

      {/* ── 4. Smart routing ─────────────────────────────────────────────────── */}
      <section className="py-24 px-4 border-y border-zinc-800 bg-zinc-900/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="section-header">
              <Globe size={14} />
              Smart routing — PRO & above
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-white mt-4 mb-3">
              One QR code.{" "}
              <span className="gradient-text">Different pages for different people.</span>
            </h2>
            <p className="text-zinc-400 max-w-xl mx-auto">
              Route scans automatically by city, country, device type, or time of day —
              no code, no manual switching, no reprinting.{" "}
              <Link to="/pricing" className="text-violet-400 hover:text-violet-300 underline underline-offset-2">
                Available on PRO plans →
              </Link>
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {smartRoutingFeatures.map((f, i) => (
              <Card
                key={f.title}
                className="card-hover p-6 animate-fade-in"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <CardContent className="p-0">
                  <div className={`w-11 h-11 rounded-xl border flex items-center justify-center mb-4 ${f.bg} ${f.color}`}>
                    {f.icon}
                  </div>
                  <h3 className="text-white font-semibold text-sm mb-2">{f.title}</h3>
                  <p className="text-zinc-400 text-xs leading-relaxed">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5. Power features ────────────────────────────────────────────────── */}
      <section className="py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="section-header">
              <TrendingUp size={14} />
              Built for your existing stack
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-white mt-4 mb-3">
              More than a redirect —{" "}
              <span className="gradient-text">a live data pipeline</span>
            </h2>
            <p className="text-zinc-400 max-w-xl mx-auto">
              GenXQR dynamic QR codes connect directly to your analytics, CRM, and automation tools.
              Export, automate, and integrate — no workaround needed.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {powerFeatures.map((f, i) => (
              <Card key={f.title} className="card-hover p-6 animate-fade-in" style={{ animationDelay: `${i * 80}ms` }}>
                <CardContent className="p-0">
                  <div className={`w-11 h-11 rounded-xl border flex items-center justify-center mb-4 ${f.bg} ${f.color}`}>
                    {f.icon}
                  </div>
                  <h3 className="text-white font-semibold text-base mb-2">{f.title}</h3>
                  <p className="text-zinc-400 text-sm leading-relaxed">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── 6. Real stories ───────────────────────────────────────────────────── */}
      <section className="py-24 px-4 border-y border-zinc-800 bg-zinc-900/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <span className="section-header">
              <BarChart3 size={14} />
              Real stories, real savings
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-white mt-4 mb-3">
              Problems only{" "}
              <span className="gradient-text">dynamic QR codes solve</span>
            </h2>
            <p className="text-zinc-400 max-w-xl mx-auto">
              These aren't hypothetical. They're the exact situations where a static QR code
              would have cost real money — or caused a product recall.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {stories.map((s, i) => (
              <div
                key={s.industry}
                className={`glass-card rounded-2xl overflow-hidden border ${s.borderColor} animate-fade-in flex flex-col`}
                style={{ animationDelay: `${i * 100}ms` }}
              >
                {/* ── Coloured header strip ── */}
                <div className={`${s.headerBg} ${s.headerText} px-5 py-3 flex items-center gap-2`}>
                  <span className="text-xs font-black uppercase tracking-widest opacity-90">{s.industry}</span>
                </div>

                {/* ── Result metric — the visual hero ── */}
                <div className="relative px-6 pt-8 pb-6 text-center">
                  {/* Soft radial glow behind the number */}
                  <div className={`absolute inset-0 bg-gradient-to-b ${s.metricGlow} pointer-events-none`} />
                  <div className={`relative text-5xl font-black tabular-nums ${s.metricColor} leading-none mb-1`}>
                    {s.metric}
                  </div>
                  <div className="relative text-zinc-400 text-sm font-medium">{s.metricSub}</div>
                  <p className="relative text-zinc-500 text-xs leading-relaxed mt-3 px-1">{s.resultDetail}</p>
                </div>

                {/* ── Divider ── */}
                <div className="mx-5 border-t border-zinc-800/80" />

                {/* ── Pain / Fix context ── */}
                <div className="grid grid-cols-2 divide-x divide-zinc-800/80 flex-1">
                  <div className="px-4 py-4">
                    <div className="flex items-center gap-1.5 text-zinc-500 text-[10px] font-bold uppercase tracking-wider mb-2">
                      <AlertTriangle size={11} />
                      Problem
                    </div>
                    <p className="text-zinc-400 text-xs leading-relaxed">{s.pain.text}</p>
                  </div>
                  <div className="px-4 py-4">
                    <div className="flex items-center gap-1.5 text-zinc-500 text-[10px] font-bold uppercase tracking-wider mb-2">
                      <Lightbulb size={11} />
                      Fix
                    </div>
                    <p className="text-zinc-400 text-xs leading-relaxed">{s.fix.text}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 7. Pricing teaser ────────────────────────────────────────────────── */}
      <section className="py-20 px-4 border-b border-zinc-800">
        <div className="max-w-3xl mx-auto text-center">
          <span className="section-header">
            <Smartphone size={14} />
            INR pricing · 14-day free trial
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-white mt-4 mb-4">
            Start free.{" "}
            <span className="gradient-text">Upgrade when you're ready.</span>
          </h2>
          <p className="text-zinc-400 mb-10 max-w-xl mx-auto">
            All paid plans include{" "}
            <Link to="/features" className="text-violet-400 hover:text-violet-300 underline underline-offset-2">
              dynamic QR codes
            </Link>,{" "}
            scan analytics, all 16 QR types, and no ads.
            Pay with UPI, net banking, or card.
          </p>

          <div className="grid sm:grid-cols-3 gap-4 mb-10 text-left">
            {[
              {
                plan: "Starter",
                price: "₹299",
                qrs: "10 dynamic QR codes",
                analytics: "30-day scan history",
                highlight: false,
                badge: "Most Popular",
              },
              {
                plan: "Pro",
                price: "₹799",
                qrs: "50 dynamic QR codes",
                analytics: "1-year history + A/B testing",
                highlight: true,
                badge: null,
              },
              {
                plan: "Business",
                price: "₹2,499",
                qrs: "Unlimited dynamic QR codes",
                analytics: "Teams, API, webhooks",
                highlight: false,
                badge: null,
              },
            ].map((p) => (
              <div
                key={p.plan}
                className={`rounded-2xl border p-5 ${
                  p.highlight
                    ? "border-violet-500/50 bg-violet-500/10 shadow-[0_0_24px_rgba(124,58,237,0.15)]"
                    : "border-zinc-800 bg-zinc-900/50"
                }`}
              >
                {p.badge && (
                  <span className="text-[10px] font-bold uppercase tracking-widest text-violet-300 bg-violet-500/20 px-2 py-0.5 rounded-full mb-3 inline-block">
                    {p.badge}
                  </span>
                )}
                <div className="text-white font-bold text-lg">{p.plan}</div>
                <div className="text-2xl font-bold text-white mt-1">
                  {p.price}<span className="text-zinc-500 text-sm font-normal">/mo</span>
                </div>
                <div className="text-zinc-400 text-xs mt-2">{p.qrs}</div>
                <div className="text-zinc-600 text-xs mt-1">{p.analytics}</div>
              </div>
            ))}
          </div>

          <Link to="/pricing">
            <Button variant="outline" size="lg">
              Compare all plans &amp; features
              <ArrowRight size={15} />
            </Button>
          </Link>
        </div>
      </section>

      {/* ── 8. FAQ ───────────────────────────────────────────────────────────── */}
      {/* Deliverable 7: 5 featured-snippet-targeting questions */}
      <section className="py-24 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-14">
            <span className="section-header">
              <QrCode size={14} />
              Common questions
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-white mt-4 mb-4">
              Dynamic QR codes — answered
            </h2>
            <p className="text-zinc-400 max-w-lg mx-auto text-sm">
              Everything you need to know before creating your first dynamic QR code.
            </p>
          </div>

          <div className="space-y-3">
            {faqs.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>

          <p className="text-center text-zinc-500 text-sm mt-8">
            More questions?{" "}
            <Link to="/faq" className="text-violet-400 hover:text-violet-300 underline underline-offset-2">
              Visit the full FAQ →
            </Link>
          </p>
        </div>
      </section>

      {/* ── 9. Final CTA ─────────────────────────────────────────────────────── */}
      <section className="py-24 px-4 border-t border-zinc-800 bg-zinc-900/30">
        <div className="max-w-3xl mx-auto text-center">
          <div className="glass-card p-12 rounded-3xl relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-600/15 to-purple-600/5 pointer-events-none" />
            <div className="relative">
              <h2 className="text-3xl md:text-4xl font-bold text-white leading-[1.35] mb-5">
                Your QR code is printed.
                <br />
                <span className="gradient-text">It can still change.</span>
              </h2>
              <p className="text-zinc-400 mb-8 max-w-md mx-auto text-sm leading-relaxed">
                Create a dynamic QR code in 60 seconds. Free trial — no credit card.
                Dynamic QR codes from ₹299/mo after trial.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/signup?next=/app/create">
                  <Button size="xl" variant="glow">
                    Create Your First Dynamic QR — Free
                    <ArrowRight size={16} />
                  </Button>
                </Link>
                <Link to="/generate">
                  <Button size="xl" variant="secondary">
                    Try static QR first →
                  </Button>
                </Link>
              </div>
              <p className="text-zinc-700 text-xs mt-5">
                No credit card · UPI &amp; net banking accepted · Cancel any time
              </p>
            </div>
          </div>
        </div>
      </section>

    </div>
  )
}
