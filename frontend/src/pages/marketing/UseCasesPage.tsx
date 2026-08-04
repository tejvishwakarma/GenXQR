import type { ComponentType } from "react"
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
  Check,
  BedDouble,
  Scissors,
  Megaphone,
  IndianRupee,
  BarChart3,
} from "lucide-react"
import { SEOMeta } from "@/components/SEOMeta"
import { MktContainer, SectionHead, Reveal, MktCard, MktButton, IconTile, type IconTint } from "@/components/marketing/ui"
import { PageHero } from "@/components/marketing/PageHero"
import { FaqAccordion } from "@/components/marketing/FaqAccordion"

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
        "description": "Static QR codes. No credit card required.",
      },
      {
        "@type": "Offer",
        "name": "Starter",
        "price": "299",
        "priceCurrency": "INR",
        "description": "50 dynamic QR codes, full scan analytics, scheduled QR, CSV export.",
      },
      {
        "@type": "Offer",
        "name": "Pro",
        "price": "799",
        "priceCurrency": "INR",
        "description": "250 QR codes, A/B testing, smart routing, team seats, REST API, webhook events.",
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
// NOTE: `color`/`iconColor` from the pre-redesign version were literal
// zinc/violet-style Tailwind classes tied to the old dark-only theme. They are
// replaced 1:1 below with `tint` — the closest matching IconTile tint — so the
// visual accent per industry is unchanged, just rendered through the new
// theme-aware design-system component instead of hardcoded color classes.

type UseCase = {
  icon: ComponentType<{ size?: number; className?: string }>
  title: string
  tint: IconTint
  desc: string
  features: string[]
  outcome: string
  outcomeStat: string
}

const useCases: UseCase[] = [
  {
    icon: Utensils,
    title: "Restaurants & Cafes",
    tint: "amber",
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
    icon: ShoppingBag,
    title: "Retail & E-Commerce",
    tint: "blue",
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
    icon: CalendarDays,
    title: "Events & Conferences",
    tint: "violet",
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
    icon: Stethoscope,
    title: "Healthcare & Clinics",
    tint: "emerald",
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
    icon: GraduationCap,
    title: "Education & Training",
    tint: "cyan",
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
    icon: Home,
    title: "Real Estate",
    tint: "pink",
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
    icon: BedDouble,
    title: "Hotels & Hospitality",
    tint: "indigo",
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
    icon: Scissors,
    title: "Beauty & Wellness",
    tint: "rose",
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
    icon: Megaphone,
    title: "Marketing & Agencies",
    tint: "orange",
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

// ─── Stat bar data ─────────────────────────────────────────────────────────────
// Deliverable 4: Stat bar — removed "target" qualifier, added INR anchor

const stats: { value: string; label: string; icon: ComponentType<{ size?: number; className?: string }>; tint: IconTint }[] = [
  { value: "9", label: "industries covered", icon: Layers, tint: "violet" },
  { value: "< 1s", label: "live destination edits", icon: RefreshCw, tint: "blue" },
  { value: "₹299", label: "per month to start", icon: IndianRupee, tint: "emerald" },
  { value: "50+", label: "countries in scan analytics", icon: Globe, tint: "amber" },
]

// ─── Cross-industry capability data ───────────────────────────────────────────

const capabilities: { icon: ComponentType<{ size?: number; className?: string }>; tint: IconTint; title: string; desc: string; link: { to: string; label: string } }[] = [
  {
    icon: RefreshCw,
    tint: "blue",
    title: "Edit after printing",
    desc: "Change the destination any time from your dashboard. Live in under one second — across every printed copy.",
    link: { to: "/dynamic-qr", label: "How it works →" },
  },
  {
    icon: BarChart3,
    tint: "violet",
    title: "Scan analytics",
    desc: "Every scan logs city, country, device, OS, and browser — automatically, in real time, exportable to CSV.",
    link: { to: "/features", label: "See all analytics →" },
  },
  {
    icon: Globe,
    tint: "emerald",
    title: "Smart routing",
    desc: "Send iOS users to the App Store, Android users to Google Play. Route by city, device, or time — automatically.",
    link: { to: "/dynamic-qr", label: "Explore routing →" },
  },
  {
    icon: Layers,
    tint: "amber",
    title: "16 QR types",
    desc: "URL, WiFi, WhatsApp, vCard, PDF, video, menu, coupon, social media — one tool covers every content type.",
    link: { to: "/features", label: "See all types →" },
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
    a: "Create a dynamic QR code on GenXQR and set the destination to your online menu URL — your own website, a PDF on Google Drive, or a Zomato/Swiggy page. Print the QR code on table tents or menu holders. When your menu changes, update the destination URL from your GenXQR dashboard in seconds. Every table's QR updates instantly — no reprint. Starter plan starts at ₹299/month, or try the free static QR generator first.",
  },
]

// ─── Page component ───────────────────────────────────────────────────────────

export default function UseCasesPage() {
  return (
    <div className="bg-paper">
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

      {/* ── Hero + stat bar ───────────────────────────────────────────────── */}
      {/*
        Deliverable 3: H1 rewrite — differs from title tag
        Deliverable 6: 3 A/B variants
          Variant A (active): "The QR Code Generator Built for Real Business Workflows"
          Variant B: "Stop Reprinting. Start Tracking. QR Codes Built for Your Industry."
          Variant C: "One QR Code Tool. Every Industry. Every Campaign."
      */}
      <PageHero
        eyebrow="Use cases by industry"
        title={
          <>
            The QR code generator built for{" "}
            <span className="text-accent">real business workflows</span>
          </>
        }
        intro="Every industry has QR codes stuck on printed materials that can't be changed. GenXQR makes them editable, trackable, and controllable — without reprinting a single page."
        actions={
          <>
            <MktButton href="/generate" variant="accent" size="lg">
              Create Your First QR Code — Free
              <ArrowRight size={16} />
            </MktButton>
            <MktButton href="/dynamic-qr" variant="outline" size="lg">
              See how dynamic QR works →
            </MktButton>
          </>
        }
      >
        {/* Deliverable 4: Stat bar — removed "target" qualifier, added INR anchor */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((metric) => (
            <div key={metric.label} className="rounded-2xl border border-line bg-paper-pure px-4 py-6 text-center">
              <div className="flex justify-center mb-3">
                <IconTile icon={metric.icon} tint={metric.tint} size="sm" />
              </div>
              <div className="font-mono text-2xl font-semibold text-ink tracking-tight">{metric.value}</div>
              <div className="mt-1 text-xs text-ink-faint">{metric.label}</div>
            </div>
          ))}
        </div>
      </PageHero>

      {/* ── Industry cards ───────────────────────────────────────────────── */}
      {/* Deliverable 4: All 9 cards — benefit-led copy, India-first context */}
      {/* Competitive gap fix: expanded from 6 → 9 industries */}
      <section className="py-16 md:py-20 bg-paper">
        <MktContainer>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {useCases.map((useCase, i) => (
              <Reveal key={useCase.title} delay={i * 60}>
                <MktCard className="flex flex-col h-full">
                  <IconTile icon={useCase.icon} tint={useCase.tint} />
                  <h3 className="mt-4 text-lg font-bold font-display text-ink">{useCase.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">{useCase.desc}</p>
                  <ul className="mt-4 space-y-2 flex-1">
                    {useCase.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm text-ink">
                        <Check size={14} className="text-live shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  {/* Outcome strip — result metric as the closer */}
                  <div className="mt-5 pt-4 border-t border-line flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold text-accent">{useCase.outcome}</div>
                    <span className="shrink-0 font-mono text-[11px] font-semibold px-2.5 py-1 rounded-full border border-line bg-ink/[0.03] text-ink-soft">
                      {useCase.outcomeStat}
                    </span>
                  </div>
                </MktCard>
              </Reveal>
            ))}
          </div>
        </MktContainer>
      </section>

      {/* ── Cross-industry capability strip ─────────────────────────────── */}
      {/* Deliverable 4: Shows horizontal capabilities shared across industries */}
      <section className="py-20 md:py-24 bg-paper-pure border-y border-line">
        <MktContainer>
          <SectionHead
            eyebrow="Works across all industries"
            title={
              <>
                Every workflow. <span className="text-accent">One tool.</span>
              </>
            }
            intro={
              <>
                These capabilities apply to every industry above — not add-ons, not enterprise-only.{" "}
                <Link to="/pricing" className="text-accent underline underline-offset-2 hover:text-accent-ink">
                  All plans from ₹299/month.
                </Link>
              </>
            }
            align="center"
          />
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {capabilities.map((cap) => (
              <div key={cap.title} className="rounded-2xl border border-line bg-paper p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift hover:border-ink/10">
                <IconTile icon={cap.icon} tint={cap.tint} size="sm" />
                <h3 className="mt-4 text-sm font-semibold text-ink">{cap.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-ink-soft">{cap.desc}</p>
                <Link
                  to={cap.link.to}
                  className="mt-3 inline-block text-xs font-semibold text-accent underline underline-offset-2 hover:text-accent-ink"
                >
                  {cap.link.label}
                </Link>
              </div>
            ))}
          </div>
        </MktContainer>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      {/* Deliverable 7: 5 questions, Cluster D featured snippet targeting */}
      <section className="py-20 md:py-28 bg-paper">
        <MktContainer className="max-w-3xl">
          <SectionHead
            eyebrow="Common questions"
            title={
              <>
                Questions about <span className="text-accent">QR codes for business</span>
              </>
            }
            align="center"
          />
          <div className="mt-10">
            <FaqAccordion items={faqs} />
          </div>
        </MktContainer>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      {/* Deliverable 5: CTAs — no "sign up" verb, primary to /generate */}
      {/* Deliverable 9: Internal links — /generate, /pricing */}
      <section className="py-20 md:py-24 bg-paper-pure border-y border-line">
        <MktContainer>
          <Reveal className="rounded-[32px] border border-line bg-paper p-8 md:p-14 text-center">
            <h2 className="mx-auto max-w-2xl text-2xl md:text-4xl font-bold font-display tracking-tightest leading-[1.1] text-ink">
              Your industry. <span className="text-accent">Your QR code. Ready in 60 seconds.</span>
            </h2>
            <p className="mt-4 mx-auto max-w-xl text-ink-soft">
              Create, style, and publish your first QR code on the free plan. Upgrade
              when you need editable destinations, scan analytics, and team access.
            </p>
            <p className="mt-3 text-xs text-ink-faint">
              No credit card · Cancel any time · UPI accepted · Plans from ₹299/month
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
              <MktButton href="/generate" variant="accent" size="lg">
                Create My First QR Code — Free
                <ArrowRight size={16} />
              </MktButton>
              <MktButton href="/pricing" variant="outline" size="lg">
                Compare all plans
              </MktButton>
            </div>
          </Reveal>
        </MktContainer>
      </section>
    </div>
  )
}
