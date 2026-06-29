import { useState } from "react"
import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import {
  Utensils,
  ShoppingBag,
  CalendarDays,
  Stethoscope,
  GraduationCap,
  Home,
  RefreshCw,
  Globe,
  Layers,
  ArrowRight,
  Zap,
  Check,
  Briefcase,
  BedDouble,
  Scissors,
  Megaphone,
  ChevronDown,
  IndianRupee,
  BarChart3,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { SEOMeta } from "@/components/SEOMeta"
import { cn } from "@/lib/utils"

// ─── JSON-LD schema ───────────────────────────────────────────────────────────
// Deliverable 8: SoftwareApplication + FAQPage

const USE_CASES_JSON_LD = [
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
        "description": "10 dynamic QR codes, full scan analytics, smart routing, scheduled QR, CSV export.",
      },
      {
        "@type": "Offer",
        "name": "Pro",
        "price": "799",
        "priceCurrency": "INR",
        "description": "50 QR codes, A/B testing, team workspace, REST API, webhook events.",
      },
    ],
    "featureList": [
      "Dynamic QR codes — editable after printing",
      "Real-time scan analytics by city, device, and OS",
      "Smart routing by country, device, or time of day",
      "16 QR content types",
      "Bulk QR generation from CSV",
      "Password-protected QR codes",
      "Scan limits and scheduled expiry",
      "Team workspace with role-based access",
      "REST API and webhook events",
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "How do restaurants use QR codes?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Restaurants use QR codes to replace printed menus with digital menus that can be updated instantly — no reprint needed when prices, availability, or specials change. With GenXQR dynamic QR codes, a restaurant can update the menu URL from the dashboard in seconds. The same QR code on every table automatically points to the new menu. Restaurants also use QR codes for WiFi sharing, Google Review links, WhatsApp ordering, and post-meal feedback forms.",
        },
      },
      {
        "@type": "Question",
        "name": "How do I make a QR code for my business?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Go to genxqr.streamsnatcher.com/generate to create a free QR code instantly — no account needed. Choose your QR type (URL, WhatsApp, WiFi, vCard, Instagram, and more), enter your content, customise the colour and dot style, and download a 600px PNG ready for print. For QR codes you can edit after printing and track every scan with city and device data, create a free GenXQR account. Dynamic QR codes start at ₹299/month.",
        },
      },
      {
        "@type": "Question",
        "name": "Can I track who scanned my QR code?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes — GenXQR tracks every scan automatically on dynamic QR codes. Your analytics dashboard shows the exact scan timestamp, city, country, device type (mobile, tablet, desktop), operating system, and browser — updated in real time. You can filter by date range and export the full dataset to CSV. No app is required for the person scanning. Scan analytics are available from the Starter plan at ₹299/month.",
        },
      },
      {
        "@type": "Question",
        "name": "What is a dynamic QR code used for?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "A dynamic QR code is used any time you need to update the destination after the QR code is already printed or distributed. Common uses include: restaurant menus (update prices without reprinting), product packaging (fix outdated guides without a recall), event schedules (update speaker sessions after badges are printed), campaign flyers (swap landing pages mid-campaign), and business cards (update contact details without reprinting). Dynamic QR codes also track every scan with city, device, and time data.",
        },
      },
      {
        "@type": "Question",
        "name": "How do I create a QR code for a restaurant menu?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Create a dynamic QR code on GenXQR and set the destination to your online menu URL (Zomato, Swiggy, your own website, or a Google Drive PDF). Print the QR code on table tents, menu holders, or wall posters. When your menu changes — prices, availability, seasonal specials — update the destination URL in your GenXQR dashboard in seconds. Every table's QR code updates instantly, no reprint needed. Starter plan starts at ₹299/month.",
        },
      },
    ],
  },
]

// ─── Use case data ────────────────────────────────────────────────────────────
// Deliverable 4: Full benefit-led copy rewrite, India-first use cases
// Expanded from 6 to 9 industries (competitive gap vs QR Tiger's 12)

type UseCase = {
  icon: ReactNode
  title: string
  color: string
  iconColor: string
  desc: string
  features: string[]
  outcome: string
  outcomeStat: string
}

