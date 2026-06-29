import { useState } from "react"
import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import {
  BarChart3,
  RefreshCw,
  Globe,
  Layers,
  Shield,
  Users,
  Zap,
  Code,
  ArrowRight,
  Check,
  Rocket,
  ChevronDown,
  ScanLine,
  Pencil,
  MousePointerClick,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { SEOMeta } from "@/components/SEOMeta"
import { cn } from "@/lib/utils"

// ─── JSON-LD schema ────────────────────────────────────────────────────────────
// Deliverable 8: SoftwareApplication + FAQPage

const FEATURES_JSON_LD = [
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
        "description": "3 QR codes, basic analytics, static and dynamic types included.",
      },
      {
        "@type": "Offer",
        "name": "Starter",
        "price": "299",
        "priceCurrency": "INR",
        "description": "10 dynamic QR codes, full analytics, smart routing, CSV export.",
      },
      {
        "@type": "Offer",
        "name": "Pro",
        "price": "799",
        "priceCurrency": "INR",
        "description": "50 QR codes, A/B testing, team workspace, REST API access, webhook events.",
      },
      {
        "@type": "Offer",
        "name": "Business",
        "price": "2499",
        "priceCurrency": "INR",
        "description": "Unlimited QR codes, white-label, priority support, bulk generation.",
      },
    ],
    "featureList": [
      "Real-time scan analytics — city, device, OS, browser",
      "Dynamic QR codes — edit destination after printing",
      "Smart routing — route by country, device, time of day",
      "16 QR code content types",
      "Password protection and scan limits",
      "Team workspace with role-based access",
      "REST API with API key authentication",
      "A/B testing with split traffic control",
      "Webhook events for scan triggers",
      "CSV export of scan data",
      "Custom QR slugs",
      "Fallback URLs on expiry",
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What features does GenXQR include?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "GenXQR includes dynamic QR codes you can edit after printing, real-time scan analytics (city, device, OS, browser), smart routing by country or device, A/B testing, password protection, scan limits, team workspaces, a REST API, and webhook events. It supports 16 QR content types: URL, WiFi, WhatsApp, vCard, PDF, video, MP3, image gallery, menu, social media, Facebook, Instagram, coupon, app download, business card, and custom landing pages.",
        },
      },
      {
        "@type": "Question",
        "name": "Can I edit a QR code after it is printed?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes — dynamic QR codes on GenXQR can be edited at any time after printing. The printed QR image never changes, but the destination it points to can be updated in under one second from your dashboard. This works on menus, packaging, flyers, banners, and any other printed or digital material.",
        },
      },
      {
        "@type": "Question",
        "name": "How do I track who scanned my QR code?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "GenXQR tracks every scan automatically. Your analytics dashboard shows the exact timestamp, city, country, device type (mobile/tablet/desktop), operating system, and browser for every scan — updated in real time. You can filter by date range and export the full dataset to CSV. No app is required for the person scanning.",
        },
      },
      {
        "@type": "Question",
        "name": "What is smart routing in a QR code?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Smart routing lets you send different people to different URLs from the same QR code, based on rules you define. For example: iOS users go to the App Store, Android users go to Google Play, visitors from Germany see the German landing page, and everyone else sees the English version. Rules can also be based on time of day or day of the week. Smart routing is available on GenXQR Pro plans and above.",
        },
      },
      {
        "@type": "Question",
        "name": "Does GenXQR have a free plan?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. GenXQR's free plan includes 3 QR codes with basic analytics and both static and dynamic types. No credit card is required. Paid plans start at ₹299/month (Starter) and include more QR codes, full scan analytics, smart routing, CSV export, and team features.",
        },
      },
    ],
  },
]

// ─── Feature card data ────────────────────────────────────────────────────────
// Deliverable 4: benefit-led rewrites of all 8 feature cards

type Feature = {
  category: string
  icon: ReactNode
  title: string
  desc: string
  items: string[]
  link?: { to: string; label: string }
}

