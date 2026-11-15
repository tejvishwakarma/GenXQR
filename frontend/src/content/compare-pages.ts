import type { GuideSection } from "./generator-guides"

/**
 * GenXQR vs one competitor, at /compare/<slug> (pages/marketing/ComparePage.tsx).
 *
 * Rules (decided with the user 15 Nov 2026; naming competitors is fine):
 * - Every competitor fact comes from that competitor's OWN site, checked on
 *   COMPARED_ON, and the page links those sources. If it isn't stated there,
 *   say "not stated", never guess. Re-check before changing COMPARED_ON.
 * - GenXQR facts come from the code (billing.service PLAN_LIMITS / PLAN_PRICES_INR).
 * - Each page says where the competitor is the better choice. A comparison that
 *   only flatters us is neither trustworthy nor what AI answers quote.
 * - No currency conversion: their USD next to our INR, as each states it.
 * - QR Code Generator PRO is NOT compared yet: its prices render with
 *   JavaScript and its help centre refused automated reads (15 Nov), so the
 *   facts couldn't be verified.
 *
 * `slug: "…"` lines are read by scripts/public-routes.mjs (one per line,
 * indented four spaces).
 */

export const COMPARED_ON = "2026-11-15"

export interface ComparePageContent {
  slug: string
  competitor: string
  summary: string
  title: string
  description: string
  h1: string
  accent: string
  intro: string
  rows: { feature: string; genxqr: string; them: string }[]
  sections: GuideSection[]
  faqs: { q: string; a: string }[]
  sources: string[]
}

/** GenXQR's side, shared by every page. Kept in step with PLAN_LIMITS / PLAN_PRICES_INR. */
const G = {
  prices: "Starter ₹299, Pro ₹799, Business ₹2,499, Agency ₹5,999 a month (yearly billing costs less)",
  currency: "Indian rupees. Pay by UPI, debit or credit card, or net banking (Cashfree)",
  billing: "Monthly or yearly, on every plan",
  trial: "14 days of Pro, no credit card",
  free: "Free static QR codes with no account (URL, WiFi, WhatsApp, UPI and more). They never expire",
  codes: "Starter 50, Pro 150, Business 1,000, Agency 5,000 dynamic codes",
  scans: "Unlimited from Pro. Starter: 5,000 a month",
  lapse: "Dynamic codes pause when a plan ends and resume when you pay again. Scan history is kept for 3 months after",
  team: "Pro 5 seats, Business 20",
  domain: "Pro 1, Business 5, Agency 15",
  api: "Pro and above: REST API, webhooks, MCP server for AI assistants. Zapier and Make apps by invite",
  routing: "A/B tests, and routing by device, country or language (Pro and above)",
  sso: "Business and above (Google Workspace, Microsoft)",
  upi: "Free UPI QR codes, and dynamic UPI payment pages",
  types: "20 types incl. vCard, PDF, menu (veg/non-veg, allergens), Google review, event, lead/feedback form, coupon",
}

