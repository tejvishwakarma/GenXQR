/**
 * schema.org JSON-LD builders.
 *
 * Centralised so every page emits structurally valid, consistently-branded
 * structured data pointing at the canonical domain. Previously each page
 * hand-wrote its own blob, which is how three of them ended up advertising the
 * VPS hostname to Google.
 *
 * Reference: https://developers.google.com/search/docs/appearance/structured-data
 */
import { ORGANISATION, SITE_DESCRIPTION, SITE_NAME, absoluteUrl } from "./site"

/** Stable @id for the organisation so other nodes can reference it rather than duplicating it. */
export const ORG_ID = absoluteUrl("/#organization")
export const WEBSITE_ID = absoluteUrl("/#website")

/**
 * The publisher behind the site. Emitted once (on the homepage); other pages
 * reference it by @id instead of repeating the whole node.
 */
export function organisationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: ORGANISATION.name,
    legalName: ORGANISATION.legalName,
    // `telephone` is emitted only if a phone number is configured. None is
    // published today (see the note in site.ts), and an absent field is far
    // better than an empty or placeholder one in structured data.
    ...("phone" in ORGANISATION && typeof ORGANISATION.phone === "string"
      ? { telephone: ORGANISATION.phone }
      : {}),
    url: absoluteUrl("/"),
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl("/og-image.png"),
    },
    description: SITE_DESCRIPTION,
    address: {
      "@type": "PostalAddress",
      addressLocality: ORGANISATION.addressLocality,
      addressCountry: ORGANISATION.addressCountry,
    },
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: ORGANISATION.email,
        availableLanguage: ["English"],
      },
      {
        "@type": "ContactPoint",
        contactType: "sales",
        email: ORGANISATION.email,
        availableLanguage: ["English"],
      },
    ],
  }
}

/** Enables the sitelinks search box treatment in Google results. */
export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE_NAME,
    url: absoluteUrl("/"),
    description: SITE_DESCRIPTION,
    publisher: { "@id": ORG_ID },
    inLanguage: "en",
  }
}

export interface SoftwareAppOptions {
  lowPrice: string
  highPrice: string
  priceCurrency: string
  offerCount: string
  ratingValue?: string
  reviewCount?: string
}

/**
 * The product itself. `offers` drives the price range shown in rich results.
 *
 * NOTE: aggregateRating is only included when real values are passed. Inventing
 * ratings is a Google structured-data policy violation and risks a manual
 * action, so this deliberately omits the field rather than defaulting it.
 */
export function softwareApplicationSchema(options: SoftwareAppOptions) {
  const { lowPrice, highPrice, priceCurrency, offerCount, ratingValue, reviewCount } = options

  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "QR Code Generator",
    operatingSystem: "Web",
    url: absoluteUrl("/"),
    description: SITE_DESCRIPTION,
    publisher: { "@id": ORG_ID },
    offers: {
      "@type": "AggregateOffer",
      lowPrice,
      highPrice,
      priceCurrency,
      offerCount,
    },
    ...(ratingValue && reviewCount
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue,
            reviewCount,
          },
        }
      : {}),
  }
}

/**
 * Breadcrumb trail. Pass the ancestor chain excluding Home, which is prepended:
 *   breadcrumbSchema([{ name: "Pricing", path: "/pricing" }])
 */
export function breadcrumbSchema(trail: Array<{ name: string; path: string }>) {
  const items = [{ name: "Home", path: "/" }, ...trail]

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  }
}

/** FAQ rich result. Answers are plain text; any markup is stripped by consumers. */
export function faqSchema(entries: Array<{ question: string; answer: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: entry.answer,
      },
    })),
  }
}

/** A generic content page, tied back to the site and publisher. */
export function webPageSchema(options: { name: string; path: string; description?: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: options.name,
    url: absoluteUrl(options.path),
    ...(options.description ? { description: options.description } : {}),
    isPartOf: { "@id": WEBSITE_ID },
    publisher: { "@id": ORG_ID },
    inLanguage: "en",
  }
}

/** Step-by-step guide — eligible for the HowTo rich result. */
export function howToSchema(options: {
  name: string
  description: string
  steps: Array<{ name: string; text: string }>
}) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: options.name,
    description: options.description,
    step: options.steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.name,
      text: step.text,
    })),
  }
}
