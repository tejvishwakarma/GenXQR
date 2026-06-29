import { useState } from "react"
import { Link } from "react-router-dom"
import {
  Users, Globe2, Sparkles, Server, ArrowRight, Target,
  ShieldCheck, ChevronDown, RefreshCw, BarChart3, IndianRupee,
  Zap, MapPin, Rocket, Clock, Linkedin, User,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { SEOMeta } from "@/components/SEOMeta"
import { cn } from "@/lib/utils"

// ─── JSON-LD schema ───────────────────────────────────────────────────────────
// Deliverable 8: Organization + SoftwareApplication + FAQPage

const ABOUT_JSON_LD = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "GenXQR",
    "url": "https://genxqr.streamsnatcher.com",
    "logo": "https://genxqr.streamsnatcher.com/logo.png",
    "description": "GenXQR is an Indian dynamic QR code generator that lets businesses create, edit, track, and control QR codes — including editing the destination after printing.",
    "foundingDate": "2026",
    "foundingLocation": {
      "@type": "Place",
      "addressCountry": "IN",
    },
    "areaServed": "IN",
    "priceRange": "₹0 – ₹9,999/month",
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "GenXQR",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web",
    "url": "https://genxqr.streamsnatcher.com",
    "offers": [
      {
        "@type": "Offer",
        "name": "Free Plan",
        "price": "0",
        "priceCurrency": "INR",
        "description": "3 QR codes with basic analytics. No credit card required.",
      },
      {
        "@type": "Offer",
        "name": "Starter",
        "price": "299",
        "priceCurrency": "INR",
        "description": "10 dynamic QR codes, full scan analytics, smart routing, CSV export.",
      },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "Where is GenXQR based?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "GenXQR is built and operated in India. It is designed specifically for Indian businesses — with INR pricing, UPI payment support, and use cases built around the Indian market: restaurant menus, D2C packaging, event badges, real estate signboards, and more. Our infrastructure is optimised for low-latency scans across Indian cities.",
        },
      },
      {
        "@type": "Question",
        "name": "Is GenXQR free?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes — GenXQR has a free plan that includes 3 QR codes with basic analytics. No credit card is required. The free plan supports both static and dynamic QR codes. Paid plans start at ₹299/month (Starter) and include 10 QR codes, full scan analytics by city and device, smart routing, scheduled QR codes, and CSV export. All plans accept UPI, debit, and credit cards.",
        },
      },
      {
        "@type": "Question",
        "name": "What is GenXQR used for?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "GenXQR is used to create QR codes that can be edited after printing and track every scan by city, device, and time. Common uses include: restaurant digital menus (update prices without reprinting), product packaging (fix outdated guides without a recall), event badges (change speaker sessions after printing), campaign flyers (swap landing pages mid-campaign), business cards (update contact details), and WiFi sharing. GenXQR supports 16 QR content types.",
        },
      },
      {
        "@type": "Question",
        "name": "Is GenXQR safe to use?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. GenXQR uses HTTPS across all connections, bcrypt password hashing, short-lived JWT authentication tokens with HttpOnly refresh cookies, and rate limiting on all endpoints. QR codes can be password-protected and set to expire automatically after a date or scan count. No personal data from the person scanning is collected — only aggregate scan metadata (city, device type, OS, browser).",
        },
      },
      {
        "@type": "Question",
        "name": "Does GenXQR work in India?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes — GenXQR is built for India. Pricing is in Indian Rupees (INR) starting at ₹299/month. Payments accept UPI, Razorpay, debit cards, and credit cards. Scan analytics track Indian cities across all states. The platform is used by restaurants, retailers, event organisers, clinics, schools, and real estate agents across India. Customer support is available in English.",
        },
      },
    ],
  },
]

// ─── Values data ──────────────────────────────────────────────────────────────
// Deliverable 4: Rewritten benefit-led, India-first