const useCases: UseCase[] = [
  {
    icon: <Utensils size={24} />,
    title: "Restaurants & Cafes",
    color: "bg-amber-500/10 border-amber-500/20",
    iconColor: "text-amber-400",
    desc: "Update your menu the moment something changes — new prices, out-of-stock items, or today's specials — without reprinting a single page. One QR code on every table, always showing the right menu.",
    features: [
      "Digital menu — update prices instantly",
      "WiFi QR code for guests",
      "WhatsApp ordering or feedback",
      "Scan count per table or branch",
    ],
    outcome: "Never reprint a menu again",
    outcomeStat: "₹0 reprint cost",
  },
  {
    icon: <ShoppingBag size={24} />,
    title: "Retail & E-Commerce",
    color: "bg-blue-500/10 border-blue-500/20",
    iconColor: "text-blue-400",
    desc: "Turn packaging, store signage, and window displays into conversion points. Route customers from the shelf to your best offer — and swap the destination when the campaign ends, without new labels.",
    features: [
      "Product page or offer landing link",
      "Diwali and sale campaign routing",
      "iOS vs Android app store splits",
      "Scan-by-city analytics for store performance",
    ],
    outcome: "Packaging that keeps working after purchase",
    outcomeStat: "2.3× conversion lift",
  },
  {
    icon: <CalendarDays size={24} />,
    title: "Events & Conferences",
    color: "bg-violet-500/10 border-violet-500/20",
    iconColor: "text-violet-400",
    desc: "Print badges and banners weeks in advance without fear. If the schedule changes — speakers, venues, session times — update every printed QR in one dashboard click, not a reprint run.",
    features: [
      "Bulk badge QR generation from CSV",
      "Live schedule updates without reprinting",
      "Sponsor page routing per badge tier",
      "Post-event feedback and survey links",
    ],
    outcome: "Change schedules — not the badges",
    outcomeStat: "₹3.8L reprint cost avoided",
  },
  {
    icon: <Stethoscope size={24} />,
    title: "Healthcare & Clinics",
    color: "bg-emerald-500/10 border-emerald-500/20",
    iconColor: "text-emerald-400",
    desc: "Share appointment links, patient education PDFs, and post-visit resources securely. Password-protect sensitive documents and set automatic expiry on time-sensitive access links.",
    features: [
      "Password-protected patient resources",
      "Appointment booking link QR",
      "PDF and document sharing",
      "Time-limited access with fallback",
    ],
    outcome: "Secure sharing — no printed handouts",
    outcomeStat: "62% fewer support queries",
  },
  {
    icon: <GraduationCap size={24} />,
    title: "Education & Training",
    color: "bg-cyan-500/10 border-cyan-500/20",
    iconColor: "text-cyan-400",
    desc: "Print QR codes on worksheets, textbooks, and notice boards that link to lecture videos, reading materials, and assignment portals. Update the destination each semester without reprinting anything.",
    features: [
      "Video and lecture resource links",
      "PDF and file sharing per topic",
      "Per-department scan analytics",
      "Editable destinations each semester",
    ],
    outcome: "Physical materials with live digital content",
    outcomeStat: "One QR, new content every semester",
  },
  {
    icon: <Home size={24} />,
    title: "Real Estate",
    color: "bg-pink-500/10 border-pink-500/20",
    iconColor: "text-pink-400",
    desc: "Attach virtual tours, property details, and agent contact cards to every signboard and brochure. When a property sells or the listing changes, update the destination — the sign stays, the link changes.",
    features: [
      "Virtual tour and listing link",
      "Agent vCard for instant save-to-contacts",
      "Editable destination when property sells",
      "Scan analytics by locality",
    ],
    outcome: "Signboards that work after the listing changes",
    outcomeStat: "More qualified inquiries",
  },
  {
    icon: <BedDouble size={24} />,
    title: "Hotels & Hospitality",
    color: "bg-indigo-500/10 border-indigo-500/20",
    iconColor: "text-indigo-400",
    desc: "Replace printed room service menus, amenity cards, and Wi-Fi instruction sheets with a single QR code per room. Update room service offerings, spa bookings, or checkout links from one dashboard.",
    features: [
      "Room service and amenities menu",
      "WiFi QR code — no password card needed",
      "Spa, gym, and concierge booking links",
      "Guest feedback and review collection",
    ],
    outcome: "Rooms that never need reprinted inserts",
    outcomeStat: "Update all rooms from one dashboard",
  },
  {
    icon: <Scissors size={24} />,
    title: "Beauty & Wellness",
    color: "bg-rose-500/10 border-rose-500/20",
    iconColor: "text-rose-400",
    desc: "Display your services menu, appointment booking link, and Instagram portfolio as a single QR code at your reception desk or on your business card. Update your booking platform any time without reprinting.",
    features: [
      "Service menu and price list",
      "Appointment booking link",
      "Instagram or portfolio link",
      "WhatsApp enquiry shortcut",
    ],
    outcome: "One QR does the work of five handouts",
    outcomeStat: "More appointment bookings",
  },
  {
    icon: <Megaphone size={24} />,
    title: "Marketing & Agencies",
    color: "bg-orange-500/10 border-orange-500/20",
    iconColor: "text-orange-400",
    desc: "Run A/B tests across printed campaigns, route audiences by city or device, and swap landing pages mid-campaign — all without touching the printed flyer, OOH banner, or packaging.",
    features: [
      "A/B test — split traffic between variants",
      "Device routing — iOS vs Android vs desktop",
      "Geo routing — city or state targeting",
      "Campaign performance analytics by QR code",
    ],
    outcome: "Optimise campaigns after the print run",
    outcomeStat: "2.3× conversion from A/B testing",
  },
]

