import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { Check, X, Minus, ChevronRight, ChevronDown } from "lucide-react"
import { SEOMeta } from "@/components/SEOMeta"
import { PageHero } from "@/components/marketing/PageHero"
import { MktContainer, SectionHead, MktButton, MktCard, Reveal } from "@/components/marketing/ui"
import { FaqAccordion } from "@/components/marketing/FaqAccordion"
import { cn } from "@/lib/utils"

// ─── JSON-LD schema ────────────────────────────────────────────────────────────
// Deliverable 8: SoftwareApplication + FAQPage combined

const PRICING_JSON_LD = [
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
        "name": "Free",
        "price": "0",
        "priceCurrency": "INR",
        "description": "Static QR codes — URL, WiFi, WhatsApp, Instagram, SMS, phone. No account needed.",
      },
      {
        "@type": "Offer",
        "name": "Starter",
        "price": "299",
        "priceCurrency": "INR",
        "description": "50 dynamic QR codes with scan analytics, 5,000 scans/month, all 16 QR types, PNG & SVG download.",
      },
      {
        "@type": "Offer",
        "name": "Pro",
        "price": "799",
        "priceCurrency": "INR",
        "description": "250 dynamic QR codes, 50,000 scans/month, 5 team seats, A/B testing, smart routing, REST API, bulk generation.",
      },
      {
        "@type": "Offer",
        "name": "Business",
        "price": "2499",
        "priceCurrency": "INR",
        "description": "2,000 dynamic QR codes, 500,000 scans/month, 20 team seats, white-label branding, webhooks, 100,000 API calls/month.",
      },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "Can I switch QR code plans any time?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. You can upgrade or downgrade your GenXQR plan at any time from your billing dashboard. A paid upgrade takes effect immediately and starts a new billing period from the day you pay. A downgrade also takes effect immediately and keeps your current billing period's end date.",
        },
      },
      {
        "@type": "Question",
        "name": "What payment methods does GenXQR accept?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "GenXQR accepts UPI, credit cards, debit cards, and net banking via Cashfree — all major Indian payment methods. Prices are in Indian Rupees (INR). No international payment required.",
        },
      },
      {
        "@type": "Question",
        "name": "What happens to my QR codes if I downgrade?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Your QR codes stay active after a downgrade and are never deleted. If you have more QR codes than the lower plan allows, you can't create new ones until you are back under its limit. If a paid period or trial ends without payment, the account moves to the Free plan and dynamic QR codes are paused — pay again and they are switched back on automatically. Scan history is kept for 3 months after the account moves to Free, then deleted.",
        },
      },
      {
        "@type": "Question",
        "name": "Is there a free trial for GenXQR paid plans?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. New GenXQR accounts start with a 14-day free trial of the Pro plan. No credit card is required to start the trial. When the trial ends, the account moves to the Free plan and dynamic QR codes are paused until you choose a plan and pay.",
        },
      },
      {
        "@type": "Question",
        "name": "What is the difference between static and dynamic QR codes?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "A static QR code has the destination encoded directly into the image — it can never be changed. A dynamic QR code points to a short redirect URL, so you can update the destination any time without reprinting. Dynamic QR codes also track every scan with analytics. GenXQR includes dynamic QR codes from the Starter plan.",
        },
      },
    ],
  },
]

// ─── A/B test H1 variants (Deliverable 6) ─────────────────────────────────────
// Variant A (active): "Honest Pricing. Pay Only for What You Actually Use."
// Variant B: "QR Code Plans From Free to Unlimited — All in INR"
// Variant C: "Start Free. Upgrade When Your Business Grows."

// ─── Plan data ────────────────────────────────────────────────────────────────