const values = [
  {
    icon: <Users className="text-blue-400" size={22} />,
    bg: "bg-blue-500/10 border-blue-500/20",
    title: "Built for operators, not developers",
    desc: "The restaurant owner updating prices at 11pm shouldn't need a developer. Every feature in GenXQR is designed to be done in under 60 seconds, without technical knowledge.",
  },
  {
    icon: <Server className="text-emerald-400" size={22} />,
    bg: "bg-emerald-500/10 border-emerald-500/20",
    title: "A broken scan is a broken promise",
    desc: "Your QR code is on a printed flyer, a menu, or a product in the field. If it fails, there is no fallback. We treat every scan as a commitment we have to honour.",
  },
  {
    icon: <Sparkles className="text-violet-400" size={22} />,
    bg: "bg-violet-500/10 border-violet-500/20",
    title: "Features that save money, not just look good",
    desc: "We ship capabilities with a clear ROI: editing after printing saves reprinting costs; analytics tell you which campaign is working before you spend more. That's the standard.",
  },
  {
    icon: <Globe2 className="text-amber-400" size={22} />,
    bg: "bg-amber-500/10 border-amber-500/20",
    title: "Indian pricing for Indian businesses",
    desc: "Global tools charge in USD and ignore the Indian market. GenXQR is priced in INR, accepts UPI, and is built around use cases that matter here — not Silicon Valley playbooks.",
  },
]

// ─── Milestones data ──────────────────────────────────────────────────────────
// Q1 2026 = LIVE NOW. Q2 and Q3 are upcoming roadmap milestones.

type Milestone = {
  quarter: string
  label: string
  title: string
  desc: string
  status: "live" | "upcoming" | "planned"
}

const milestones: Milestone[] = [
  {
    quarter: "Q1 2026",
    label: "Live now",
    title: "GenXQR launched",
    desc: "The full platform shipped: dynamic QR codes, real-time scan analytics (city, device, OS), smart routing, A/B testing, team workspaces, REST API, and 16 QR types. Everything you see on this site is live today.",
    status: "live",
  },
  {
    quarter: "Q2 2026",
    label: "Coming soon",
    title: "Integrations & automation",
    desc: "Native integrations with Zapier, Google Sheets, and Notion. Deeper webhook controls, campaign tagging, and automated scan-based email triggers — so your QR data connects to the tools you already use.",
    status: "upcoming",
  },
  {
    quarter: "Q3 2026",
    label: "On the roadmap",
    title: "White-label & enterprise",
    desc: "Custom domain QR codes, white-label dashboard for agencies, SSO, and enterprise-grade audit logging — so large teams and resellers can run GenXQR under their own brand.",
    status: "planned",
  },
]

// ─── Founders data ────────────────────────────────────────────────────────────
// Replace placeholder values with real names, roles, bios, and image paths.

type Founder = {
  name: string
  role: string
  bio: string
  image: string | null   // set to imported image path when ready
  linkedin: string | null
}

const founders: Founder[] = [
  {
    name: "Founder Name",            // TODO: replace
    role: "Co-Founder & CEO",
    bio: "Drives product vision and growth strategy. Previously built and scaled [Company]. Obsessed with making offline-to-digital tools accessible for every Indian business.",
    image: null,                     // TODO: replace with imported image
    linkedin: null,                  // TODO: replace with LinkedIn URL
  },
  {
    name: "Founder Name",            // TODO: replace
    role: "Co-Founder & CTO",
    bio: "Leads engineering and infrastructure. Built GenXQR's scan pipeline to handle real-time analytics at scale. Believes the best infrastructure is the kind you never notice.",
    image: null,                     // TODO: replace with imported image
    linkedin: null,                  // TODO: replace with LinkedIn URL
  },
]

// ─── FAQ data ─────────────────────────────────────────────────────────────────
// Deliverable 7: 5 questions, Cluster D featured snippet targeting

