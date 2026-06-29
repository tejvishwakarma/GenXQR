import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  ArrowRight, Zap, BarChart3, Globe, QrCode, TrendingUp,
  ChevronRight, Shield, Layers, RefreshCw, Users,
  Link2, FileText, Video, Share2, Contact, UtensilsCrossed,
  Wifi, Images, Smartphone, Ticket, Music2, Building2,
  MousePointerClick, Palette, Rocket, ChevronDown,
  ShoppingBag, CalendarDays, MapPin, HeartPulse, GraduationCap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useCountUp } from "@/hooks/useCountUp"
import { usePlatformStats } from "@/hooks/usePlatformStats"
import { SEOMeta } from "@/components/SEOMeta"

// ── JSON-LD schema ────────────────────────────────────────────────────────────

const HOME_JSON_LD = [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "GenXQR",
    "url": "https://genxqr.streamsnatcher.com",
    "potentialAction": {
      "@type": "SearchAction",
      "target": {
        "@type": "EntryPoint",
        "urlTemplate": "https://genxqr.streamsnatcher.com/generate?q={search_term_string}",
      },
      "query-input": "required name=search_term_string",
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "GenXQR",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web",
    "description":
      "QR code generator and management platform with dynamic QR codes, real-time analytics, A/B testing, smart routing, and 16 QR code types. Free plan available.",
    "url": "https://genxqr.streamsnatcher.com",
    "offers": {
      "@type": "AggregateOffer",
      "lowPrice": "0",
      "highPrice": "9999",
      "priceCurrency": "INR",
      "offerCount": "5",
      "description": "Free plan available. Paid plans from ₹299/month.",
    },
    "featureList": [
      "Dynamic QR codes",
      "Real-time scan analytics",
      "Smart routing by device, location, and time",
      "A/B testing for QR codes",
      "16 QR code types",
      "Team workspaces",
      "Public REST API",
      "Custom landing pages",
      "Bulk QR generation",
      "Password-protected QR codes",
    ],
    "inLanguage": "en-IN",
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
          "text": "A dynamic QR code contains a short redirect URL that points to your destination. You can change that destination any time — even after the QR code is already printed. Dynamic QR codes also track analytics: every scan is logged with timestamp, city, country, device type, and browser. GenXQR includes dynamic QR codes on its free plan.",
        },
      },
      {
        "@type": "Question",
        "name": "Can I edit a QR code after printing?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes — if it is a dynamic QR code. With GenXQR, you can update the destination URL, swap the PDF, or change the linked content at any time without reprinting. The printed QR code image never changes. Only static QR codes are locked after creation.",
        },
      },
      {
        "@type": "Question",
        "name": "How do I track who scanned my QR code?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "GenXQR tracks every scan automatically — no setup required. Your analytics dashboard shows the exact time, city, country, device type, and browser for every scan the moment it happens. No app is needed for the person scanning.",
        },
      },
      {
        "@type": "Question",
        "name": "Is GenXQR free?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. GenXQR has a free plan that includes 5 dynamic QR codes with scan analytics and basic customisation — no credit card required. Paid plans start at ₹299 per month and include more QR codes, advanced analytics, team workspaces, bulk generation, and REST API access.",
        },
      },
      {
        "@type": "Question",
        "name": "What types of QR codes can I create with GenXQR?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "GenXQR supports 16 QR code types: URL, PDF, Video, Social Media, vCard, Menu, WiFi, Image Gallery, App download, Coupon, Audio, Business profile, WhatsApp, Instagram, Facebook, and Coupon. All types support dynamic mode, meaning the content can be changed after printing.",
        },
      },
    ],
  },
]

// ── Stat card ─────────────────────────────────────────────────────────────────

function formatStat(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(0)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return value.toFixed(0)
}

