import type { ComponentType } from "react"
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
  ScanLine,
  Pencil,
  MousePointerClick,
} from "lucide-react"
import { SEOMeta } from "@/components/SEOMeta"
import { MktContainer, SectionHead, MktButton, MktCard, IconTile, FinderGlyph, Reveal, type IconTint } from "@/components/marketing/ui"
import { PageHero } from "@/components/marketing/PageHero"
import { FaqAccordion } from "@/components/marketing/FaqAccordion"

// ─── JSON-LD schema ────────────────────────────────────────────────────────────
// Deliverable 8: SoftwareApplication + FAQPage

const FEATURES_JSON_LD = [
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "GenXQR",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web",
    "url": "https://genxqr.com",
    "offers": [
      {
        "@type": "Offer",
        "name": "Free Plan",
        "price": "0",
        "priceCurrency": "INR",
        "description": "Static QR codes — URL, WiFi, WhatsApp, Instagram. No account needed.",
      },
      {
        "@type": "Offer",
        "name": "Starter",
        "price": "299",
        "priceCurrency": "INR",
        "description": "50 dynamic QR codes, full analytics, scheduled expiry, CSV export.",
      },
      {
        "@type": "Offer",
        "name": "Pro",
        "price": "799",
        "priceCurrency": "INR",
        "description": "250 QR codes, A/B testing, smart routing, team seats, REST API, webhook events.",
      },
      {
        "@type": "Offer",
        "name": "Business",
        "price": "2499",
        "priceCurrency": "INR",
        "description": "2,000 QR codes, white-label, priority support, bulk generation.",
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
          "text": "Yes. GenXQR's free plan lets you create static QR codes — no credit card, no account needed. Paid plans start at ₹299/month (Starter) and add dynamic QR codes you can edit after printing, full scan analytics, CSV export, and — from the Pro plan — smart routing and team seats.",
        },
      },
    ],
  },
]

// ─── Feature card data ────────────────────────────────────────────────────────
// Deliverable 4: benefit-led rewrites of all 8 feature cards

type Feature = {
  category: string
  icon: ComponentType<{ size?: number; className?: string }>
  tint: IconTint
  title: string
  desc: string
  items: string[]
  link?: { to: string; label: string }
}