const features: Feature[] = [
  {
    category: "Analytics",
    icon: <BarChart3 size={22} className="text-violet-400" />,
    title: "Know exactly who scanned — and from where",
    desc: "Every scan logs the timestamp, city, country, device type, OS, and browser automatically. No setup needed. Your data is waiting when you open the dashboard.",
    items: [
      "Scan timeline with trend view",
      "Device & OS breakdown",
      "Top cities & countries",
      "Export full data to CSV",
    ],
    link: { to: "/dynamic-qr", label: "See analytics in action →" },
  },
  {
    category: "Dynamic QR",
    icon: <RefreshCw size={22} className="text-blue-400" />,
    title: "Change the destination — without reprinting anything",
    desc: "Update the URL, swap the PDF, or redirect to a new offer — all from your dashboard. The printed QR code stays the same. The change goes live in under one second.",
    items: [
      "Edit destination any time",
      "Custom branded short slugs",
      "Sub-second live redirect",
      "Eliminates reprint costs",
    ],
    link: { to: "/dynamic-qr", label: "How dynamic QR works →" },
  },
  {
    category: "Routing",
    icon: <Globe size={22} className="text-emerald-400" />,
    title: "One QR code, different pages for different people",
    desc: "Route each scan to a different URL based on where the person is, what device they're using, or what time they scanned. One printed QR code handles it all.",
    items: [
      "Country & city targeting",
      "iOS vs Android split routing",
      "Time-of-day & day-of-week rules",
      "Priority rule ordering",
    ],
    link: { to: "/dynamic-qr", label: "Explore smart routing →" },
  },
  {
    category: "Content Types",
    icon: <Layers size={22} className="text-amber-400" />,
    title: "16 QR types — one tool covers them all",
    desc: "From a simple URL to a restaurant menu, a contact card, or a Spotify playlist — GenXQR generates the right QR type for every situation.",
    items: [
      "URL, WiFi, WhatsApp, Instagram",
      "PDF, video, MP3, image gallery",
      "vCard, business card, menu",
      "Coupon, app download, social links",
    ],
    link: { to: "/use-cases", label: "See use cases by industry →" },
  },
  {
    category: "Security",
    icon: <Shield size={22} className="text-red-400" />,
    title: "Lock, schedule, and cap your QR codes",
    desc: "Protect sensitive content behind a password, run a QR code only during a campaign window, or automatically deactivate it after a set number of scans.",
    items: [
      "Password-protected scans",
      "Scheduled start & end dates",
      "Scan limit cap",
      "Fallback URL on expiry",
    ],
  },
  {
    category: "Team",
    icon: <Users size={22} className="text-purple-400" />,
    title: "Your whole team, one shared dashboard",
    desc: "Invite colleagues, assign Owner / Admin / Editor / Viewer roles, and manage every QR code from a shared workspace. No more emailing QR files back and forth.",
    items: [
      "Team workspace seats",
      "Four role permission levels",
      "Shared QR code library",
      "Full audit log visibility",
    ],
    link: { to: "/pricing", label: "See team plan pricing →" },
  },
  {
    category: "Developer API",
    icon: <Code size={22} className="text-cyan-400" />,
    title: "Create and manage QR codes from your own code",
    desc: "GenXQR's REST API lets you generate, update, and monitor QR campaigns programmatically — plug it into your CMS, CRM, or automation pipeline.",
    items: [
      "Full REST API with CRUD",
      "API key authentication",
      "Webhook events on every scan",
      "Clean JSON responses",
    ],
    link: { to: "/api-docs", label: "Read the API docs →" },
  },
  {
    category: "A/B Testing",
    icon: <Zap size={22} className="text-violet-400" />,
    title: "Split test your campaign — automatically",
    desc: "Send a configurable percentage of scans to Variant B and compare results. The analytics tell you which destination drives more conversions — no guesswork.",
    items: [
      "Configurable split ratio",
      "Side-by-side scan analytics",
      "Identify the winning variant",
      "No code required",
    ],
    link: { to: "/dynamic-qr", label: "Learn about A/B testing →" },
  },
]

// ─── How it works ─────────────────────────────────────────────────────────────

const howItWorks = [
  {
    step: "1",
    icon: <ScanLine size={28} />,
    title: "Pick a QR type and add your content",
    desc: "Choose from 16 content types — URL, PDF, vCard, menu, WiFi, and more. Paste your link or fill in the form. Done in under a minute.",
    color: "text-violet-400",
    bg: "bg-violet-500/10 border-violet-500/20",
  },
  {
    step: "2",
    icon: <Pencil size={28} />,
    title: "Style it and download",
    desc: "Customise dot style, colours, corner shapes, and add your logo. Download as PNG for print or SVG for vectors — ready for any material.",
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
  },
  {
    step: "3",
    icon: <MousePointerClick size={28} />,
    title: "Track every scan in real time",
    desc: "From the moment the first person scans, your dashboard fills with data: city, device, time, OS. Change the destination any time without reprinting.",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
  },
]

// ─── FAQ data ─────────────────────────────────────────────────────────────────
// Deliverable 7: 5 Cluster D long-tail questions targeting featured snippets