function AnimatedStat({ value, suffix, label }: { value: number; suffix: string; label: string }) {
  const [count, ref] = useCountUp(value)
  const isPercent = suffix === "%"
  const display = isPercent ? count.toFixed(0) : formatStat(count)
  return (
    <div ref={ref}>
      <div className="stat-number">{display}{suffix}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

// ── Inline hero QR generator ──────────────────────────────────────────────────

const HERO_QR_TYPES = [
  { value: "url",       label: "Website URL" },
  { value: "whatsapp",  label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "wifi",      label: "WiFi" },
]

function HeroGenerator() {
  const navigate = useNavigate()
  const [type, setType] = useState("url")
  const [value, setValue] = useState("")

  const placeholder: Record<string, string> = {
    url:       "https://yourwebsite.com",
    whatsapp:  "+91 98765 43210",
    instagram: "@yourhandle",
    wifi:      "Network name (SSID)",
  }

  function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    if (!value.trim()) return
    navigate(`/generate/${type}?prefill=${encodeURIComponent(value.trim())}`)
  }

  return (
    <form
      onSubmit={handleGenerate}
      className="mt-10 w-full max-w-xl mx-auto animate-fade-in animate-delay-300"
    >
      <div className="flex flex-col gap-2 p-2 rounded-2xl bg-zinc-900 border border-zinc-700/60 shadow-xl">
        {/* Row 1: Type selector (full width on mobile, auto on desktop) */}
        <div className="relative">
          <select
            value={type}
            onChange={(e) => { setType(e.target.value); setValue("") }}
            className="appearance-none h-11 pl-3 pr-8 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm font-medium focus:outline-none focus:border-violet-500 cursor-pointer w-full"
          >
            {HERO_QR_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
        </div>

        {/* Row 2: Input + Generate side by side */}
        <div className="flex gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder[type]}
            className="flex-1 h-11 px-4 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 min-w-0"
          />
          <button
            type="submit"
            className="h-11 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors whitespace-nowrap flex items-center gap-2 shrink-0"
          >
            <QrCode size={15} />
            Generate
          </button>
        </div>
      </div>
      <p className="text-zinc-600 text-xs text-center mt-3">
        Free &nbsp;·&nbsp; No credit card &nbsp;·&nbsp; UPI &amp; net banking accepted
      </p>
    </form>
  )
}

// ── Static data ───────────────────────────────────────────────────────────────

const features = [
  {
    icon: <BarChart3 size={20} />,
    title: "Scan Analytics",
    desc: "Know exactly who scanned, when, and from where. Every scan logged with city, device, browser, and time — visible the instant it happens.",
    link: "/features",
    anchor: "real-time scan analytics",
  },
  {
    icon: <RefreshCw size={20} />,
    title: "Dynamic QR Codes",
    desc: "Print once, update forever. Change the destination, swap the PDF, refresh the offer — the printed QR code never changes.",
    link: "/dynamic-qr",
    anchor: "dynamic QR codes",
  },
  {
    icon: <Globe size={20} />,
    title: "Smart Routing",
    desc: "One QR code, different pages for different people. Route by city, device, or time of day — automatically, no code needed.",
    link: "/features",
    anchor: "smart routing",
  },
  {
    icon: <Layers size={20} />,
    title: "16 QR Code Types",
    desc: "Every format your business needs — URL, PDF, menu, vCard, WiFi, social media, app download, coupons, and more. All in one platform.",
    link: null,
    anchor: null,
  },
  {
    icon: <Shield size={20} />,
    title: "Password Protection",
    desc: "Lock a QR code with a password. Perfect for confidential documents, VIP-only offers, or private event materials.",
    link: null,
    anchor: null,
  },
  {
    icon: <Users size={20} />,
    title: "Team Collaboration",
    desc: "Invite your team, set their access level, and manage every QR code from one shared workspace.",
    link: "/pricing",
    anchor: "available from the STARTER plan",
  },
]

const howItWorks = [
  {
    step: "01",
    icon: <MousePointerClick size={24} />,
    title: "Pick your format",
    desc: "URL, PDF, menu, vCard, WiFi, social, app download — 16 types, each purpose-built. Pick the one that fits your goal.",
    color: "text-violet-400",
    bg: "bg-violet-500/10 border-violet-500/20",
  },
  {
    step: "02",
    icon: <Palette size={24} />,
    title: "Make it look like your brand",
    desc: "Add your logo, pick your colours, choose a dot style. Your QR code should look as polished as your business card.",
    color: "text-pink-400",
    bg: "bg-pink-500/10 border-pink-500/20",
  },
  {
    step: "03",
    icon: <Rocket size={24} />,
    title: "Go live and watch the data flow in",
    desc: "Download as PNG, SVG, or PDF. Print it, post it, put it anywhere. The moment someone scans, your analytics dashboard updates in real time.",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10 border-cyan-500/20",
  },
]

const industries = [
  {
    icon: <UtensilsCrossed size={20} />,
    title: "Restaurants & Cafés",
    desc: "Replace printed menus overnight. Update prices or add daily specials in seconds — no new print runs, no wasted paper.",
    color: "text-orange-400",
    bg: "bg-orange-500/10 border-orange-500/20",
  },
  {
    icon: <ShoppingBag size={20} />,
    title: "Retail & E-commerce",
    desc: "Put a QR code on shelf. When the offer changes, update the destination — not the print. Drive foot traffic and measure it.",
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
  },
  {
    icon: <CalendarDays size={20} />,
    title: "Events & Entertainment",
    desc: "One QR code handles everything — agenda, speaker bios, tickets, feedback form. Update it live as the event unfolds.",
    color: "text-violet-400",
    bg: "bg-violet-500/10 border-violet-500/20",
  },
  {
    icon: <MapPin size={20} />,
    title: "Real Estate",
    desc: "Virtual tours, floor plans, and your contact — one scan gets buyers everything they need from a hoarding or site board.",
    color: "text-green-400",
    bg: "bg-green-500/10 border-green-500/20",
  },
  {
    icon: <HeartPulse size={20} />,
    title: "Healthcare",
    desc: "Contactless intake forms, medication guides, wayfinding maps, and appointment booking — all scan-to-access, no app required.",
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
  },
  {
    icon: <GraduationCap size={20} />,
    title: "Education",
    desc: "Course materials, campus maps, enrollment links, and notices — one QR code per poster, always pointing to the latest version.",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10 border-yellow-500/20",
  },
]

const qrTypes = [
  { label: "URL",          desc: "Send scanners anywhere — website, offer, booking page",   icon: <Link2 size={22} /> },
  { label: "PDF",          desc: "Share documents that update without reprinting",            icon: <FileText size={22} /> },
  { label: "Video",        desc: "YouTube, Vimeo or direct file",                            icon: <Video size={22} /> },
  { label: "Social Media", desc: "All your social profiles in one scan",                     icon: <Share2 size={22} /> },
  { label: "vCard",        desc: "Scanners save your number instantly — no typing required", icon: <Contact size={22} /> },
  { label: "Menu",         desc: "Update your menu in seconds, not days",                    icon: <UtensilsCrossed size={22} /> },
  { label: "WiFi",         desc: "Guests connect instantly — no password-sharing needed",    icon: <Wifi size={22} /> },
  { label: "Gallery",      desc: "Image portfolio & lookbooks",                              icon: <Images size={22} /> },
  { label: "App",          desc: "One QR code → auto-routes to App Store or Play Store",    icon: <Smartphone size={22} /> },
  { label: "Coupon",       desc: "Run offers with built-in expiry — no coupon code leaks",  icon: <Ticket size={22} /> },
  { label: "Audio",        desc: "Podcasts, music & voice notes",                           icon: <Music2 size={22} /> },
  { label: "Business",     desc: "Full company profile & hours",                            icon: <Building2 size={22} /> },
]

const faqs = [
  {
    q: "What is a dynamic QR code?",
    a: "A dynamic QR code contains a short redirect URL that points to your destination. You can change that destination any time — even after the QR code is already printed. Dynamic QR codes also track analytics: every scan is logged with timestamp, city, country, device type, and browser. GenXQR includes dynamic QR codes on its free plan.",
  },
  {
    q: "Can I edit a QR code after printing?",
    a: "Yes — if it is a dynamic QR code. With GenXQR, you can update the destination URL, swap the PDF, or change the linked content at any time without reprinting. The printed QR code image never changes. Only static QR codes are locked after creation.",
  },
  {
    q: "How do I track who scanned my QR code?",
    a: "GenXQR tracks every scan automatically — no setup required. Your analytics dashboard shows the exact time, city, country, device type, and browser for every scan the moment it happens. No app is needed for the person scanning.",
  },
  {
    q: "Is GenXQR free?",
    a: "Yes. GenXQR has a free plan that includes 5 dynamic QR codes with scan analytics and basic customisation — no credit card required. Paid plans start at ₹299/month and include more QR codes, advanced analytics, team workspaces, bulk generation, and REST API access.",
  },
  {
    q: "What types of QR codes can I create?",
    a: "GenXQR supports 16 QR code types: URL, PDF, Video, Social Media, vCard, Menu, WiFi, Image Gallery, App download, Coupon, Audio, Business profile, WhatsApp, Instagram, and Facebook. All types support dynamic mode, meaning the content can be changed after printing.",
  },
]

// ── FAQ accordion item ────────────────────────────────────────────────────────

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
          className={`shrink-0 text-zinc-400 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { stats } = usePlatformStats()

  return (
    <div className="relative overflow-hidden">
      <SEOMeta
        title="QR Code Generator with Analytics & Smart Routing"
        description="Create QR codes you can edit after printing. Track every scan by city, device & time. 16 QR types, smart routing, A/B testing. Free plan — no credit card needed."
        url="/"
        jsonLd={HOME_JSON_LD}
      />

      {/* ── 1. Hero ── */}
      <section className="relative pt-20 pb-32 px-4">
        <div className="absolute inset-0 bg-hero-glow pointer-events-none" />
        <div className="absolute inset-0 bg-dots opacity-30 pointer-events-none" />
        <div className="absolute top-32 left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-violet-600/8 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto text-center relative">
          <div className="animate-fade-in">
            <span className="section-header">
              <Zap size={14} className="text-violet-400" />
              India's QR Code Platform — Free Plan Included 🇮🇳
            </span>
          </div>

          <h1 className="hero-text text-white mt-8 mb-6 animate-fade-in animate-delay-100">
            Create QR Codes You Can{" "}
            <span className="gradient-text">Edit, Track,</span>
            <br />
            and Update — Any Time
          </h1>

          <p className="text-zinc-400 text-lg md:text-xl max-w-2xl mx-auto mb-4 leading-relaxed animate-fade-in animate-delay-200">
            Print your QR code today. Change where it leads tomorrow. Know exactly who scanned it,
            when, and from which city — in real time.{" "}
            <span className="text-zinc-300">Free plan, no credit card.</span>
          </p>

          {/* Inline hero generator — #1 competitive gap vs QR Tiger */}
          <HeroGenerator />

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mt-8 animate-fade-in animate-delay-400">
            <Link to="/signup" className="w-full sm:w-auto">
              <Button size="xl" variant="glow" className="group w-full sm:w-auto">
                Create Your First QR Code — Free
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Link to="/features" className="w-full sm:w-auto">
              <Button size="xl" variant="outline" className="w-full sm:w-auto">
                See all features →
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── 2. Trust bar ── */}
      <section className="py-10 border-b border-zinc-800/60">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-zinc-500 text-sm font-medium">
            <span className="flex items-center gap-2">
              <span className="text-violet-400 font-bold">{formatStat(stats.qrCodesGenerated)}+</span>
              QR codes created
            </span>
            <span className="text-zinc-800 hidden sm:inline">◆</span>
            <span className="flex items-center gap-2">
              <span className="text-violet-400 font-bold">{formatStat(stats.totalScans)}+</span>
              scans tracked
            </span>
            <span className="text-zinc-800 hidden sm:inline">◆</span>
            <span className="flex items-center gap-2">
              <span className="text-violet-400 font-bold">{formatStat(stats.activeBusinesses)}+</span>
              businesses across India
            </span>
            <span className="text-zinc-800 hidden sm:inline">◆</span>
            <span className="flex items-center gap-2">
              <span className="text-violet-400 font-bold">{stats.uptimeSla.toFixed(1)}%</span>
              uptime guaranteed
            </span>
          </div>
        </div>
      </section>

      {/* ── 3. QR Types ── */}
      <section className="py-24 px-4 bg-zinc-900/30 border-y border-zinc-800">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="section-header">
              <QrCode size={14} />
              16 QR code types — all included
            </span>
            <h2 className="text-3xl md:text-5xl font-bold text-white mt-4 mb-4">
              One QR code platform.{" "}
              <span className="gradient-text">Every format your business needs.</span>
            </h2>
            <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
              URL to coupon, menu to vCard — every format built in. No third-party tools,
              no extra fees, no limits on creativity.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {qrTypes.map((type, i) => (
              <div
                key={type.label}
                className="glass-card rounded-2xl p-5 flex flex-col items-center text-center gap-3 cursor-pointer hover:border-violet-500/40 hover:scale-[1.04] hover:shadow-[0_0_24px_rgba(124,58,237,0.15)] transition-all duration-300 animate-fade-in group"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="w-11 h-11 rounded-xl border border-violet-500/25 bg-violet-500/10 flex items-center justify-center text-violet-400 group-hover:bg-violet-500/20 group-hover:border-violet-500/50 group-hover:scale-110 transition-all duration-300">
                  {type.icon}
                </div>
                <div>
                  <div className="text-white text-sm font-semibold leading-tight">{type.label}</div>
                  <div className="text-zinc-500 text-xs mt-1 leading-snug">{type.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Link to="/pricing">
              <button className="inline-flex items-center gap-2 text-violet-400 hover:text-violet-300 font-medium transition-colors text-sm">
                Compare all plans &amp; pricing
                <ArrowRight size={15} />
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── 4. How It Works ── */}
      <section className="py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="section-header">
              <Rocket size={14} />
              Ready in under 2 minutes
            </span>
            <h2 className="text-3xl md:text-5xl font-bold text-white mt-4 mb-4">
              Three steps from idea to{" "}
              <span className="gradient-text">live QR code</span>
            </h2>
            <p className="text-zinc-400 text-lg max-w-xl mx-auto">
              No design skills. No technical setup. Pick your type, make it yours,
              and watch the scans come in.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            {howItWorks.map((step, i) => (
              <div
                key={step.step}
                className="flex flex-col items-center text-center animate-fade-in"
                style={{ animationDelay: `${i * 150}ms` }}
              >
                <div className="relative mb-6">
                  <div className={`w-[72px] h-[72px] rounded-2xl border-2 flex items-center justify-center ${step.bg} ${step.color} shadow-lg`}>
                    {step.icon}
                  </div>
                  <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-zinc-900 border border-zinc-700 text-[10px] font-bold text-zinc-400 flex items-center justify-center">
                    {step.step}
                  </span>
                </div>
                <h3 className="text-white font-bold text-lg mb-3">{step.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed max-w-xs">
                  {step.step === "03"
                    ? <>
                        {step.desc.split("analytics dashboard")[0]}
                        <Link to="/app/dashboard" className="text-violet-400 hover:text-violet-300 underline underline-offset-2">
                          analytics dashboard
                        </Link>
                        {step.desc.split("analytics dashboard")[1]}
                      </>
                    : step.desc}
                </p>
              </div>
            ))}
          </div>

          <div className="text-center mt-14">
            <Link to="/signup">
              <Button size="xl" variant="glow">
                Create Your First QR Code — Free
                <ArrowRight size={16} />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── 5. Features ── */}
      <section className="py-24 px-4 bg-zinc-900/30 border-y border-zinc-800">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="section-header">
              <TrendingUp size={14} />
              Built to perform
            </span>
            <h2 className="text-3xl md:text-5xl font-bold text-white mt-4 mb-4">
              The features that make QR codes{" "}
              <span className="gradient-text">actually useful</span>
            </h2>
            <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
              From a dhaba in Pune to a D2C brand in Bangalore — the tools that used to cost
              enterprise pricing, available on every GenXQR plan.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <Card
                key={f.title}
                className="card-hover p-6 animate-fade-in"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <CardContent className="p-0">
                  <div className="feature-icon mb-4">{f.icon}</div>
                  <h3 className="text-white font-semibold text-lg mb-2">{f.title}</h3>
                  <p className="text-zinc-400 text-sm leading-relaxed">
                    {f.link && f.anchor
                      ? (() => {
                          const parts = f.desc.split(f.anchor)
                          return parts.length === 2
                            ? <>{parts[0]}<Link to={f.link} className="text-violet-400 hover:text-violet-300 underline underline-offset-2">{f.anchor}</Link>{parts[1]}</>
                            : f.desc
                        })()
                      : f.desc}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── 6. Industries ── */}
      <section className="py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="section-header">
              <TrendingUp size={14} />
              Built for your industry
            </span>
            <h2 className="text-3xl md:text-5xl font-bold text-white mt-4 mb-4">
              The QR code platform{" "}
              <span className="gradient-text">India's businesses rely on</span>
            </h2>
            <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
              Whether you run a café in Koramangala or a retail chain across 50 cities —
              GenXQR works the way your business works.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {industries.map((ind, i) => (
              <Link
                key={ind.title}
                to="/use-cases"
                className="glass-card rounded-2xl p-6 flex gap-4 hover:border-violet-500/30 hover:shadow-[0_0_20px_rgba(124,58,237,0.08)] transition-all duration-300 animate-fade-in group"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className={`w-11 h-11 rounded-xl border flex-shrink-0 flex items-center justify-center ${ind.bg} ${ind.color} group-hover:scale-110 transition-transform duration-300`}>
                  {ind.icon}
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm mb-1">{ind.title}</h3>
                  <p className="text-zinc-500 text-xs leading-relaxed">{ind.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── 7. Stats ── */}
      <section className="border-y border-zinc-800 bg-zinc-900/30 py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 text-center">
            <AnimatedStat value={stats.qrCodesGenerated} suffix="+" label="QR Codes Created" />
            <AnimatedStat value={stats.activeBusinesses}  suffix="+" label="Businesses Using GenXQR" />
            <AnimatedStat value={stats.totalScans}        suffix="+" label="Scans Tracked" />
            <AnimatedStat value={stats.uptimeSla}         suffix="%" label="Uptime Guaranteed" />
          </div>
        </div>
      </section>

      {/* ── 8. FAQ ── */}
      <section className="py-24 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-14">
            <span className="section-header">
              <QrCode size={14} />
              Questions answered
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-white mt-4 mb-4">
              Frequently asked questions
            </h2>
            <p className="text-zinc-400 text-base max-w-xl mx-auto">
              Everything you need to know before creating your first QR code.
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
              See the full FAQ →
            </Link>
          </p>
        </div>
      </section>

      {/* ── 9. Integrations ── */}
      <section className="py-24 px-4 bg-zinc-900/30 border-y border-zinc-800">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <span className="section-header">
              <Zap size={14} />
              Integrations
            </span>
            <h2 className="text-3xl md:text-5xl font-bold text-white mt-4 mb-4">
              Connect GenXQR to{" "}
              <span className="gradient-text">your automation stack</span>
            </h2>
            <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
              Use our REST API and webhook events with Zapier, Make, or n8n to automate
              QR creation, scan alerts, and CRM updates — no custom code required.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-5">
            {/* Zapier */}
            <div className="glass-card rounded-2xl p-7 flex flex-col items-center text-center gap-4 hover:border-violet-500/30 hover:shadow-[0_0_24px_rgba(124,58,237,0.08)] transition-all duration-300 group">
              <div className="flex items-center gap-2">
                <span className="text-[#FF4A00] font-black text-2xl tracking-tight">—</span>
                <span className="text-white font-black text-2xl tracking-tight">zapier</span>
              </div>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Connect GenXQR to 7,000+ apps. Auto-create QR codes from form submissions,
                push scan events to Sheets, or trigger Slack alerts.
              </p>
              <span className="mt-auto text-xs text-zinc-600 border border-zinc-800 rounded-full px-3 py-1">Via REST API + Webhooks</span>
            </div>

            {/* Make */}
            <div className="glass-card rounded-2xl p-7 flex flex-col items-center text-center gap-4 hover:border-violet-500/30 hover:shadow-[0_0_24px_rgba(124,58,237,0.08)] transition-all duration-300 group">
              <div className="flex items-center gap-2">
                <svg width="28" height="28" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <circle cx="8" cy="20" r="5" fill="#6D28D9" />
                  <circle cx="20" cy="8" r="5" fill="#8B5CF6" />
                  <circle cx="32" cy="20" r="5" fill="#7C3AED" />
                  <circle cx="20" cy="32" r="5" fill="#A78BFA" />
                  <line x1="8" y1="20" x2="20" y2="8" stroke="#8B5CF6" strokeWidth="2" />
                  <line x1="20" y1="8" x2="32" y2="20" stroke="#7C3AED" strokeWidth="2" />
                  <line x1="32" y1="20" x2="20" y2="32" stroke="#A78BFA" strokeWidth="2" />
                  <line x1="20" y1="32" x2="8" y2="20" stroke="#6D28D9" strokeWidth="2" />
                </svg>
                <span className="text-white font-black text-2xl tracking-tight">make</span>
              </div>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Build visual multi-step automation scenarios. Generate QR batches, sync
                scan analytics to your CRM, and automate campaign workflows.
              </p>
              <span className="mt-auto text-xs text-zinc-600 border border-zinc-800 rounded-full px-3 py-1">Via REST API + Webhooks</span>
            </div>

            {/* n8n */}
            <div className="glass-card rounded-2xl p-7 flex flex-col items-center text-center gap-4 hover:border-violet-500/30 hover:shadow-[0_0_24px_rgba(124,58,237,0.08)] transition-all duration-300 group">
              <div className="flex items-center gap-2">
                <svg width="28" height="28" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <circle cx="8" cy="20" r="6" fill="#EA4B71" />
                  <circle cx="20" cy="10" r="4" fill="#EA4B71" opacity="0.7" />
                  <circle cx="32" cy="20" r="6" fill="#EA4B71" />
                  <path d="M14 20 C14 14 26 14 26 20" stroke="#EA4B71" strokeWidth="2" fill="none" />
                  <path d="M14 20 C14 26 26 26 26 20" stroke="#EA4B71" strokeWidth="2" fill="none" opacity="0.5" />
                </svg>
                <span className="text-white font-black text-2xl tracking-tight">n8n</span>
              </div>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Self-hosted or cloud workflow automation. Full control over your data — trigger
                QR events to any internal system without vendor lock-in.
              </p>
              <span className="mt-auto text-xs text-zinc-600 border border-zinc-800 rounded-full px-3 py-1">Via REST API + Webhooks</span>
            </div>
          </div>

          <div className="mt-10 text-center flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/api-docs">
              <Button variant="outline" size="lg">
                View API Docs
                <ArrowRight size={15} />
              </Button>
            </Link>
            <Link to="/app/webhooks">
              <Button variant="ghost" size="lg" className="text-zinc-400 hover:text-white">
                Set up Webhooks
                <ChevronRight size={15} />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── 10. Final CTA ── */}
      <section className="py-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="glass-card p-6 sm:p-10 md:p-12 rounded-3xl relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-600/15 to-purple-600/5 pointer-events-none" />
            <div className="relative">
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold text-white leading-tight mb-4 sm:mb-6">
                Your first QR code is free.{" "}
                <span className="gradient-text">It takes 60 seconds.</span>
              </h2>
              <p className="text-zinc-400 text-base sm:text-lg mb-8 sm:mb-10 max-w-xl mx-auto">
                Join thousands of businesses across India creating, managing, and tracking
                their QR codes — from{" "}
                <Link to="/pricing" className="text-violet-400 hover:text-violet-300 underline underline-offset-2">
                  free plan
                </Link>{" "}
                to enterprise.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
                <Link to="/signup" className="w-full sm:w-auto">
                  <Button size="xl" variant="glow" className="w-full sm:w-auto">
                    Create Your First QR Code — Free
                    <ArrowRight size={16} />
                  </Button>
                </Link>
                <Link to="/pricing" className="w-full sm:w-auto">
                  <Button size="xl" variant="secondary" className="w-full sm:w-auto">
                    Compare plans
                    <ChevronRight size={16} />
                  </Button>
                </Link>
              </div>
              <p className="text-zinc-600 text-xs mt-5 sm:mt-6">
                No credit card &nbsp;·&nbsp; UPI &amp; net banking accepted &nbsp;·&nbsp; Cancel any time
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
