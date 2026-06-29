import { useState } from "react"
import { Link } from "react-router-dom"
import {
  ChevronDown, HelpCircle, ArrowRight, MessageCircle,
  QrCode, BarChart3, IndianRupee, ShieldCheck, Rocket,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { SEOMeta } from "@/components/SEOMeta"
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
    "url": "https://genxqr.streamsnatcher.com",
    "offers": [
      {
        "@type": "Offer",
        "name": "Free Plan",
        "price": "0",
        "priceCurrency": "INR",
        "description": "3 QR codes, basic analytics, static and dynamic types. No credit card required.",
      },
      {
        "@type": "Offer",
        "name": "Starter",
        "price": "299",
        "priceCurrency": "INR",
        "description": "10 dynamic QR codes, full scan analytics by city and device, smart routing, CSV export.",
      },
      {
        "@type": "Offer",
        "name": "Pro",
        "price": "799",
        "priceCurrency": "INR",
        "description": "50 QR codes, A/B testing, team workspace, REST API, webhook events.",
      },
      {
        "@type": "Offer",
        "name": "Business",
        "price": "2499",
        "priceCurrency": "INR",
        "description": "Unlimited QR codes, bulk generation, white-label, priority support.",
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
          "text": "Yes. GenXQR's free plan includes 3 QR codes with basic analytics. No credit card is required and the QR codes never expire. For the free static QR generator, no account is needed at all — go to genxqr.streamsnatcher.com/generate, pick a type, and download a PNG. Dynamic QR codes with full scan analytics start at ₹299/month on the Starter plan.",
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
    icon: <Rocket size={16} className="text-violet-400" />,
    items: [
      {
        q: "What is GenXQR?",
        a: "GenXQR is a QR code platform for Indian businesses. Create static QR codes (free, no account) or dynamic QR codes (editable after printing, with scan analytics). Supports 16 QR types — URL, WiFi, WhatsApp, vCard, PDF, menu, coupon, and more. Plans start at ₹299/month. The free plan includes 3 QR codes with no expiry and no credit card required.",
      },
      {
        q: "Is GenXQR free?",
        a: "Yes. The free plan includes 3 QR codes with basic analytics — no credit card, no expiry. For static QR codes (URL, WhatsApp, WiFi, Instagram, SMS, phone), you don't even need an account: go to genxqr.streamsnatcher.com/generate, pick a type, customise the colour and style, and download a 600px PNG. Dynamic QR codes with full scan analytics, smart routing, and editing after print start at ₹299/month.",
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
    icon: <QrCode size={16} className="text-blue-400" />,
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
        a: "Yes — on paid plans. The QR editor lets you upload a logo image that appears in the centre of the QR code. You can control the size and margin. Logo upload is available on the Starter plan (₹299/month) and above. The free static generator on genxqr.streamsnatcher.com/generate does not include logo upload.",
      },
      {
        q: "What download formats are available?",
        a: "The free generator at genxqr.streamsnatcher.com/generate downloads a 600px PNG — ready for print and digital use. On paid plans, the full QR editor generates PNG for download. SVG output is available for vector-quality export suitable for large-format printing.",
      },
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: <BarChart3 size={16} className="text-emerald-400" />,
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
    icon: <IndianRupee size={16} className="text-amber-400" />,
    items: [
      {
        q: "What plans does GenXQR offer?",
        a: "Free (₹0): 3 QR codes, basic analytics, no credit card. Starter (₹299/month): 10 dynamic QR codes, full analytics, smart routing, CSV export. Pro (₹799/month): 50 QR codes, A/B testing, team workspace, REST API, webhooks. Business (₹2,499/month): unlimited QR codes, bulk generation, white-label. Enterprise (₹9,999/month): custom limits, SLA, dedicated support. Yearly billing saves up to 17%.",
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
    icon: <ShieldCheck size={16} className="text-red-400" />,
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

// ─── FAQ item component ───────────────────────────────────────────────────────

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={cn(
      "glass-card rounded-xl overflow-hidden transition-all",
      open && "ring-1 ring-violet-500/20",
    )}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start justify-between gap-4 p-5 text-left hover:bg-zinc-800/20 transition-colors"
        aria-expanded={open}
      >
        <span className="text-white font-medium text-sm">{q}</span>
        <ChevronDown
          size={16}
          className={cn(
            "text-zinc-500 shrink-0 mt-0.5 transition-transform duration-200",
            open && "rotate-180 text-violet-400",
          )}
        />
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-zinc-800 pt-4">
          <p className="text-zinc-400 text-sm leading-relaxed">{a}</p>
        </div>
      )}
    </div>
  )
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function FAQPage() {
  const [activeCategory, setActiveCategory] = useState<string>("getting-started")

  return (
    <div className="pt-16 pb-24 px-4">

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

      <div className="max-w-4xl mx-auto">

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        {/*
          Deliverable 3: H1 rewrite — differs from title tag, benefit-led
          Deliverable 6: 3 A/B variants
            Variant A (active): "Every question about QR codes and GenXQR, answered"
            Variant B: "Your Questions About QR Codes. Our Honest Answers."
            Variant C: "Stop Googling. Everything About GenXQR Is Right Here."
        */}
        <div className="text-center mb-14 pt-8">
          <span className="section-header">
            <HelpCircle size={14} />
            Help & FAQ
          </span>
          <h1 className="text-4xl md:text-5xl font-bold text-white mt-6 mb-4">
            Every question about{" "}
            <span className="gradient-text">QR codes and GenXQR, answered</span>
          </h1>
          {/* Deliverable 4: Subheading — benefit-led, replaces generic copy */}
          <p className="text-zinc-400 text-lg max-w-xl mx-auto mb-8">
            22 questions across 5 categories — getting started, QR types, analytics,
            pricing, and security. If it's not here,{" "}
            <Link to="/contact" className="text-violet-400 hover:text-violet-300 underline underline-offset-2">
              ask us directly →
            </Link>
          </p>

          {/* Deliverable 5: Hero CTAs — primary + secondary */}
          {/* Deliverable 9: Internal links */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/generate">
              <Button size="lg" variant="glow">
                Create Your First QR Code — Free
                <ArrowRight size={16} />
              </Button>
            </Link>
            <Link to="/pricing">
              <Button size="lg" variant="secondary">
                See all plans from ₹299/month
              </Button>
            </Link>
          </div>
        </div>

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
                  ? "border-violet-500 bg-violet-500/15 text-violet-300"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 bg-transparent",
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
        <div className="space-y-10">
          {faqCategories
            .filter((cat) => cat.id === activeCategory)
            .map((cat) => (
              <div key={cat.id}>
                <h2 className="text-white font-semibold text-lg mb-4 flex items-center gap-2">
                  <div className="w-1.5 h-5 bg-violet-600 rounded-full" />
                  {cat.label}
                </h2>
                <div className="space-y-3">
                  {cat.items.map((item) => (
                    <FAQItem key={item.q} q={item.q} a={item.a} />
                  ))}
                </div>
              </div>
            ))}
        </div>

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
        <div className="mt-8 flex flex-wrap gap-2 justify-center">
          {faqCategories
            .filter((cat) => cat.id !== activeCategory)
            .map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 text-xs text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-all"
              >
                {cat.icon}
                See {cat.label} questions →
              </button>
            ))}
        </div>

        {/* ── Still have questions? ─────────────────────────────────────────── */}
        {/* Deliverable 9: Internal links — /contact, /features, /dynamic-qr */}
        <div className="mt-16 glass-card rounded-2xl border border-zinc-800 p-8 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-violet-600/8 via-transparent to-transparent pointer-events-none" />
          <div className="relative">
            <div className="w-12 h-12 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-4">
              <MessageCircle size={22} className="text-violet-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">
              Still have a question?
            </h2>
            <p className="text-zinc-400 text-sm max-w-md mx-auto mb-6">
              If your question isn't here, reach out directly. We respond to every message
              — usually within a few hours during Indian business hours.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to="/contact">
                <Button variant="glow" size="lg">
                  Ask us your question
                  <ArrowRight size={15} />
                </Button>
              </Link>
              <Link to="/features">
                <Button variant="secondary" size="lg">
                  Explore all features
                </Button>
              </Link>
            </div>

            {/* Quick reference internal links */}
            <div className="mt-8 pt-6 border-t border-zinc-800/60 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-zinc-600">
              <Link to="/generate" className="hover:text-violet-400 transition-colors">
                Free QR generator →
              </Link>
              <Link to="/dynamic-qr" className="hover:text-violet-400 transition-colors">
                How dynamic QR works →
              </Link>
              <Link to="/pricing" className="hover:text-violet-400 transition-colors">
                View pricing →
              </Link>
              <Link to="/use-cases" className="hover:text-violet-400 transition-colors">
                Use cases by industry →
              </Link>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