export const COMPARE_PAGES: ComparePageContent[] = [
  // ─── QR TIGER ───────────────────────────────────────────────────────────────
  {
    slug: "qr-tiger",
    competitor: "QR TIGER",
    summary: "Rupee pricing and UPI vs a long-running global generator",
    title: "QR TIGER Alternative in India — GenXQR vs QR TIGER",
    description: "GenXQR vs QR TIGER: prices, plans, scan limits, billing and what happens to your codes when a plan ends, with QR TIGER's facts from its own site.",
    h1: "GenXQR vs QR TIGER —",
    accent: "which suits an Indian business?",
    intro: "Both make dynamic QR codes with scan tracking. The differences are in pricing and billing, payment in India, and the types and tools on each plan.",
    rows: [
      { feature: "Prices", genxqr: G.prices, them: "Regular US$7, Advanced US$16, Premium US$37 a month" },
      { feature: "Currency and payment", genxqr: G.currency, them: "USD. Cards, PayPal, iDEAL, Bancontact, SEPA. INR and UPI not stated" },
      { feature: "Billing", genxqr: G.billing, them: "Regular monthly. Advanced and Premium are paid yearly" },
      { feature: "Free option", genxqr: `${G.free}. Dynamic codes via the trial: ${G.trial}`, them: "Free plan: 3 dynamic codes, 500 scans each, with a QR TIGER logo pop-up when scanned" },
      { feature: "Dynamic codes", genxqr: G.codes, them: "Regular 12, Advanced 200, Premium 600" },
      { feature: "Scans", genxqr: G.scans, them: "Unlimited on paid plans" },
      { feature: "When a plan ends", genxqr: G.lapse, them: "\"All dynamic QR codes will become invalid.\" Data kept up to 1 year" },
      { feature: "Team", genxqr: G.team, them: "Up to 2 users per subscription" },
      { feature: "Custom domain", genxqr: G.domain, them: "\"Use your own domain (white label)\" listed on paid plans" },
      { feature: "API and integrations", genxqr: G.api, them: "API on paid plans (500–10,000 requests a month), Zapier and HubSpot" },
      { feature: "Routing and testing", genxqr: G.routing, them: "Smart multi-URL routing by time, language, location and scan count. A/B testing not stated" },
      { feature: "Single sign-on", genxqr: G.sso, them: "Not stated" },
      { feature: "UPI payment QR", genxqr: G.upi, them: "Not stated" },
      { feature: "Forms", genxqr: "Built-in lead and feedback forms, responses by email and CSV", them: "A Google Form QR type" },
    ],
    sections: [
      {
        heading: "Where QR TIGER may suit you better",
        blocks: [
          {
            list: [
              "You want dynamic codes free, for a long time: QR TIGER's free plan keeps 3 dynamic codes (500 scans each), while GenXQR's free codes are static and dynamic ones need a plan after the trial.",
              "You need HubSpot, or a public Zapier listing today. GenXQR's Zapier and Make apps work by invite link.",
              "You want geofencing or routing by scan count, which QR TIGER lists and GenXQR doesn't offer.",
              "You pay in USD or EUR anyway, with a card or PayPal.",
            ],
          },
        ],
      },
      {
        heading: "Where GenXQR is different",
        blocks: [
          {
            list: [
              "Prices in rupees, monthly on every plan, paid by UPI, card or net banking. QR TIGER prices in US dollars and its Advanced and Premium plans are paid yearly.",
              "UPI built in: free UPI codes for the counter, and dynamic UPI payment pages that work from a phone camera.",
              "Lead and feedback forms inside GenXQR, with each response emailed to you and a CSV download, rather than a Google Form.",
              "A restaurant menu type with veg/non-veg marks and allergens, events with add-to-calendar, and Google review codes.",
              "Teams: 5 seats on Pro and 20 on Business, plus single sign-on on Business.",
            ],
          },
        ],
      },
      {
        heading: "What happens to your codes if you stop paying",
        blocks: [
          "Check this before you print thousands of codes. QR TIGER says that when a plan expires \"all dynamic QR codes will become invalid\". GenXQR pauses dynamic codes when a plan ends and resumes exactly those codes when you pay again; scanners see a \"deactivated\" page, or your fallback link if you set one.",
          "If you need a code that never depends on a subscription, use a static code. GenXQR's [free generator](/generate) makes them with no account.",
        ],
      },
    ],
    faqs: [
      {
        q: "Is GenXQR cheaper than QR TIGER?",
        a: "They price differently: GenXQR in rupees (Pro ₹799 a month, monthly or yearly), QR TIGER in US dollars (Advanced US$16 a month, paid yearly). Compare the plan that has the codes, scans and users you need, and check both pricing pages on the day you buy.",
      },
      {
        q: "Can I pay for GenXQR with UPI?",
        a: "Yes. GenXQR is billed in rupees through Cashfree, by UPI, debit or credit card, or net banking. QR TIGER's site lists cards, PayPal and European methods, and doesn't mention UPI.",
      },
      {
        q: "What happens to QR TIGER codes when the plan expires?",
        a: "QR TIGER's help centre says all dynamic QR codes become invalid. On GenXQR, dynamic codes pause when a plan ends and resume when you pay again.",
      },
      {
        q: "Can I move my QR TIGER codes to GenXQR?",
        a: "A printed code always points to the address inside it, so existing prints keep pointing to QR TIGER. In GenXQR, you can scan an existing code with the import option to copy its content into a new dynamic code, and use the new code on your next print run.",
      },
    ],
    sources: [
      "https://www.qrcode-tiger.com/payment",
      "https://www.qrcode-tiger.com/faq",
      "https://www.qrcode-tiger.com/",
      "https://qrtiger.helpscoutdocs.com/article/97-what-happens-if-my-paid-subscription-expires-or-if-i-cancel-my-subscription",
      "https://qrtiger.helpscoutdocs.com/article/92-payment-methods",
    ],
  },

  // ─── Uniqode ────────────────────────────────────────────────────────────────
  {
    slug: "uniqode",
    competitor: "Uniqode",
    summary: "Monthly rupee plans vs yearly USD enterprise plans",
    title: "Uniqode Alternative in India — GenXQR vs Uniqode",
    description: "GenXQR vs Uniqode (formerly Beaconstac): plans, scan limits, billing, custom domains and SSO, with Uniqode's facts taken from its own website.",
    h1: "GenXQR vs Uniqode —",
    accent: "monthly rupee plans or yearly dollar plans",
    intro: "Uniqode (formerly Beaconstac) is built for large companies. GenXQR covers much of the same ground for Indian businesses, with monthly billing in rupees.",
    rows: [
      { feature: "Prices", genxqr: G.prices, them: "Essential US$9, Core US$49, Plus US$99, Business+ US$399 a month, billed yearly. Enterprise custom" },
      { feature: "Currency and payment", genxqr: G.currency, them: "\"All our plans are billed in USD.\" Visa, Mastercard, American Express" },
      { feature: "Billing", genxqr: G.billing, them: "\"All Uniqode plans are billed annually\"" },
      { feature: "Free option", genxqr: `${G.free}. Trial: ${G.trial}`, them: "Free plan: static codes without tracking. 14-day trial, no card" },
      { feature: "Dynamic codes", genxqr: G.codes, them: "Essential 15, Core 250, Plus 500, Business+ 2,000" },
      { feature: "Scans", genxqr: G.scans, them: "Per year: Essential 50,000, Core 1,000,000, Plus 2,000,000, Business+ unlimited. Over the limit, codes become inactive" },
      { feature: "When a plan ends", genxqr: G.lapse, them: "\"Dynamic QR codes stop working\" when the trial ends or the plan isn't renewed. The account is kept and can be reactivated" },
      { feature: "Team", genxqr: G.team, them: "Essential 1, Core 1, Plus 3, Business+ 5 seats" },
      { feature: "Custom domain", genxqr: G.domain, them: "Add-on on Plus; 1 included on Business+" },
      { feature: "Single sign-on", genxqr: G.sso, them: "Add-on on Plus; included on Business+" },
      { feature: "API and integrations", genxqr: G.api, them: "API and Zapier from Core" },
      { feature: "Routing and testing", genxqr: G.routing, them: "Smart Rules by time, location or device (from Core). A/B testing not stated" },
      { feature: "UPI payment QR", genxqr: G.upi, them: "Not stated" },
    ],
    sections: [
      {
        heading: "Where Uniqode may suit you better",
        blocks: [
          {
            list: [
              "You're a large company that needs enterprise procurement, invoicing and security reviews, which is the market Uniqode is built for.",
              "You need more than GenXQR's Business plan in one account and want a single enterprise vendor for QR codes and digital business cards across many teams.",
              "You need GPS-based scan locations. Uniqode lists GPS tracking, while GenXQR locates scans approximately from the network address.",
            ],
          },
        ],
      },
      {
        heading: "Where GenXQR is different",
        blocks: [
          {
            list: [
              "Monthly plans in rupees. Uniqode bills every plan yearly, in US dollars, by card.",
              "Unlimited scans from Pro. Uniqode caps scans per year below Business+, and codes over the cap become inactive.",
              "A custom domain is included on Pro, and single sign-on on Business. On Uniqode they're add-ons on Plus or included on Business+.",
              "UPI payment codes and pages, a restaurant menu with veg/non-veg marks, and A/B tests.",
            ],
          },
        ],
      },
      {
        heading: "What happens when you stop paying",
        blocks: [
          "Both pause dynamic codes. Uniqode says dynamic codes stop working when a trial ends or a plan isn't renewed. GenXQR pauses them and resumes the same codes when you pay again. For codes that must never depend on a subscription, use static codes from GenXQR's [free generator](/generate).",
        ],
      },
    ],
    faqs: [
      {
        q: "Does Uniqode offer monthly plans?",
        a: "Uniqode's help centre says all its plans are billed annually, in US dollars. GenXQR offers monthly and yearly billing on every plan, in rupees.",
      },
      {
        q: "Does Uniqode limit scans?",
        a: "Yes, below Business+: Uniqode lists yearly scan limits per plan (50,000 on Essential up to 2,000,000 on Plus) and says codes become inactive over the limit. GenXQR has unlimited scans from Pro; Starter has 5,000 a month.",
      },
      {
        q: "Is GenXQR an enterprise QR platform like Uniqode?",
        a: "GenXQR has the features most businesses need: team workspaces with roles, single sign-on, custom domains, an API, webhooks and white label on Business. For large enterprise procurement, Uniqode is built for that market.",
      },
    ],
    sources: [
      "https://docs.uniqode.com/en/articles/17025518-plans-and-pricing-for-qr-codes",
      "https://docs.uniqode.com/en/articles/17515508-do-you-offer-monthly-or-short-term-plans",
      "https://docs.uniqode.com/en/articles/9182987-is-there-a-scan-limit-on-my-qr-code",
      "https://docs.uniqode.com/en/articles/17190918-what-happens-to-my-qr-codes-when-my-subscription-changes-or-ends",
      "https://www.uniqode.com/pricing",
      "https://www.uniqode.com/qr-code-generator",
    ],
  },

  // ─── Hovercode ──────────────────────────────────────────────────────────────
  {
    slug: "hovercode",
    competitor: "Hovercode",
    summary: "Rupee plans with teams and API on Pro vs a simple global tool",
    title: "Hovercode Alternative — GenXQR vs Hovercode",
    description: "GenXQR vs Hovercode: plans, prices, free plan, team seats, API and what happens after you cancel, with Hovercode's facts from its own site.",
    h1: "GenXQR vs Hovercode —",
    accent: "two simple tools, priced differently",
    intro: "Hovercode and GenXQR are both straightforward dynamic QR code tools. They differ in currency, in which plan includes teams and the API, and in what you keep for free.",
    rows: [
      { feature: "Prices", genxqr: G.prices, them: "Pro US$12, Business US$39, Business Plus US$99 a month (excluding tax)" },
      { feature: "Currency and payment", genxqr: G.currency, them: "USD, with GBP, EUR, AUD, CAD and NZD at checkout. INR and UPI not stated" },
      { feature: "Free option", genxqr: `${G.free}. Trial: ${G.trial}`, them: "Free plan: 3 dynamic codes with unlimited scans, no card" },
      { feature: "Dynamic codes", genxqr: G.codes, them: "Pro 100 in total; Business 600 and Business Plus 2,000 a month" },
      { feature: "Scans", genxqr: G.scans, them: "Unlimited on every plan" },
      { feature: "When a plan ends", genxqr: G.lapse, them: "Moved to the free plan: the first 3 dynamic codes stay active, the rest become inactive until you subscribe again" },
      { feature: "Team", genxqr: G.team, them: "Pro 1, Business 10, Business Plus 25 members" },
      { feature: "Custom domain", genxqr: G.domain, them: "Pro 1, Business 10, Business Plus 50" },
      { feature: "API and bulk", genxqr: `${G.api}. Bulk from CSV on Pro and above`, them: "REST API and bulk generator on Business and above. Zapier \"coming soon\"" },
      { feature: "Routing and testing", genxqr: G.routing, them: "App Store links that send iPhone and Android users to their own store. Other routing and A/B testing not stated" },
      { feature: "Password and expiry", genxqr: "Password protection on every plan, expiry dates from Starter", them: "Not stated" },
      { feature: "UPI payment QR", genxqr: G.upi, them: "Not stated" },
    ],
    sections: [
      {
        heading: "Where Hovercode may suit you better",
        blocks: [
          {
            list: [
              "You want a few dynamic codes free with no time limit: Hovercode's free plan includes 3, with unlimited scans, and keeps 3 active if you cancel.",
              "You need many custom domains: Hovercode Business includes 10, Business Plus 50.",
              "You pay in USD, GBP or EUR anyway.",
            ],
          },
        ],
      },
      {
        heading: "Where GenXQR is different",
        blocks: [
          {
            list: [
              "Rupee pricing, paid by UPI, card or net banking.",
              "Team seats, the API and bulk creation start on Pro (₹799 a month). On Hovercode, Pro has one member, and the API and bulk generator start on Business.",
              "A/B tests and routing by device, country or language on Pro.",
              "UPI payment codes and pages, a restaurant menu with veg/non-veg marks, events with add-to-calendar, and password-protected codes.",
            ],
          },
        ],
      },
      {
        heading: "Keeping codes after you stop paying",
        blocks: [
          "Here Hovercode is more generous: when you cancel, your first 3 dynamic codes stay active on its free plan. On GenXQR, dynamic codes pause when a plan ends and resume when you pay again. For codes that must never depend on a subscription, use static codes from GenXQR's [free generator](/generate).",
        ],
      },
    ],
    faqs: [
      {
        q: "Is Hovercode free?",
        a: "Hovercode has a free plan with 3 dynamic codes and unlimited scans. GenXQR's free generator makes static codes with no account, and dynamic codes come with a 14-day Pro trial and then a paid plan.",
      },
      {
        q: "Which includes a team and API at a lower price?",
        a: "On GenXQR, team seats (5), the API and bulk creation are on Pro at ₹799 a month. On Hovercode, Pro (US$12 a month) has one member, and the API and bulk generator start on Business (US$39 a month).",
      },
      {
        q: "Can I pay Hovercode in rupees?",
        a: "Hovercode's pricing page lists USD, GBP, EUR, AUD, CAD and NZD. GenXQR is billed in rupees, by UPI, card or net banking.",
      },
    ],
    sources: [
      "https://hovercode.com/pricing/",
      "https://hovercode.com/features/",
      "https://hovercode.com/integrations/",
      "https://hovercode.com/",
    ],
  },
]

const BY_SLUG = new Map(COMPARE_PAGES.map((p) => [p.slug, p]))

export function comparePage(slug: string): ComparePageContent | undefined {
  return BY_SLUG.get(slug)
}