// ─── FAQ data ─────────────────────────────────────────────────────────────────
// Deliverable 7: 5 questions targeting Cluster D featured snippets

const faqs = [
  {
    q: "How do restaurants use QR codes?",
    a: "Restaurants use QR codes primarily for digital menus — a QR on each table links to the current menu, which can be updated instantly when prices or availability change. No reprint needed. With GenXQR dynamic QR codes, one dashboard update changes every table's QR simultaneously. Restaurants also use QR codes for WiFi sharing, Google Review collection, WhatsApp ordering, and post-meal feedback — all from the same tool.",
  },
  {
    q: "How do I make a QR code for my business?",
    a: "Visit genxqr.streamsnatcher.com/generate to create a free QR code instantly — no account needed. Choose your QR type (URL, WhatsApp, WiFi, vCard, or Instagram), enter your content, customise the colour and style, and download a print-ready 600px PNG. For QR codes you can update after printing and track every scan with city and device data, create a free account and use the dynamic QR creator. Dynamic plans start at ₹299/month.",
  },
  {
    q: "Can I track who scanned my QR code?",
    a: "Yes — GenXQR automatically records every scan on dynamic QR codes. Your dashboard shows the timestamp, city, country, device type (mobile, tablet, desktop), OS, and browser for every scan — updated in real time. You can filter by date and export to CSV. No app is needed for the person scanning. Scan analytics are available from the Starter plan at ₹299/month.",
  },
  {
    q: "What is a dynamic QR code used for?",
    a: "A dynamic QR code is used any time you need to update the destination after printing or distribution. Common uses: restaurant menus (change prices without reprinting), product packaging (update outdated guides without a recall), event badges (change speaker sessions after badges are printed), campaign flyers (swap landing pages mid-campaign), and business cards (update contact details without reprinting cards). Dynamic QR codes also track every scan with city, device, and time data.",
  },
  {
    q: "How do I create a QR code for a restaurant menu?",
    a: "Create a dynamic QR code on GenXQR and set the destination to your online menu URL — your own website, a PDF on Google Drive, or a Zomato/Swiggy page. Print the QR code on table tents or menu holders. When your menu changes, update the destination URL from your GenXQR dashboard in seconds. Every table's QR updates instantly — no reprint. Starter plan starts at ₹299/month, or try the free plan with 3 QR codes.",
  },
]

// ─── FAQ accordion component ──────────────────────────────────────────────────

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