const faqs = [
  {
    q: "Where is GenXQR based?",
    a: "GenXQR is built and operated in India — designed specifically for Indian businesses with INR pricing, UPI payment support, and use cases built around the Indian market: restaurant menus, D2C packaging, event badges, real estate signboards, and more. Our infrastructure is optimised for low-latency QR scans across Indian cities.",
  },
  {
    q: "Is GenXQR free?",
    a: "Yes — GenXQR has a free plan with 3 QR codes and basic analytics. No credit card required. Paid plans start at ₹299/month (Starter) with 10 QR codes, full scan analytics by city and device, smart routing, scheduled QR codes, and CSV export. All plans accept UPI, debit, and credit cards.",
  },
  {
    q: "What is GenXQR used for?",
    a: "GenXQR is used to create QR codes that can be edited after printing and track every scan by city, device, and time. Common uses: restaurant digital menus (update prices without reprinting), product packaging (fix outdated guides without a recall), event badges (change sessions after printing), campaign flyers (swap landing pages mid-campaign), business cards, and WiFi sharing. GenXQR supports 16 QR content types.",
  },
  {
    q: "Is GenXQR safe to use?",
    a: "Yes. GenXQR uses HTTPS on all connections, bcrypt password hashing, short-lived JWT authentication with HttpOnly refresh cookies, and rate limiting on every endpoint. QR codes can be password-protected and set to expire after a date or scan count. No personal data from the person scanning is collected — only aggregate metadata (city, device type, OS, browser).",
  },
  {
    q: "Does GenXQR work in India?",
    a: "Yes — GenXQR is built for India. Pricing starts at ₹299/month in INR. Payments accept UPI, debit cards, and credit cards. Scan analytics cover Indian cities across all states. The platform is used by restaurants, retailers, event organisers, clinics, schools, and real estate agents across India.",
  },
]

// ─── FAQ component ────────────────────────────────────────────────────────────

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

// ─── Page component ───────────────────────────────────────────────────────────