const faqs = [
  {
    q: "What features does GenXQR include?",
    a: "GenXQR includes dynamic QR codes (editable after printing), real-time scan analytics by city, device, OS and browser, smart routing rules, A/B testing, password protection, scan limits, team workspaces with four role levels, a REST API, and webhook events. It supports 16 QR content types — URL, WiFi, WhatsApp, vCard, PDF, video, MP3, image gallery, menu, social media, Facebook, Instagram, coupon, app download, business card, and custom landing pages.",
  },
  {
    q: "Can I edit a QR code after it is printed?",
    a: "Yes — if you use a dynamic QR code. GenXQR lets you change where the QR code points at any time from your dashboard. The change goes live in under one second. The printed QR image never needs to change. This works on menus, flyers, packaging, exhibition stands, and any other printed material. Dynamic QR codes are included from the Starter plan at ₹299/month.",
  },
  {
    q: "How do I track who scanned my QR code?",
    a: "GenXQR tracks every scan automatically — no additional setup. Your analytics dashboard shows the scan timestamp, city, country, device type, operating system, and browser, updated in real time. You can filter by date range and export the full dataset to CSV. The person scanning does not need to install any app.",
  },
  {
    q: "What is smart routing in a QR code?",
    a: "Smart routing lets one QR code send different people to different URLs based on rules. For example: iOS users go to the App Store, Android users go to Google Play, visitors scanning from Delhi see a Hindi page, and all others see the English version. Rules can also fire by time of day or day of the week. Smart routing is available on GenXQR Pro and Business plans.",
  },
  {
    q: "Does GenXQR have a free plan?",
    a: "Yes. GenXQR's free plan lets you create 3 QR codes — both static and dynamic — with basic scan analytics included. No credit card required. Paid plans start at ₹299/month (Starter) for 10 QR codes with full analytics, smart routing, CSV export, and scheduled QR codes.",
  },
]

// ─── Component ────────────────────────────────────────────────────────────────

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

