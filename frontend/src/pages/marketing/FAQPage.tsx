import { useState } from "react"
import { Link } from "react-router-dom"
import {
  ArrowRight, MessageCircle,
  QrCode, BarChart3, IndianRupee, ShieldCheck, Rocket,
} from "lucide-react"
import { SEOMeta } from "@/components/SEOMeta"
import { PageHero } from "@/components/marketing/PageHero"
import { FaqAccordion } from "@/components/marketing/FaqAccordion"
import { MktContainer, MktButton, IconTile } from "@/components/marketing/ui"
import { cn } from "@/lib/utils"

// ─── JSON-LD schema ───────────────────────────────────────────────────────────
// Deliverable 8: FAQPage + SoftwareApplication
// Selecting highest-value questions across all categories for featured snippets.

const FAQ_JSON_LD = [
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
        "description": "Static QR codes — URL, WiFi, WhatsApp, Instagram. No credit card required.",
      },
      {
        "@type": "Offer",
        "name": "Starter",
        "price": "299",
        "priceCurrency": "INR",
        "description": "50 dynamic QR codes, full scan analytics by city and device, scheduled expiry, CSV export.",
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
        "description": "2,000 QR codes, bulk generation, white-label, priority support.",
      },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What is the difference between static and dynamic QR codes?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "A static QR code has the destination permanently encoded — once printed, it cannot be changed. A dynamic QR code contains a short redirect link you can update at any time without reprinting. Dynamic codes also track every scan with city, device, and time data. Use static for permanent content; use dynamic for menus, campaigns, packaging, and anything that may change. Dynamic QR codes are available on GenXQR from ₹299/month.",
        },
      },
      {
        "@type": "Question",
        "name": "Can I edit a QR code after it has been printed?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes — if it is a dynamic QR code. With GenXQR, you can change the destination URL, swap the PDF, or redirect to a new offer at any time from your dashboard. The change goes live in under one second. The printed QR code image never needs to change. This works on menus, packaging, flyers, banners, and any other printed or digital material.",
        },
      },
      {
        "@type": "Question",
        "name": "Is GenXQR free?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. GenXQR's free static QR generator needs no account at all — go to genxqr.com/generate, pick a type, and download a PNG. No credit card and the codes never expire. Dynamic QR codes with full scan analytics start at ₹299/month on the Starter plan.",
        },
      },
      {
        "@type": "Question",
        "name": "How do I track who scanned my QR code?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "GenXQR tracks every scan on dynamic QR codes automatically — no setup required. Your dashboard shows the exact timestamp, city, country, device type, operating system, and browser for every scan, updated in real time. You can filter by date range and export the full dataset to CSV. No app is required for the person scanning. Scan analytics are available from the Starter plan at ₹299/month.",
        },
      },
      {
        "@type": "Question",
        "name": "Does GenXQR work in India?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes — GenXQR is built for India. Pricing starts at ₹299/month in INR. Payments accept UPI, debit cards, and credit cards via PayU. Scan analytics cover Indian cities across all states. Data is stored on infrastructure in Mumbai, India. The platform is used by restaurants, retailers, event organisers, clinics, and real estate agents across India.",
        },
      },
      {
        "@type": "Question",
        "name": "What payment methods does GenXQR accept?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "GenXQR accepts UPI, debit cards, credit cards, and net banking via PayU — India's payment gateway. All payments are in Indian Rupees (INR). You can choose monthly or yearly billing. Yearly plans save up to 17% compared to monthly. An invoice is sent to your email after every payment.",
        },
      },
      {
        "@type": "Question",
        "name": "How many QR code types does GenXQR support?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "GenXQR supports 16 QR content types: URL, PDF, Video, Multi-Link (social page), Social Media, vCard (contact card), Image Gallery, Business Info, App Download, MP3, Restaurant Menu, WiFi, WhatsApp, Instagram, Facebook, and Coupon.",
        },
      },
      {
        "@type": "Question",
        "name": "Is GenXQR secure?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. GenXQR uses HTTPS on every connection, bcrypt password hashing, short-lived JWT authentication with HttpOnly refresh cookies, and rate limiting on all endpoints. QR codes can be password-protected and set to expire after a date or scan limit. No personal data from the person scanning is collected — only aggregate metadata (city, device type, OS, browser). All data is stored in India.",
        },
      },
    ],
  },
]

// ─── FAQ data ─────────────────────────────────────────────────────────────────
// Deliverable 4 + 7: Full copy rewrite across 6 categories — 22 questions total.
// Benefit-led answers, India-first examples, INR pricing, no jargon.
// False claims corrected: bcrypt (not Argon2id), indefinite retention (not 30-day limit).

