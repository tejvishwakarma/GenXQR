import { SEOMeta } from "@/components/SEOMeta"
import { ORG_ID, WEBSITE_ID, organisationSchema } from "@/lib/schema"
import { absoluteUrl } from "@/lib/site"
import { MarketingHero } from "@/components/marketing/Hero"
import { QrTypes, ValueTrio } from "@/components/marketing/Story"
import { MarketingAnalytics, PowerFeatures, MarketingUseCases, MarketingSecurity } from "@/components/marketing/Platform"
import { MarketingPricing, MarketingFinalCta } from "@/components/marketing/Convert"
import { MarketingFaq } from "@/components/marketing/Faq"

// ── JSON-LD schema ────────────────────────────────────────────────────────────

const HOME_JSON_LD = [
  // Publisher identity. Emitted once here, on the site root; other pages
  // reference it by @id via the helpers in lib/schema.ts rather than repeating it.
  organisationSchema(),
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    "name": "GenXQR",
    "url": absoluteUrl("/"),
    "publisher": { "@id": ORG_ID },
    "inLanguage": "en-IN",
    // No SearchAction: Google retired the sitelinks search box it powered.
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "GenXQR",
    "applicationCategory": "BusinessApplication",
    "applicationSubCategory": "QR Code Generator",
    "operatingSystem": "Web",
    "publisher": { "@id": ORG_ID },
    "description":
      "QR code generator and management platform with dynamic QR codes, real-time analytics, A/B testing, smart routing, and 16 QR code types. Free static QR generator and a 14-day Pro trial with no credit card.",
    "url": absoluteUrl("/"),
    "offers": {
      "@type": "AggregateOffer",
      "lowPrice": "0",
      // Self-serve plans only (Free, Starter, Pro, Business); Enterprise is
      // "Custom pricing" on /pricing, so its internal price is not advertised.
      "highPrice": "2499",
      "priceCurrency": "INR",
      "offerCount": "4",
      "description": "14-day Pro trial, no credit card required. Paid plans from ₹299/month.",
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
          "text": "A dynamic QR code contains a short redirect URL that points to your destination. You can change that destination any time — even after the QR code is already printed. Dynamic QR codes also track analytics: every scan is logged with timestamp, city, country, device type, and browser. GenXQR includes dynamic QR codes on every paid plan and in the 14-day Pro trial new accounts start with.",
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
          "text": "Static QR codes are free: the generator at genxqr.com/generate needs no account and no credit card. Signing up starts a 14-day Pro trial, also with no card. Paid plans start at ₹299 per month for dynamic QR codes you can edit after printing, with scan analytics; bulk generation, A/B testing, smart routing, and REST API access come with Pro (₹799 per month) and above.",
        },
      },
      {
        "@type": "Question",
        "name": "What types of QR codes can I create with GenXQR?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "GenXQR supports 16 QR code types: URL, Multi-link page, PDF, Video, Social Media, vCard, Menu, WiFi, Image Gallery, App download, Coupon, Audio, Business profile, WhatsApp, Instagram, and Facebook. All types support dynamic mode, meaning the content can be changed after printing.",
        },
      },
    ],
  },
]

// ── FAQ content (kept in sync with the FAQPage JSON-LD above) ────────────────

const faqs = [
  {
    q: "What is a dynamic QR code?",
    a: "A dynamic QR code contains a short redirect URL that points to your destination. You can change that destination any time — even after the QR code is already printed. Dynamic QR codes also track analytics: every scan is logged with timestamp, city, country, device type, and browser. GenXQR includes dynamic QR codes on every paid plan and in the 14-day Pro trial new accounts start with.",
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
    a: "Static QR codes are free: the generator at genxqr.com/generate needs no account and no credit card. Signing up starts a 14-day Pro trial, also with no card. Paid plans start at ₹299/month for dynamic QR codes you can edit after printing, with scan analytics; bulk generation, A/B testing, smart routing, and REST API access come with Pro (₹799/month) and above.",
  },
  {
    q: "What types of QR codes can I create?",
    a: "GenXQR supports 16 QR code types: URL, Multi-link page, PDF, Video, Social Media, vCard, Menu, WiFi, Image Gallery, App download, Coupon, Audio, Business profile, WhatsApp, Instagram, and Facebook. All types support dynamic mode, meaning the content can be changed after printing.",
  },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <div className="bg-paper">
      <SEOMeta
        title="QR Code Generator with Analytics & Smart Routing"
        description="Create QR codes you can edit after printing. Track every scan by city, device & time. 16 QR types, smart routing, A/B testing. 14-day free trial — no credit card needed."
        url="/"
        jsonLd={HOME_JSON_LD}
      />

      <MarketingHero />
      <QrTypes />
      <ValueTrio />
      <MarketingAnalytics />
      <PowerFeatures />
      <MarketingUseCases />
      <MarketingSecurity />
      <MarketingPricing />
      <MarketingFaq faqs={faqs} />
      <MarketingFinalCta />
    </div>
  )
}