export default function FeaturesPage() {
  return (
    <div className="pt-16 pb-24 px-4">
      {/* Deliverable 1 & 2: SEO title + meta description */}
      {/* Deliverable 8: JSON-LD schema */}
      <SEOMeta
        title="QR Code Generator: Analytics, Routing & API"
        description="Create QR codes that track every scan by city and device, update after printing, and route by country or OS. 16 types, A/B testing, REST API. Free to start."
        url="/features"
        jsonLd={FEATURES_JSON_LD}
      />

      <div className="max-w-7xl mx-auto">

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        {/*
          Deliverable 3: H1 rewrite
          Deliverable 5: Hero CTAs — primary + secondary
          Deliverable 6: A/B variants (Variant A active; B & C in comments)

          Variant A (active): "Every Feature You Need to Create, Track, and Control QR Campaigns"
          Variant B: "Stop Reprinting. Start Tracking. Everything You Need in One QR Tool."
          Variant C: "QR Codes That Work Harder — Edit, Track, Route, and Test from One Dashboard"
        */}
        <section className="pt-8 text-center">
          <span className="section-header">
            <Rocket size={14} />
            Product features
          </span>
          <h1 className="text-4xl md:text-6xl font-bold text-white mt-6 mb-5">
            Every feature you need to{" "}
            <span className="gradient-text">create, track, and control QR campaigns</span>
          </h1>
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto leading-relaxed">
            GenXQR is more than a QR generator. Edit destinations after printing, see
            who's scanning and from where, route by device or location, and automate
            everything via API — all in one dashboard.
          </p>

          {/* Deliverable 5: Hero CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8">
            <Link to="/generate">
              <Button size="xl" variant="glow">
                Create Your First QR Code — Free
                <ArrowRight size={16} />
              </Button>
            </Link>
            <Link to="/dynamic-qr">
              <Button size="xl" variant="secondary">
                See how dynamic QR works →
              </Button>
            </Link>
          </div>

          {/* Trust bar */}
          <div className="grid sm:grid-cols-3 gap-4 mt-12 max-w-3xl mx-auto">
            {[
              { label: "Edit after printing", value: "Change destinations in < 1 second" },
              { label: "Scan analytics", value: "City · device · OS · browser" },
              { label: "Developer-ready", value: "REST API + webhook events" },
            ].map((point) => (
              <div key={point.label} className="glass-card rounded-xl px-4 py-4 border border-zinc-800">
                <div className="text-zinc-200 font-semibold text-sm">{point.label}</div>
                <div className="text-zinc-500 text-xs mt-1">{point.value}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────────────── */}
        {/* Deliverable 10 fix: QR Tiger has a "How it works" section; we didn't */}
        <section className="mt-24">
          <div className="text-center mb-14">
            <span className="section-header">
              <ScanLine size={14} />
              How it works
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-white mt-4 mb-3">
              From idea to live QR code{" "}
              <span className="gradient-text">in under two minutes</span>
            </h2>
            <p className="text-zinc-400 max-w-xl mx-auto">
              No account needed to try. No credit card required. Your first QR code is
              ready before your coffee gets cold.
            </p>
          </div>

          <div className="relative">
            {/* Desktop connecting line */}
            <div className="hidden md:block absolute top-[52px] left-[16.66%] right-[16.66%] h-px bg-gradient-to-r from-violet-500/40 via-blue-500/40 to-emerald-500/40 z-0" />
            <div className="grid md:grid-cols-3 gap-6 md:gap-8 relative z-10">
              {howItWorks.map((step, i) => (
                <div
                  key={step.step}
                  className="flex flex-col items-center text-center animate-fade-in"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className="relative mb-6">
                    <div className={cn("absolute inset-0 rounded-2xl blur-xl opacity-30 scale-110", step.bg)} />
                    <div className={cn(
                      "relative w-[104px] h-[104px] rounded-2xl border-2 flex flex-col items-center justify-center gap-1 shadow-lg",
                      step.bg,
                      step.color,
                    )}>
                      <div className="opacity-80">{step.icon}</div>
                      <span className="text-[10px] font-black uppercase tracking-widest opacity-60">
                        Step {step.step}
                      </span>
                    </div>
                  </div>
                  <h3 className="text-white font-bold text-base mb-2">{step.title}</h3>
                  <p className="text-zinc-400 text-sm leading-relaxed max-w-xs">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="text-center mt-10">
            <Link to="/generate">
              <Button variant="outline" size="lg">
                Try it now — no account needed
                <ArrowRight size={15} />
              </Button>
            </Link>
          </div>
        </section>

        {/* ── Feature cards ────────────────────────────────────────────────── */}
        {/* Deliverable 4: Full benefit-led copy rewrite of all 8 feature cards */}
        {/* Deliverable 9: Internal links added to each relevant feature card */}
        <section className="mt-24">
          <div className="text-center mb-14">
            <span className="section-header">
              <Rocket size={14} />
              Full feature set
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-white mt-4 mb-3">
              Everything in one place.{" "}
              <span className="gradient-text">Nothing held back.</span>
            </h2>
            <p className="text-zinc-400 max-w-xl mx-auto">
              Every feature below ships on a plan that costs less than a restaurant lunch —
              starting at{" "}
              <Link to="/pricing" className="text-violet-400 hover:text-violet-300 underline underline-offset-2">
                ₹299/month
              </Link>
              .
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {features.map((feature, i) => (
              <Card
                key={feature.title}
                className="p-6 card-hover animate-fade-in"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <CardContent className="p-0">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0 border border-zinc-700">
                      {feature.icon}
                    </div>
                    <div className="flex-1">
                      <div className="text-[11px] text-violet-400 font-semibold uppercase tracking-wider mb-1">
                        {feature.category}
                      </div>
                      <h3 className="text-white font-bold text-base mb-2">{feature.title}</h3>
                      <p className="text-zinc-400 text-sm leading-relaxed mb-4">{feature.desc}</p>
                      <ul className="grid sm:grid-cols-2 gap-x-5 gap-y-2 mb-4">
                        {feature.items.map((item) => (
                          <li key={item} className="flex items-center gap-2 text-zinc-300 text-sm">
                            <Check size={14} className="text-violet-400 shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                      {feature.link && (
                        <Link
                          to={feature.link.to}
                          className="text-violet-400 hover:text-violet-300 text-xs font-semibold underline underline-offset-2"
                        >
                          {feature.link.label}
                        </Link>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────────────── */}
        {/* Deliverable 7: 5-question FAQ targeting Cluster D featured snippets */}
        <section className="mt-24 max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <span className="section-header">
              <Rocket size={14} />
              Common questions
            </span>
            <h2 className="text-3xl font-bold text-white mt-4 mb-3">
              Questions about{" "}
              <span className="gradient-text">GenXQR features</span>
            </h2>
          </div>
          <div className="flex flex-col gap-3">
            {faqs.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────────────────────── */}
        <section className="mt-20">
          <div className="glass-card rounded-2xl p-8 md:p-10 border border-zinc-800 text-center relative overflow-hidden">
            {/* Subtle radial glow */}
            <div className="absolute inset-0 bg-gradient-to-b from-violet-600/10 via-transparent to-transparent pointer-events-none" />
            <div className="relative">
              <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
                Your first QR code is ready{" "}
                <span className="gradient-text">in 60 seconds</span>
              </h2>
              <p className="text-zinc-400 max-w-xl mx-auto mb-3">
                Start on the free plan. Create, style, and publish your first QR code without
                a credit card. Upgrade only when you need more codes or deeper analytics.
              </p>
              <p className="text-zinc-600 text-xs mb-8">
                No credit card · Cancel any time · UPI accepted · Data export on all plans
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/generate">
                  <Button size="xl" variant="glow">
                    Create My First QR Code — Free
                    <ArrowRight size={16} />
                  </Button>
                </Link>
                <Link to="/pricing">
                  <Button size="xl" variant="secondary">Compare all plans</Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  )
}