export default function AboutPage() {
  return (
    <div className="pt-16 pb-24 px-4 animate-fade-in relative overflow-hidden">

      {/*
        Deliverable 1: SEO title (56 chars) — target keyword: "qr code generator"
        Deliverable 2: Meta description (150 chars) — benefit-led with CTA
        Deliverable 8: JSON-LD — Organization + SoftwareApplication + FAQPage
      */}
      <SEOMeta
        title="About GenXQR | QR Code Generator for Indian Businesses"
        description="GenXQR helps Indian businesses create QR codes they can edit after printing and track by city and device. Free plan available, paid plans from ₹299/month."
        url="/about"
        jsonLd={ABOUT_JSON_LD}
      />

      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-violet-600/10 rounded-full blur-[110px] pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        {/*
          Deliverable 3: H1 rewrite — differs from title tag
          Deliverable 6: 3 A/B variants
            Variant A (active): "We built GenXQR because one reprinted QR code is one too many"
            Variant B: "Dynamic QR Codes Should Cost Less Than Reprinting. We Made Them."
            Variant C: "Made in India. Built for Every Business Tired of Reprinting."
        */}
        <section className="pt-8 text-center max-w-4xl mx-auto">
          <span className="section-header">
            <Target size={14} />
            Why we built GenXQR
          </span>
          <h1 className="text-4xl md:text-6xl font-bold text-white mt-6 mb-5">
            We built GenXQR because{" "}
            <span className="gradient-text">one reprinted QR code is one too many</span>
          </h1>
          {/* Deliverable 4: Hero subheading — India-first, specific, benefit-led */}
          <p className="text-zinc-400 text-lg leading-relaxed max-w-2xl mx-auto">
            A restaurant reprints 500 menus when the price changes. An event organiser
            reorders 8,000 badges when a speaker cancels. A D2C brand scraps 50,000 flyers
            because the offer expired. Every one of these is a problem a dynamic QR code
            solves in 30 seconds. We built GenXQR to make that the default.
          </p>

          {/* Deliverable 5: Hero CTAs — primary + secondary */}
          {/* Deliverable 9: Internal links */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8">
            <Link to="/generate">
              <Button size="xl" variant="glow">
                Create Your First QR Code — Free
                <ArrowRight size={16} />
              </Button>
            </Link>
            <Link to="/use-cases">
              <Button size="xl" variant="secondary">
                See how businesses use it →
              </Button>
            </Link>
          </div>
        </section>

        {/* ── Mission + Metrics ────────────────────────────────────────────── */}
        {/* Deliverable 4: "What we optimize for" rewritten with real numbers */}
        <section className="mt-20 grid lg:grid-cols-2 gap-8 items-stretch">
          <Card className="glass-card border-zinc-800 p-8">
            <CardContent className="p-0">
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">Our mission</h2>
              <p className="text-zinc-400 leading-relaxed mb-6">
                Give every business — a one-table café or a 50-branch chain — the ability
                to update a QR code after it's already printed, and see exactly who scanned
                it, from which city, on which device, and when.
              </p>
              <div className="space-y-3">
                {[
                  "Edit any QR destination in under one second",
                  "Turn every scan into city, device, and time data",
                  "Make dynamic QR affordable for Indian SMBs at ₹299/month",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2 text-zinc-300 text-sm">
                    <ShieldCheck size={15} className="text-violet-400 shrink-0 mt-0.5" />
                    {item}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card border-zinc-800 p-8">
            <CardContent className="p-0">
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-5">
                What we're measured by
              </h2>
              <div className="grid grid-cols-2 gap-4">
                {[
                  {
                    icon: <RefreshCw size={16} className="text-blue-400" />,
                    value: "< 1s",
                    label: "destination update time",
                  },
                  {
                    icon: <BarChart3 size={16} className="text-violet-400" />,
                    value: "50+",
                    label: "countries in scan analytics",
                  },
                  {
                    icon: <IndianRupee size={16} className="text-emerald-400" />,
                    value: "₹299",
                    label: "per month to start",
                  },
                  {
                    icon: <Zap size={16} className="text-amber-400" />,
                    value: "16",
                    label: "QR content types",
                  },
                ].map((metric) => (
                  <div key={metric.label} className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-4">
                    <div className="flex items-center gap-1.5 mb-1">{metric.icon}</div>
                    <div className="text-white font-bold text-xl tabular-nums">{metric.value}</div>
                    <div className="text-zinc-500 text-xs mt-1">{metric.label}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ── India-first section ──────────────────────────────────────────── */}
        {/* Deliverable 4: New section — India-first trust signal, competitive differentiator */}
        <section className="mt-20">
          <div className="glass-card rounded-2xl p-8 md:p-10 border border-zinc-800 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/10 via-transparent to-violet-600/10 pointer-events-none" />
            <div className="relative grid md:grid-cols-2 gap-8 items-center">
              <div>
                <span className="section-header mb-4 inline-flex">
                  <MapPin size={14} />
                  Made for India
                </span>
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                  Global QR tools charge in USD.<br />
                  <span className="gradient-text">We charge in INR.</span>
                </h2>
                <p className="text-zinc-400 text-sm leading-relaxed mb-4">
                  Most QR code platforms are built for the US and European market — with USD
                  pricing, Stripe-only payments, and use cases that don't reflect Indian
                  businesses. GenXQR is built from the ground up for India: INR pricing,
                  UPI payments, and a platform shaped by Indian SMB workflows.
                </p>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  From a dhaba in Pune updating its menu, to a D2C brand in Bengaluru
                  running a Diwali flyer campaign, to a hospital in Delhi sharing appointment
                  links — GenXQR is priced and designed for every one of them.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Pricing", ours: "INR, from ₹299/mo", theirs: "USD, $15–$100/mo" },
                  { label: "Payments", ours: "UPI, debit, credit", theirs: "Credit card only" },
                  { label: "Analytics", ours: "Indian city data", theirs: "Country-level only" },
                  { label: "Support", ours: "India timezone", theirs: "US/EU hours" },
                ].map((row) => (
                  <div key={row.label} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                    <div className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider mb-2">{row.label}</div>
                    <div className="text-emerald-400 text-xs font-semibold mb-1">✓ {row.ours}</div>
                    <div className="text-zinc-600 text-xs line-through">{row.theirs}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Core values ──────────────────────────────────────────────────── */}
        {/* Deliverable 4: Values rewritten — benefit-led, no corporate-speak */}
        <section className="mt-20">
          <div className="text-center mb-10">
            <span className="section-header">
              <Rocket size={14} />
              What we stand for
            </span>
            <h2 className="text-3xl font-bold text-white mt-4 mb-3">
              The principles behind every{" "}
              <span className="gradient-text">product decision</span>
            </h2>
            <p className="text-zinc-400 max-w-xl mx-auto text-sm">
              Not corporate values hung on a wall. Actual decisions we make every week
              about what to build, what to skip, and how to price it.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {values.map((value) => (
              <Card key={value.title} className="p-6 card-hover">
                <CardContent className="p-0">
                  <div className={`w-11 h-11 rounded-xl border flex items-center justify-center mb-5 ${value.bg}`}>
                    {value.icon}
                  </div>
                  <h3 className="text-white font-semibold text-base mb-2">{value.title}</h3>
                  <p className="text-zinc-400 text-sm leading-relaxed">{value.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* ── Journey / Timeline ───────────────────────────────────────────── */}
        <section className="mt-20">
          <div className="glass-card rounded-2xl p-8 md:p-10 border border-zinc-800">
            <div className="text-center mb-8">
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
                How we got here
              </h2>
              <p className="text-zinc-400 text-sm">
                From a frustrating reprint run to a full campaign engine.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-5">
              {milestones.map((m) => {
                const isLive     = m.status === "live"
                const isUpcoming = m.status === "upcoming"
                const isPlanned  = m.status === "planned"

                return (
                  <div
                    key={m.title}
                    className={cn(
                      "rounded-xl border p-5 relative transition-all",
                      isLive     && "border-violet-500/40 bg-violet-500/5",
                      isUpcoming && "border-zinc-700/60 bg-zinc-900/40",
                      isPlanned  && "border-zinc-800/60 bg-zinc-900/20 opacity-70",
                    )}
                  >
                    {/* Status badge */}
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">
                        {m.quarter}
                      </span>
                      {isLive && (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                          {/* Pulsing dot */}
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                          </span>
                          Live now
                        </span>
                      )}
                      {isUpcoming && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
                          <Clock size={9} />
                          Coming soon
                        </span>
                      )}
                      {isPlanned && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500 bg-zinc-800/60 border border-zinc-700/40 px-2 py-0.5 rounded-full">
                          <Clock size={9} />
                          Roadmap
                        </span>
                      )}
                    </div>

                    <h3 className={cn(
                      "font-semibold mb-2",
                      isLive    ? "text-white"    : "text-zinc-400",
                    )}>
                      {m.title}
                    </h3>
                    <p className={cn(
                      "text-sm leading-relaxed",
                      isLive    ? "text-zinc-400" : "text-zinc-500",
                    )}>
                      {m.desc}
                    </p>
                  </div>
                )
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center justify-center gap-5 mt-8 pt-6 border-t border-zinc-800/60">
              <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Shipped
              </span>
              <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                In progress
              </span>
              <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                <span className="w-2 h-2 rounded-full bg-zinc-600" />
                Planned
              </span>
            </div>
          </div>
        </section>

        {/* ── Founders ─────────────────────────────────────────────────────── */}
        {/* Replace image={null} with imported image paths when photos are ready. */}
        {/* Replace name, role, bio, and linkedin with real values.             */}
        <section className="mt-20">
          <div className="text-center mb-12">
            <span className="section-header">
              <Users size={14} />
              The people behind GenXQR
            </span>
            <h2 className="text-3xl font-bold text-white mt-4 mb-3">
              Built by people who{" "}
              <span className="gradient-text">felt the problem first</span>
            </h2>
            <p className="text-zinc-400 max-w-xl mx-auto text-sm">
              We didn't build GenXQR as a side project. We built it because we were
              the ones reprinting menus, updating flyers, and wishing QR codes weren't
              permanent.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-6 justify-center max-w-3xl mx-auto">
            {founders.map((founder) => (
              <div
                key={founder.role}
                className="glass-card rounded-2xl border border-zinc-800 p-8 flex-1 flex flex-col items-center text-center"
              >
                {/* Avatar — swap div for <img> when photo is ready */}
                <div className="relative mb-5">
                  {founder.image ? (
                    <img
                      src={founder.image}
                      alt={founder.name}
                      className="w-24 h-24 rounded-full object-cover ring-2 ring-violet-500/30"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center ring-2 ring-violet-500/20">
                      <User size={36} className="text-zinc-600" />
                    </div>
                  )}
                  {/* Online / active indicator */}
                  <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-zinc-900 border-2 border-zinc-800 flex items-center justify-center">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  </span>
                </div>

                {/* Name + role */}
                <h3 className="text-white font-bold text-lg mb-0.5">{founder.name}</h3>
                <p className="text-violet-400 text-xs font-semibold uppercase tracking-wider mb-4">
                  {founder.role}
                </p>

                {/* Bio */}
                <p className="text-zinc-400 text-sm leading-relaxed flex-1">{founder.bio}</p>

                {/* LinkedIn */}
                {founder.linkedin ? (
                  <a
                    href={founder.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-5 inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-blue-400 transition-colors"
                  >
                    <Linkedin size={14} />
                    LinkedIn
                  </a>
                ) : (
                  <span className="mt-5 inline-flex items-center gap-1.5 text-xs text-zinc-700">
                    <Linkedin size={14} />
                    LinkedIn — coming soon
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────────────── */}
        {/* Deliverable 7: 5 questions targeting trust + Cluster D featured snippets */}
        <section className="mt-20 max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <span className="section-header">
              <Target size={14} />
              About GenXQR
            </span>
            <h2 className="text-3xl font-bold text-white mt-4 mb-3">
              Questions people ask{" "}
              <span className="gradient-text">before they trust us</span>
            </h2>
          </div>
          <div className="flex flex-col gap-3">
            {faqs.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────────────────────── */}
        {/* Deliverable 5: CTAs rewritten — no "sign up", primary to /generate */}
        {/* Deliverable 9: Internal links — /generate, /pricing */}
        <section className="mt-16 text-center">
          <div className="glass-card rounded-2xl p-8 md:p-10 border border-zinc-800 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-violet-600/10 via-transparent to-transparent pointer-events-none" />
            <div className="relative">
              <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
                Your next QR code shouldn't need{" "}
                <span className="gradient-text">a reprint to fix</span>
              </h2>
              <p className="text-zinc-400 max-w-xl mx-auto mb-3">
                Whether you run one location or fifty markets, GenXQR gives you editable
                QR codes and real scan data — from the first day, on the free plan.
              </p>
              <p className="text-zinc-600 text-xs mb-8">
                No credit card · UPI accepted · Cancel any time · Plans from ₹299/month
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link to="/generate">
                  <Button size="xl" variant="glow">
                    Create Your First QR Code — Free
                    <ArrowRight size={16} />
                  </Button>
                </Link>
                <Link to="/pricing">
                  <Button size="xl" variant="secondary">
                    See all plans
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  )
}