const features: Feature[] = [
  {
    category: "Analytics",
    icon: BarChart3,
    tint: "violet",
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
    icon: RefreshCw,
    tint: "blue",
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
    icon: Globe,
    tint: "emerald",
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
    icon: Layers,
    tint: "amber",
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
    icon: Shield,
    tint: "red",
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
    icon: Users,
    tint: "purple",
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
    icon: Code,
    tint: "cyan",
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
    icon: Zap,
    tint: "violet",
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
    icon: ScanLine,
    tint: "violet" as IconTint,
    title: "Pick a QR type and add your content",
    desc: "Choose from 16 content types — URL, PDF, vCard, menu, WiFi, and more. Paste your link or fill in the form. Done in under a minute.",
  },
  {
    step: "2",
    icon: Pencil,
    tint: "blue" as IconTint,
    title: "Style it and download",
    desc: "Customise dot style, colours, corner shapes, and add your logo. Download as PNG for print or SVG for vectors — ready for any material.",
  },
  {
    step: "3",
    icon: MousePointerClick,
    tint: "emerald" as IconTint,
    title: "Track every scan in real time",
    desc: "From the moment the first person scans, your dashboard fills with data: city, device, time, OS. Change the destination any time without reprinting.",
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
    a: "Yes. GenXQR's free plan lets you create static QR codes instantly — no credit card, no account needed. Paid plans start at ₹299/month (Starter) for 50 dynamic QR codes with full analytics, CSV export, and scheduled activation — smart routing is available from the Pro plan.",
  },
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function FeaturesPage() {
  return (
    <div className="bg-paper">
      {/* Deliverable 1 & 2: SEO title + meta description */}
      {/* Deliverable 8: JSON-LD schema */}
      <SEOMeta
        title="QR Code Generator: Analytics, Routing & API"
        description="Create QR codes that track every scan by city and device, update after printing, and route by country or OS. 16 types, A/B testing, REST API. Free to start."
        url="/features"
        jsonLd={FEATURES_JSON_LD}
      />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      {/*
        Deliverable 3: H1 rewrite
        Deliverable 5: Hero CTAs — primary + secondary
        Deliverable 6: A/B variants (Variant A active; B & C in comments)

        Variant A (active): "Every Feature You Need to Create, Track, and Control QR Campaigns"
        Variant B: "Stop Reprinting. Start Tracking. Everything You Need in One QR Tool."
        Variant C: "QR Codes That Work Harder — Edit, Track, Route, and Test from One Dashboard"
      */}
      <PageHero
        eyebrow="Product features"
        title={
          <>
            Every feature you need to{" "}
            <span className="text-accent">create, track, and control QR campaigns</span>
          </>
        }
        intro="GenXQR is more than a QR generator. Edit destinations after printing, see who's scanning and from where, route by device or location, and automate everything via API — all in one dashboard."
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
        {/* Trust bar */}
        <div className="grid sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
          {[
            { label: "Edit after printing", value: "Change destinations in < 1 second" },
            { label: "Scan analytics", value: "City · device · OS · browser" },
            { label: "Developer-ready", value: "REST API + webhook events" },
          ].map((point) => (
            <MktCard key={point.label} interactive={false} className="px-4 py-4 text-left">
              <div className="text-ink font-semibold text-sm">{point.label}</div>
              <div className="text-ink-faint text-xs mt-1">{point.value}</div>
            </MktCard>
          ))}
        </div>
      </PageHero>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      {/* Deliverable 10 fix: QR Tiger has a "How it works" section; we didn't */}
      <section className="py-20 md:py-28 bg-paper-pure border-y border-line">
        <MktContainer>
          <SectionHead
            eyebrow="How it works"
            title={<>From idea to live QR code in under two minutes</>}
            intro="No account needed to try. No credit card required. Your first QR code is ready before your coffee gets cold."
            align="center"
          />

          <div className="mt-14 relative">
            <div className="hidden md:block absolute top-6 left-[16.66%] right-[16.66%] h-px bg-line" />
            <div className="grid md:grid-cols-3 gap-6 md:gap-8 relative">
              {howItWorks.map((step, i) => (
                <Reveal key={step.step} delay={i * 100}>
                  <div className="flex flex-col items-center text-center">
                    <IconTile icon={step.icon} tint={step.tint} size="md" />
                    <span className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
                      Step {step.step}
                    </span>
                    <h3 className="mt-2 text-base font-bold font-display text-ink">{step.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-soft max-w-xs">{step.desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>

          <div className="text-center mt-10">
            <MktButton href="/generate" variant="outline" size="lg">
              Try it now — no account needed
              <ArrowRight size={15} />
            </MktButton>
          </div>
        </MktContainer>
      </section>

      {/* ── Feature cards ────────────────────────────────────────────────── */}
      {/* Deliverable 4: Full benefit-led copy rewrite of all 8 feature cards */}
      {/* Deliverable 9: Internal links added to each relevant feature card */}
      <section className="py-20 md:py-28 bg-paper">
        <MktContainer>
          <SectionHead
            eyebrow="Full feature set"
            title={<>Everything in one place. <span className="text-accent">Nothing held back.</span></>}
            intro={
              <>
                Every feature below ships on a plan that costs less than a restaurant lunch — starting at{" "}
                <Link to="/pricing" className="text-accent hover:text-accent-ink underline underline-offset-2">
                  ₹299/month
                </Link>
                .
              </>
            }
            align="center"
          />

          <div className="mt-14 grid md:grid-cols-2 gap-6">
            {features.map((feature, i) => (
              <Reveal key={feature.title} delay={i * 60}>
                <MktCard className="p-7 h-full">
                  <div className="flex items-start gap-4">
                    <IconTile icon={feature.icon} tint={feature.tint} />
                    <div className="flex-1">
                      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent mb-1">
                        {feature.category}
                      </div>
                      <h3 className="text-base font-bold font-display text-ink mb-2">{feature.title}</h3>
                      <p className="text-sm leading-relaxed text-ink-soft mb-4">{feature.desc}</p>
                      <ul className="grid sm:grid-cols-2 gap-x-5 gap-y-2 mb-4">
                        {feature.items.map((item) => (
                          <li key={item} className="flex items-center gap-2 text-ink text-sm">
                            <Check size={14} className="text-accent shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                      {feature.link && (
                        <Link
                          to={feature.link.to}
                          className="text-accent hover:text-accent-ink text-xs font-semibold underline underline-offset-2"
                        >
                          {feature.link.label}
                        </Link>
                      )}
                    </div>
                  </div>
                </MktCard>
              </Reveal>
            ))}
          </div>
        </MktContainer>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      {/* Deliverable 7: 5-question FAQ targeting Cluster D featured snippets */}
      <section className="py-20 md:py-28 bg-paper-pure border-y border-line">
        <MktContainer className="max-w-3xl">
          <SectionHead
            eyebrow="Common questions"
            title={<>Questions about <span className="text-accent">GenXQR features</span></>}
            align="center"
          />
          <div className="mt-12">
            <FaqAccordion items={faqs} />
          </div>
        </MktContainer>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section className="py-20 md:py-28 bg-paper">
        <MktContainer>
          <Reveal>
            <div className="relative overflow-hidden rounded-[32px] bg-band px-6 py-16 md:px-16 md:py-20 text-center">
              <FinderGlyph size={22} className="absolute top-8 right-8 text-white/15" />
              <div className="relative">
                <h2 className="text-2xl md:text-4xl font-bold font-display tracking-tightest leading-[1.05] text-band-fg mb-4">
                  Your first QR code is ready in 60 seconds
                </h2>
                <p className="text-band-fg/70 max-w-xl mx-auto mb-3">
                  Start on the free plan. Create, style, and publish your first QR code without
                  a credit card. Upgrade only when you need more codes or deeper analytics.
                </p>
                <p className="text-band-fg/50 text-xs mb-8">
                  No credit card · Cancel any time · UPI accepted · Data export on all plans
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <MktButton href="/generate" variant="accent" size="lg">
                    Create My First QR Code — Free
                    <ArrowRight size={16} />
                  </MktButton>
                  <MktButton href="/pricing" variant="outlineOnDark" size="lg">
                    Compare all plans
                  </MktButton>
                </div>
              </div>
            </div>
          </Reveal>
        </MktContainer>
      </section>
    </div>
  )
}