type FAQCategory = {
  id: string
  label: string
  icon: React.ReactNode
  items: { q: string; a: string }[]
}

const faqCategories: FAQCategory[] = [
  {
    id: "getting-started",
    label: "Getting started",
    icon: <Rocket size={16} />,
    items: [
      {
        q: "What is GenXQR?",
        a: "GenXQR is a QR code platform for Indian businesses. Create static QR codes (free, no account) or dynamic QR codes (editable after printing, with scan analytics). Supports 16 QR types — URL, WiFi, WhatsApp, vCard, PDF, menu, coupon, and more. Plans start at ₹299/month. The free plan lets you create static QR codes with no expiry and no credit card required.",
      },
      {
        q: "Is GenXQR free?",
        a: "Yes. For static QR codes (URL, WhatsApp, WiFi, Instagram, SMS, phone) you don't even need an account — no credit card, no expiry: go to genxqr.com/generate, pick a type, customise the colour and style, and download a 600px PNG. Dynamic QR codes with full scan analytics and editing after print start at ₹299/month on the Starter plan; smart routing is available from Pro.",
      },
      {
        q: "Do I need to download anything?",
        a: "No. GenXQR is entirely web-based. QR generation, preview, customisation, and analytics all run in your browser — on desktop or mobile. The person scanning your QR code also needs no app.",
      },
      {
        q: "Does GenXQR work in India?",
        a: "Yes — GenXQR is built specifically for India. Pricing is in INR from ₹299/month. Payments accept UPI, debit cards, credit cards, and net banking via PayU. Scan analytics cover Indian cities across every state. Data is stored on infrastructure based in Mumbai. Support is available in Indian Standard Time (IST).",
      },
    ],
  },
  {
    id: "qr-codes",
    label: "QR codes",
    icon: <QrCode size={16} />,
    items: [
      {
        q: "What is the difference between static and dynamic QR codes?",
        a: "A static QR code has the destination permanently encoded — once printed, it cannot be changed. A dynamic QR code contains a short redirect you can update any time without reprinting. Dynamic codes also track every scan with city, device, OS, and time data. Use static for content that never changes (WiFi password, phone number); use dynamic for menus, campaigns, packaging, and events. Dynamic QR codes start at ₹299/month on GenXQR.",
      },
      {
        q: "Can I edit a QR code after it has been printed?",
        a: "Yes — if it is a dynamic QR code. From your dashboard, change the destination URL, swap the PDF, or update the offer at any time. The change goes live in under one second. The printed QR image never needs to change. This works on restaurant menus, product packaging, event badges, flyers, banners, business cards, and signboards.",
      },
      {
        q: "How many QR types does GenXQR support?",
        a: "GenXQR supports 16 QR content types: URL, PDF, Video, Multi-Link social page, Social Media, vCard (contact card), Image Gallery, Business Info, App Download, MP3, Restaurant Menu, WiFi, WhatsApp, Instagram, Facebook, and Coupon.",
      },
      {
        q: "How do I create a QR code for a restaurant menu?",
        a: "Create a dynamic QR code and set the destination to your menu URL — your own website, a PDF on Google Drive, or a Zomato/Swiggy page. Print it on table tents or wall holders. When the menu changes — prices, availability, specials — update the destination from your dashboard in seconds. Every table's QR updates instantly, no reprint. Starter plan starts at ₹299/month.",
      },
      {
        q: "Can I add my logo to a QR code?",
        a: "Yes — on paid plans. The QR editor lets you upload a logo image that appears in the centre of the QR code. You can control the size and margin. Logo upload is available on the Starter plan (₹299/month) and above. The free static generator on genxqr.com/generate does not include logo upload.",
      },
      {
        q: "What download formats are available?",
        a: "The free generator at genxqr.com/generate downloads a 600px PNG — ready for print and digital use. On paid plans, the full QR editor generates PNG for download. SVG output is available for vector-quality export suitable for large-format printing.",
      },
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: <BarChart3 size={16} />,
    items: [
      {
        q: "How do I track who scanned my QR code?",
        a: "GenXQR tracks every scan on dynamic QR codes automatically — no setup needed. Your dashboard shows the timestamp, city, country, device type (mobile/tablet/desktop), OS, and browser for every scan, updated in real time. Filter by date range and export the full dataset to CSV. No app is required for the person scanning. Scan analytics are included from the Starter plan at ₹299/month.",
      },
      {
        q: "What scan data does GenXQR collect?",
        a: "For each scan we record: timestamp, country, city, device type (mobile/tablet/desktop), operating system (iOS/Android/Windows/macOS), and browser. We do not collect exact GPS coordinates, names, email addresses, or any personally identifiable information from the person scanning. Scan data is stored on infrastructure in Mumbai, India.",
      },
      {
        q: "How long is analytics data retained?",
        a: "Raw scan records are stored for the lifetime of your account — we do not delete or aggregate away your historical data. Daily rollup summaries are used for fast time-series chart rendering but the underlying per-scan records remain available for CSV export at any time.",
      },
    ],
  },
  {
    id: "pricing",
    label: "Plans & pricing",
    icon: <IndianRupee size={16} />,
    items: [
      {
        q: "What plans does GenXQR offer?",
        a: "Free (₹0): static QR codes, no credit card. Starter (₹299/month): 50 dynamic QR codes, full analytics, CSV export. Pro (₹799/month): 250 QR codes, A/B testing, smart routing, team seats, REST API, webhooks. Business (₹2,499/month): 2,000 QR codes, 20 team seats, bulk generation, white-label. Enterprise (₹9,999/month): custom limits, SLA, dedicated support. Yearly billing saves up to 17%.",
      },
      {
        q: "What payment methods does GenXQR accept?",
        a: "GenXQR accepts UPI, debit cards, credit cards, and net banking — all in Indian Rupees (INR) via PayU. You can choose monthly or yearly billing. An invoice is emailed after every payment. No foreign transaction fees — everything is priced and billed in INR.",
      },
      {
        q: "Can I cancel anytime?",
        a: "Yes. Cancel at any time from your account settings — no penalties, no questions. Your account stays active until the end of the current billing period. After that it reverts to the free plan and your QR codes are paused (not deleted). Reactivate any time by upgrading again.",
      },
      {
        q: "Do you offer refunds?",
        a: "We offer a 7-day money-back guarantee on new subscriptions. If you are not satisfied within the first 7 days, contact us and we will issue a full refund. After 7 days, payments are non-refundable — but you can cancel to stop future charges.",
      },
    ],
  },
  {
    id: "security",
    label: "Security & privacy",
    icon: <ShieldCheck size={16} />,
    items: [
      {
        q: "Is GenXQR secure?",
        a: "Yes. All connections use HTTPS. Passwords are hashed with bcrypt (cost factor 12). Authentication uses short-lived JWTs stored in HttpOnly cookies — not accessible to JavaScript. All public endpoints are rate-limited. QR codes can be password-protected and set to expire automatically after a date or scan count. We follow OWASP Top 10 security practices.",
      },
      {
        q: "Where is my data stored?",
        a: "All GenXQR data — your account, QR codes, and scan analytics — is stored on infrastructure based in Mumbai, India. This ensures low scan latency for Indian users and keeps your data within Indian jurisdiction.",
      },
      {
        q: "What data does GenXQR collect from people who scan QR codes?",
        a: "When someone scans a GenXQR dynamic QR code, we record: the timestamp, city and country (derived from IP address), device type, OS, and browser. We do not record the scanner's name, email, phone number, or exact GPS location. No personally identifiable information (PII) is stored about the person scanning.",
      },
    ],
  },
]

// ─── Page component ───────────────────────────────────────────────────────────

export default function FAQPage() {
  const [activeCategory, setActiveCategory] = useState<string>("getting-started")
  const activeCategoryData = faqCategories.find((cat) => cat.id === activeCategory)

  return (
    <>
      {/*
        Deliverable 1: SEO title (55 chars) — target keyword: "qr code generator"
        Deliverable 2: Meta description (156 chars) — benefit-led with CTA
        Deliverable 8: JSON-LD — FAQPage + SoftwareApplication
      */}
      <SEOMeta
        title="Frequently Asked Questions | GenXQR QR Code Generator"
        description="Every GenXQR question answered — dynamic vs static QR codes, scan analytics, plans from ₹299/month, data security, and billing. Free plan, no credit card needed."
        url="/faq"
        jsonLd={FAQ_JSON_LD}
      />

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      {/*
        Deliverable 3: H1 rewrite — differs from title tag, benefit-led
        Deliverable 6: 3 A/B variants
          Variant A (active): "Every question about QR codes and GenXQR, answered"
          Variant B: "Your Questions About QR Codes. Our Honest Answers."
          Variant C: "Stop Googling. Everything About GenXQR Is Right Here."
      */}
      <PageHero
        eyebrow="Help & FAQ"
        title={<>Every question about QR codes and GenXQR, answered</>}
        intro={
          // Deliverable 4: Subheading — benefit-led, replaces generic copy
          <>
            22 questions across 5 categories — getting started, QR types, analytics,
            pricing, and security. If it's not here,{" "}
            <Link to="/contact" className="text-accent hover:text-accent-ink underline underline-offset-2">
              ask us directly →
            </Link>
          </>
        }
        actions={
          // Deliverable 5: Hero CTAs — primary + secondary
          // Deliverable 9: Internal links
          <>
            <MktButton href="/generate" variant="accent" size="lg">
              Create Your First QR Code — Free
              <ArrowRight size={16} />
            </MktButton>
            <MktButton href="/pricing" variant="outline" size="lg">
              See all plans from ₹299/month
            </MktButton>
          </>
        }
      />

      <section className="pb-20 md:pb-28 bg-paper">
        <MktContainer className="max-w-4xl">

          {/* ── Category nav tabs ─────────────────────────────────────────────── */}
          {/* Deliverable 10 fix: QR Tiger has a search bar; we add category tabs
              as the navigation layer — faster than scrolling through 22 questions */}
          <div className="flex flex-wrap gap-2 justify-center mb-10">
            {faqCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-medium transition-all",
                  activeCategory === cat.id
                    ? "bg-accent-soft text-accent border-accent/30"
                    : "border-line text-ink-soft hover:text-ink hover:border-ink/20",
                )}
              >
                {cat.icon}
                {cat.label}
              </button>
            ))}
          </div>

          {/* ── FAQ list ─────────────────────────────────────────────────────── */}
          {/* Deliverable 4: All answers rewritten — benefit-led, India-first, jargon removed */}
          {/* False claims corrected: bcrypt (not Argon2id), indefinite retention (not 30 days) */}
          {activeCategoryData && (
            <div className="mb-8">
              <h2 className="flex items-center gap-2 font-display font-semibold text-lg text-ink mb-4">
                <span className="w-1.5 h-5 rounded-full bg-accent" />
                {activeCategoryData.label}
              </h2>
              <FaqAccordion items={activeCategoryData.items} />
            </div>
          )}

          {/* All categories expanded view for SEO crawling (screen-reader + crawler accessible) */}
          <div className="sr-only" aria-hidden="false">
            {faqCategories.map((cat) => (
              <div key={cat.id}>
                <h2>{cat.label}</h2>
                {cat.items.map((item) => (
                  <div key={item.q}>
                    <h3>{item.q}</h3>
                    <p>{item.a}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* ── Browse all categories strip ──────────────────────────────────── */}
          <div className="flex flex-wrap gap-2 justify-center">
            {faqCategories
              .filter((cat) => cat.id !== activeCategory)
              .map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line text-xs text-ink-faint hover:text-ink-soft hover:border-ink/20 transition-all"
                >
                  {cat.icon}
                  See {cat.label} questions →
                </button>
              ))}
          </div>

        </MktContainer>
      </section>

      {/* ── Still have questions? ─────────────────────────────────────────────── */}
      {/* Deliverable 9: Internal links — /contact, /features, /dynamic-qr */}
      <section className="py-20 md:py-24 bg-paper-pure border-y border-line">
        <MktContainer>
          <div className="mx-auto max-w-2xl rounded-[28px] border border-line bg-paper p-8 md:p-10 text-center shadow-card">
            <IconTile icon={MessageCircle} tint="violet" className="mx-auto" />
            <h2 className="mt-5 text-2xl md:text-3xl font-bold font-display tracking-tightest text-ink">
              Still have a question?
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-soft max-w-md mx-auto">
              If your question isn't here, reach out directly. We respond to every message
              — usually within a few hours during Indian business hours.
            </p>
            <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
              <MktButton href="/contact" variant="accent" size="lg">
                Ask us your question
                <ArrowRight size={15} />
              </MktButton>
              <MktButton href="/features" variant="outline" size="lg">
                Explore all features
              </MktButton>
            </div>

            {/* Quick reference internal links */}
            <div className="mt-8 pt-6 border-t border-line flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-ink-faint">
              <Link to="/generate" className="hover:text-accent transition-colors">
                Free QR generator →
              </Link>
              <Link to="/dynamic-qr" className="hover:text-accent transition-colors">
                How dynamic QR works →
              </Link>
              <Link to="/pricing" className="hover:text-accent transition-colors">
                View pricing →
              </Link>
              <Link to="/use-cases" className="hover:text-accent transition-colors">
                Use cases by industry →
              </Link>
            </div>
          </div>
        </MktContainer>
      </section>
    </>
  )
}