const plans = [
  {
    name: "Free",
    badge: null,
    badgeVariant: null as "default" | "success" | null,
    priceMonthly: 0,
    priceYearly: 0,
    yearlySaving: 0,
    perDay: null as { monthly: string; yearly: string } | null,
    desc: "Test the platform. Create static QR codes — no account needed.",
    cta: "Start free",
    ctaVariant: "outline" as const,
    href: "/signup",
    highlight: false,
    features: [
      "6 static QR types (URL, WiFi, WhatsApp, Instagram, SMS, phone)",
      "PNG download",
      "No watermark",
      "No account needed — generate instantly",
    ],
    missing: [
      "Dynamic QR codes (editable after print)",
      "Scan analytics",
      "Logo upload",
      "Custom landing pages",
      "QR frames",
    ],
  },
  {
    name: "Starter",
    badge: "Most Popular",
    badgeVariant: "default" as "default" | "success" | null,
    priceMonthly: 299,
    priceYearly: 249,
    yearlySaving: 600,
    perDay: { monthly: "₹10", yearly: "₹9" },
    desc: "Your first 50 dynamic QR codes with scan tracking. Perfect for small businesses.",
    cta: "Start free trial",
    ctaVariant: "outline" as const,
    href: "/signup?plan=starter",
    highlight: false,
    features: [
      "50 QR codes you can edit after printing",
      "Scan analytics — city, device & browser tracked",
      "All 16 QR types — URL, PDF, menu, vCard, WiFi & more",
      "PNG + SVG download — print or digital ready",
      "86 print-ready QR frames — colourful shapes, premium & occasion designs",
      "5,000 scans/month",
      "Scheduled activation & auto-expiry",
      "No ads",
      "Email support",
    ],
    missing: [
      "A/B testing",
      "Smart routing",
      "REST API access",
      "Team seats",
    ],
  },
  {
    name: "Pro",
    badge: "Best for Marketers",
    badgeVariant: "success" as "default" | "success" | null,
    priceMonthly: 799,
    priceYearly: 649,
    yearlySaving: 1800,
    perDay: { monthly: "₹27", yearly: "₹22" },
    desc: "250 dynamic QR codes, A/B testing, smart routing — the full marketer's toolkit.",
    cta: "Start free trial",
    ctaVariant: "default" as const,
    href: "/signup?plan=pro",
    highlight: true,
    features: [
      "250 QR codes you can update any time",
      "Full analytics — geo & device breakdown",
      "50,000 scans/month",
      "A/B testing — split-test two destinations, compare scans",
      "Smart routing — different pages by country, device or time of day",
      "Scheduled activation & auto-expiry",
      "Bulk generate up to 100 QR codes from CSV",
      "REST API — 10,000 calls/month",
      "Webhooks — signed events to your own systems or automation tools",
      "5 team seats (incl. yours) — admin, editor & viewer roles",
      "All download formats — PNG, SVG, PDF",
      "86 print-ready QR frames — colourful shapes, premium & occasion designs",
      "Email support",
    ],
    missing: [
      "Priority phone & email support",
      "Google Drive export",
    ],
  },
  {
    name: "Business",
    badge: "Best Value",
    badgeVariant: "success" as "default" | "success" | null,
    priceMonthly: 2499,
    priceYearly: 1999,
    yearlySaving: 6000,
    perDay: { monthly: "₹83", yearly: "₹67" },
    desc: "2,000 QR codes for teams, agencies, and brands that run at scale.",
    cta: "Start free trial",
    ctaVariant: "glow" as const,
    href: "/signup?plan=business",
    highlight: false,
    features: [
      "2,000 QR codes — 8× Pro's limit",
      "Everything in Pro +",
      "500,000 scans/month",
      "20 team seats (incl. yours) — admin, editor & viewer roles",
      "White-label scan pages — your brand, not ours",
      "Bulk generate up to 5,000 QR codes from CSV",
      "100,000 API calls/month",
      "Google Drive export",
      "Priority phone & email support",
    ],
    missing: [],
  },
]

// ─── Feature comparison table data ────────────────────────────────────────────
// Competitive gap fix: QR Tiger shows a full comparison table — we now do too.

type CellValue = boolean | string