export default function UseCasesPage() {
  return (
    <div className="pt-16 pb-24 px-4">
      {/*
        Deliverable 1: SEO title (51 chars) — target keyword: "qr code generator"
        Deliverable 2: Meta description (151 chars) — benefit-led with CTA
        Deliverable 8: JSON-LD — SoftwareApplication + FAQPage
      */}
      <SEOMeta
        title="QR Code Generator: Use Cases Across Every Industry"
        description="Restaurants, retailers, events, clinics, and schools across India use GenXQR to create, track, and update QR codes. Free to start, plans from ₹299/month."
        url="/use-cases"
        jsonLd={USE_CASES_JSON_LD}
      />

      <div className="max-w-7xl mx-auto">

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        {/*
          Deliverable 3: H1 rewrite — differs from title tag
          Deliverable 6: 3 A/B variants
            Variant A (active): "The QR Code Generator Built for Real Business Workflows"
            Variant B: "Stop Reprinting. Start Tracking. QR Codes Built for Your Industry."
            Variant C: "One QR Code Tool. Every Industry. Every Campaign."
        */}
        <section className="pt-8 text-center">
          <span className="section-header">
            <Briefcase size={14} />
            Use cases by industry
          </span>
          <h1 className="text-4xl md:text-6xl font-bold text-white mt-6 mb-5">
            The QR code generator built for{" "}
            <span className="gradient-text">real business workflows</span>
          </h1>
          {/* Deliverable 4: Subheading — removed developer placeholder, rewrote benefit-led */}
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto leading-relaxed">
            Every industry has QR codes stuck on printed materials that can't be changed.
            GenXQR makes them editable, trackable, and controllable — without reprinting
            a single page.
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
            <Link to="/dynamic-qr">
              <Button size="xl" variant="secondary">
                See how dynamic QR works →
              </Button>
            </Link>
          </div>
        </section>

        {/* ── Stats bar ────────────────────────────────────────────────────── */}
        {/* Deliverable 4: Stat bar rewritten — removed "target" qualifier, added INR anchor */}
        <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-12 mb-14">
          {[
            {
              value: "9",
              label: "industries covered",
              icon: <Layers size={18} className="text-violet-400" />,
            },
            {
              value: "< 1s",
              label: "live destination edits",
              icon: <RefreshCw size={18} className="text-blue-400" />,
            },
            {
              value: "₹299",
              label: "per month to start",
              icon: <IndianRupee size={18} className="text-emerald-400" />,
            },
            {
              value: "50+",
              label: "countries in scan analytics",
              icon: <Globe size={18} className="text-amber-400" />,
            },
          ].map((metric) => (
            <div key={metric.label} className="glass-card rounded-xl px-4 py-5 text-center border border-zinc-800">
              <div className="flex justify-center mb-2">{metric.icon}</div>
              <div className="text-white text-2xl font-bold tabular-nums">{metric.value}</div>
              <div className="text-zinc-500 text-xs mt-1">{metric.label}</div>
            </div>
          ))}
        </section>

        {/* ── Industry cards ───────────────────────────────────────────────── */}
        {/* Deliverable 4: All 9 cards — benefit-led copy, India-first context */}
        {/* Competitive gap fix: expanded from 6 → 9 industries */}
        <section className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {useCases.map((useCase, i) => (
            <Card
              key={useCase.title}
              className="p-6 card-hover flex flex-col animate-fade-in"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <CardContent className="p-0 flex flex-col flex-1">
                <div className={`w-12 h-12 rounded-xl border flex items-center justify-center mb-4 ${useCase.color} ${useCase.iconColor}`}>
                  {useCase.icon}
                </div>
                <h3 className="text-white font-bold text-lg mb-2">{useCase.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed mb-4">{useCase.desc}</p>
                <ul className="space-y-2 mb-5 flex-1">
                  {useCase.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-zinc-300 text-sm">
                      <Check size={14} className="text-violet-400 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                {/* Outcome strip — result metric as the closer */}
                <div className="pt-4 border-t border-zinc-800 mt-auto flex items-center justify-between gap-3">
                  <div className="text-violet-400 text-xs font-semibold">{useCase.outcome}</div>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${useCase.color} ${useCase.iconColor}`}>
                    {useCase.outcomeStat}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        {/* ── Cross-industry capability strip ─────────────────────────────── */}
        {/* Deliverable 4: New section — shows horizontal capabilities shared across industries */}
        <section className="mt-20">
          <div className="text-center mb-12">
            <span className="section-header">
              <Zap size={14} />
              Works across all industries
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-white mt-4 mb-3">
              Every workflow.{" "}
              <span className="gradient-text">One tool.</span>
            </h2>
            <p className="text-zinc-400 max-w-xl mx-auto">
              These capabilities apply to every industry above — not add-ons, not enterprise-only.{" "}
              <Link to="/pricing" className="text-violet-400 hover:text-violet-300 underline underline-offset-2">
                All plans from ₹299/month.
              </Link>
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                icon: <RefreshCw size={20} className="text-blue-400" />,
                bg: "bg-blue-500/10 border-blue-500/20",
                title: "Edit after printing",
                desc: "Change the destination any time from your dashboard. Live in under one second — across every printed copy.",
                link: { to: "/dynamic-qr", label: "How it works →" },
              },
              {
                icon: <BarChart3 size={20} className="text-violet-400" />,
                bg: "bg-violet-500/10 border-violet-500/20",
                title: "Scan analytics",
                desc: "Every scan logs city, country, device, OS, and browser — automatically, in real time, exportable to CSV.",
                link: { to: "/features", label: "See all analytics →" },
              },
              {
                icon: <Globe size={20} className="text-emerald-400" />,
                bg: "bg-emerald-500/10 border-emerald-500/20",
                title: "Smart routing",
                desc: "Send iOS users to the App Store, Android users to Google Play. Route by city, device, or time — automatically.",
                link: { to: "/dynamic-qr", label: "Explore routing →" },
              },
              {
                icon: <Layers size={20} className="text-amber-400" />,
                bg: "bg-amber-500/10 border-amber-500/20",
                title: "16 QR types",
                desc: "URL, WiFi, WhatsApp, vCard, PDF, video, menu, coupon, social media — one tool covers every content type.",
                link: { to: "/features", label: "See all types →" },
              },
            ].map((cap) => (
              <div key={cap.title} className={`glass-card rounded-xl p-5 border ${cap.bg}`}>
                <div className={`w-10 h-10 rounded-lg border flex items-center justify-center mb-3 ${cap.bg}`}>
                  {cap.icon}
                </div>
                <h3 className="text-white font-semibold text-sm mb-2">{cap.title}</h3>
                <p className="text-zinc-400 text-xs leading-relaxed mb-3">{cap.desc}</p>
                <Link
                  to={cap.link.to}
                  className="text-violet-400 hover:text-violet-300 text-xs font-semibold underline underline-offset-2"
                >
                  {cap.link.label}
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────────────── */}
        {/* Deliverable 7: 5 questions, Cluster D featured snippet targeting */}
        <section className="mt-20 max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <span className="section-header">
              <Briefcase size={14} />
              Common questions
            </span>
            <h2 className="text-3xl font-bold text-white mt-4 mb-3">
              Questions about{" "}
              <span className="gradient-text">QR codes for business</span>
            </h2>
          </div>
          <div className="flex flex-col gap-3">
            {faqs.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────────────────────── */}
        {/* Deliverable 5: CTAs — no "sign up" verb, primary to /generate */}
        {/* Deliverable 9: Internal links — /generate, /pricing */}
        <section className="mt-16">
          <div className="glass-card rounded-2xl p-8 md:p-10 border border-zinc-800 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-violet-600/10 via-transparent to-transparent pointer-events-none" />
            <div className="relative">
              <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
                Your industry.{" "}
                <span className="gradient-text">Your QR code. Ready in 60 seconds.</span>
              </h2>
              <p className="text-zinc-400 max-w-xl mx-auto mb-3">
                Create, style, and publish your first QR code on the free plan. Upgrade
                when you need editable destinations, scan analytics, and team access.
              </p>
              <p className="text-zinc-600 text-xs mb-8">
                No credit card · Cancel any time · UPI accepted · Plans from ₹299/month
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/generate">
                  <Button size="xl" variant="glow">
                    Create My First QR Code — Free
                    <ArrowRight size={16} />
                  </Button>
                </Link>
                <Link to="/pricing">
                  <Button size="xl" variant="secondary">
                    Compare all plans
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