const comparisonRows: { feature: string; free: CellValue; starter: CellValue; pro: CellValue; business: CellValue }[] = [
  { feature: "Dynamic QR codes",          free: false,    starter: "50",         pro: "250",          business: "2,000" },
  { feature: "Scan analytics",            free: false,    starter: true,         pro: true,           business: true },
  { feature: "Scans per month",           free: false,    starter: "5,000",      pro: "50,000",       business: "500,000" },
  { feature: "All 16 QR types",           free: false,    starter: true,         pro: true,           business: true },
  { feature: "Custom design & logo",      free: "Colours, no logo", starter: true,         pro: true,           business: true },
  { feature: "QR frames (86 designs)",    free: false,    starter: true,         pro: true,           business: true },
  { feature: "A/B testing",               free: false,    starter: false,        pro: true,           business: true },
  { feature: "Smart routing",             free: false,    starter: false,        pro: true,           business: true },
  { feature: "Bulk QR generation",        free: false,    starter: false,        pro: "100 QRs",      business: "5,000 QRs" },
  { feature: "REST API",                  free: false,    starter: false,        pro: "10K calls/mo", business: "100K calls/mo" },
  { feature: "Team seats (incl. owner)",  free: false,    starter: false,        pro: "5 seats",      business: "20 seats" },
  { feature: "White-label scan pages",    free: false,    starter: false,        pro: false,          business: true },
  { feature: "Webhooks",                  free: false,    starter: false,        pro: true,           business: true },
  { feature: "Google Drive export",       free: false,    starter: false,        pro: false,          business: true },
  { feature: "Password-protected QR",     free: false,    starter: true,         pro: true,           business: true },
  { feature: "Schedule & expiry",         free: false,    starter: true,         pro: true,           business: true },
]

// ─── FAQ data ─────────────────────────────────────────────────────────────────
// Deliverable 7: 5 featured-snippet-targeting questions

const faqItems = [
  {
    q: "Can I switch plans any time?",
    a: "Yes. Upgrade or downgrade from your billing dashboard at any time. A paid upgrade takes effect immediately and starts a new billing period from the day you pay. A downgrade also takes effect immediately and keeps your current period's end date — your QR codes stay active.",
  },
  {
    q: "What payment methods do you accept?",
    a: "UPI, credit cards, debit cards, and net banking — all via Cashfree. Prices are in Indian Rupees (INR). No international payment or USD conversion needed.",
  },
  {
    q: "What happens to my QR codes if I downgrade?",
    a: "Your QR codes are never deleted and stay active after a downgrade. If you have more than the lower plan allows, you can't create new ones until you're back under its limit. If a paid period or trial ends without payment, the account moves to Free and dynamic QR codes are paused — pay again and they're switched back on automatically. Scan history is kept for 3 months after the account moves to Free, then deleted.",
  },
  {
    q: "Is there a free trial for paid plans?",
    a: "Yes — new accounts start with a 14-day free trial of the Pro plan. No credit card required to start. When the trial ends, the account moves to the Free plan and dynamic QR codes are paused until you choose a plan and pay.",
  },
  {
    q: "What's the difference between static and dynamic QR codes?",
    a: "A static QR code has the destination baked into the image — it can never be changed after creation. A dynamic QR code points to a redirect, so you can update the destination any time without reprinting. Dynamic QR codes also track every scan with location, device, and time data. GenXQR includes dynamic QR codes from the Starter plan.",
  },
]

// ─── Sub-components ───────────────────────────────────────────────────────────

function ComparisonCell({ value }: { value: CellValue }) {
  if (value === false) return <Minus size={15} className="text-ink-faint mx-auto" />
  if (value === true) return <Check size={15} className="text-accent mx-auto" />
  return <span className="text-ink-soft text-xs font-medium">{value}</span>
}

// Plan-card CTA button — mirrors MktButton's visual language, but stays a plain
// <button> (not MktButton/<Link>) because it must run `handlePlanCTA`'s
// localStorage-aware routing logic rather than navigate to a fixed href.
const PLAN_CTA_BASE =
  "inline-flex w-full items-center justify-center gap-2 font-medium rounded-full transition-all duration-200 whitespace-nowrap h-11 px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper-pure"
const PLAN_CTA_VARIANTS = {
  outline: "border border-line bg-paper text-ink hover:border-ink/30 hover:shadow-card",
  filled: "bg-accent text-white hover:bg-accent-ink shadow-[0_12px_34px_-12px_rgba(91,75,255,0.65)]",
}

function planBadgePill(variant: "default" | "success" | null, highlight: boolean) {
  if (highlight) return "bg-accent text-white"
  if (variant === "success") return "bg-accent-soft text-accent"
  return "bg-ink text-paper"
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const navigate = useNavigate()
  const [yearly, setYearly] = useState(false)
  const [showComparison, setShowComparison] = useState(false)

  function handlePlanCTA(plan: typeof plans[0]) {
    const planKey = plan.name.toLowerCase()
    if (plan.priceMonthly === 0) {
      navigate("/generate")
      return
    }
    if (localStorage.getItem("access_token")) {
      navigate(`/app/billing?upgrade=${planKey}`)
    } else {
      navigate(`/signup?plan=${planKey}`)
    }
  }

  return (
    <div className="pb-24">
      {/* ── Deliverable 1 & 2: Title + Meta ── */}
      <SEOMeta
        title="QR Code Generator Pricing — Free to ₹2,499/mo"
        description="Compare GenXQR plans — free QR codes to unlimited dynamic QR with analytics. INR pricing, UPI accepted, 14-day free trial. No hidden fees. Start free today."
        url="/pricing"
        jsonLd={PRICING_JSON_LD}
      />

      {/* ── Header ── */}
      <PageHero
        eyebrow="INR pricing · UPI accepted · 14-day free trial"
        title={
          <>
            Honest pricing.{" "}
            <span className="text-accent">Pay only for what you use.</span>
          </>
        }
        intro={
          <>
            From a single free QR code to unlimited dynamic QR codes for your whole team —
            every paid plan includes{" "}
            <Link to="/dynamic-qr" className="text-accent underline underline-offset-2 hover:text-accent-ink">
              dynamic QR codes
            </Link>{" "}
            and{" "}
            <Link to="/features" className="text-accent underline underline-offset-2 hover:text-accent-ink">
              scan analytics
            </Link>
            .
          </>
        }
      >
        {/* Billing toggle */}
        <div className="inline-flex items-center gap-1 rounded-full border border-line bg-paper-pure p-1.5">
          <button
            onClick={() => setYearly(false)}
            className={cn(
              "px-5 py-2 rounded-full text-sm font-medium transition-all",
              !yearly ? "bg-ink text-paper" : "text-ink-soft hover:text-ink",
            )}
          >
            Monthly
          </button>
          <button
            onClick={() => setYearly(true)}
            className={cn(
              "px-5 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2",
              yearly ? "bg-ink text-paper" : "text-ink-soft hover:text-ink",
            )}
          >
            Yearly
            <span className="inline-flex items-center rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
              Save up to 20%
            </span>
          </button>
        </div>
      </PageHero>

      <MktContainer>

        {/* ── Plan cards ── */}
        <Reveal>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            {plans.map((plan) => {
              const displayPrice = plan.priceMonthly === 0
                ? "Free"
                : `₹${yearly ? plan.priceYearly : plan.priceMonthly}`

              return (
                <div
                  key={plan.name}
                  className={cn(
                    "relative flex flex-col rounded-[22px] border p-7 bg-paper-pure transition-all duration-200",
                    plan.highlight
                      ? "border-accent shadow-lift"
                      : "border-line shadow-card hover:-translate-y-0.5 hover:shadow-lift hover:border-ink/10",
                  )}
                >
                  {/* Badge */}
                  {plan.badge && (
                    <span
                      className={cn(
                        "absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium",
                        planBadgePill(plan.badgeVariant, plan.highlight),
                      )}
                    >
                      {plan.badge}
                    </span>
                  )}

                  {/* Plan name + desc + price */}
                  <div className="mb-6">
                    <h2 className="font-display font-bold text-xl text-ink mb-1">{plan.name}</h2>
                    <p className="text-ink-faint text-xs mb-4 leading-relaxed md:min-h-[3.75rem] lg:min-h-[5rem]">{plan.desc}</p>

                    <div className="flex items-end gap-1">
                      <span className="font-mono text-4xl font-semibold text-ink">{displayPrice}</span>
                      {plan.priceMonthly > 0 && (
                        <span className="text-ink-faint text-sm pb-1">/mo</span>
                      )}
                    </div>

                    {/* Yearly savings callout */}
                    {plan.priceMonthly > 0 && yearly && plan.yearlySaving > 0 && (
                      <p className="text-live text-xs font-medium mt-1">
                        Save ₹{plan.yearlySaving.toLocaleString("en-IN")}/year
                      </p>
                    )}

                    {/* Crossed-out monthly price when yearly selected */}
                    {plan.priceMonthly > 0 && yearly && (
                      <p className="text-ink-faint text-xs mt-0.5 line-through">
                        ₹{plan.priceMonthly}/mo billed monthly
                      </p>
                    )}

                    {/* Per-day equivalent. The free plan has none, so it keeps an
                        invisible stand-in — without it that card's CTA rides 20px
                        higher than the rest of the row. */}
                    {plan.perDay && plan.priceMonthly > 0 ? (
                      <p className="text-ink-faint text-xs mt-1">
                        Less than {yearly ? plan.perDay.yearly : plan.perDay.monthly}/day
                      </p>
                    ) : (
                      <p aria-hidden="true" className="invisible text-xs mt-1">&nbsp;</p>
                    )}
                  </div>

                  {/* CTA */}
                  <button
                    onClick={() => handlePlanCTA(plan)}
                    className={cn(
                      PLAN_CTA_BASE,
                      "mb-6",
                      plan.ctaVariant === "outline" ? PLAN_CTA_VARIANTS.outline : PLAN_CTA_VARIANTS.filled,
                    )}
                  >
                    {plan.cta}
                    <ChevronRight size={14} className="shrink-0" />
                  </button>

                  {/* Feature list */}
                  <div className="flex-1 space-y-3">
                    {plan.features.map((f) => (
                      <div key={f} className="flex items-start gap-2.5 text-sm">
                        <Check size={14} className="text-live shrink-0 mt-0.5" />
                        <span className="text-ink-soft">{f}</span>
                      </div>
                    ))}
                    {plan.missing.map((f) => (
                      <div key={f} className="flex items-start gap-2.5 text-sm opacity-40">
                        <X size={14} className="text-ink-faint shrink-0 mt-0.5" />
                        <span className="text-ink-faint">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </Reveal>

        {/* ── Risk reducers ── */}
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 mb-16 text-ink-faint text-sm">
          <span className="flex items-center gap-2"><Check size={13} className="text-live" /> No credit card for free plan</span>
          <span className="flex items-center gap-2"><Check size={13} className="text-live" /> Cancel any time — no lock-in</span>
          <span className="flex items-center gap-2"><Check size={13} className="text-live" /> UPI, net banking &amp; cards accepted</span>
          <span className="flex items-center gap-2"><Check size={13} className="text-live" /> 14-day Pro trial — no card needed</span>
          <span className="flex items-center gap-2"><Check size={13} className="text-live" /> Your scan data is yours — export it as CSV</span>
        </div>

        {/* ── Feature comparison table ── */}
        {/* Competitive gap fix: QR Tiger and Beaconstac both show full comparison tables */}
        <div className="mb-16">
          <div className="text-center mb-6">
            <button
              onClick={() => setShowComparison((v) => !v)}
              className="inline-flex items-center gap-2 text-accent hover:text-accent-ink text-sm font-medium transition-colors"
            >
              {showComparison ? "Hide" : "Show"} full feature comparison
              <ChevronDown
                size={15}
                className={cn("transition-transform duration-300", showComparison && "rotate-180")}
              />
            </button>
          </div>

          {showComparison && (
            <div className="overflow-x-auto rounded-2xl border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-paper-pure">
                    <th className="text-left px-5 py-4 text-ink-faint font-medium w-1/3">Feature</th>
                    {plans.map((p) => (
                      <th key={p.name} className={cn(
                        "text-center px-4 py-4 font-semibold",
                        p.highlight ? "text-accent" : "text-ink-soft",
                      )}>
                        {p.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row, i) => (
                    <tr
                      key={row.feature}
                      className={cn(
                        "border-b border-line/60 transition-colors hover:bg-ink/[0.02]",
                        i % 2 === 0 ? "bg-transparent" : "bg-ink/[0.015]",
                      )}
                    >
                      <td className="px-5 py-3.5 text-ink-faint">{row.feature}</td>
                      <td className="px-4 py-3.5 text-center"><ComparisonCell value={row.free} /></td>
                      <td className="px-4 py-3.5 text-center"><ComparisonCell value={row.starter} /></td>
                      <td className={cn("px-4 py-3.5 text-center", plans[2].highlight && "bg-accent/5")}>
                        <ComparisonCell value={row.pro} />
                      </td>
                      <td className="px-4 py-3.5 text-center"><ComparisonCell value={row.business} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Enterprise ── */}
        <MktCard interactive={false} className="p-8 mb-16 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="font-display font-bold text-ink text-2xl">Enterprise</h2>
              <span className="inline-flex items-center rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
                Custom pricing
              </span>
            </div>
            <p className="text-ink-soft max-w-lg text-sm leading-relaxed">
              Need white-label QR codes, a dedicated success manager,
              or volume pricing across 10+ team seats?{" "}
              <Link to="/features" className="text-accent underline underline-offset-2 hover:text-accent-ink">
                See all enterprise features
              </Link>{" "}
              or talk to us directly.
            </p>
          </div>
          <MktButton href="/contact" variant="accent" size="lg">
            Talk to sales
            <ChevronRight size={15} />
          </MktButton>
        </MktCard>

        {/* ── FAQ ── */}
        {/* Deliverable 7: 5 featured-snippet questions */}
        <div className="max-w-2xl mx-auto">
          <SectionHead
            eyebrow="FAQ"
            title="Pricing questions answered"
            intro={
              <>
                More questions?{" "}
                <Link to="/faq" className="text-accent underline underline-offset-2 hover:text-accent-ink">
                  Visit the full FAQ →
                </Link>
              </>
            }
            align="center"
          />

          <FaqAccordion items={faqItems} className="mt-10" />
        </div>

        {/* ── Final CTA ── */}
        {/* Deliverable 5: primary + secondary CTA */}
        <div className="mt-20 text-center">
          <div className="rounded-3xl border border-line bg-paper-pure shadow-card p-10 max-w-2xl mx-auto relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-accent/10 to-accent/0 pointer-events-none" />
            <div className="relative">
              <h2 className="font-display font-bold text-2xl md:text-3xl text-ink mb-3">
                Your first QR code is free.
              </h2>
              <p className="text-ink-soft text-sm mb-8 max-w-sm mx-auto">
                No credit card. No commitment. See your{" "}
                <Link to="/features" className="text-accent underline underline-offset-2 hover:text-accent-ink">
                  scan analytics
                </Link>{" "}
                update the moment someone scans.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <MktButton href="/signup" variant="accent" size="lg">
                  Create Your First QR Code — Free
                  <ChevronRight size={15} />
                </MktButton>
                <MktButton href="/generate" variant="outline" size="lg">
                  Try the free generator →
                </MktButton>
              </div>
              <p className="text-ink-faint text-xs mt-5">
                No credit card · UPI &amp; net banking accepted · Cancel any time
              </p>
            </div>
          </div>
        </div>

      </MktContainer>
    </div>
  )
}
