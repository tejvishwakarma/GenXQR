import {
  Users, Globe2, Sparkles, Server, ArrowRight,
  ShieldCheck, RefreshCw, BarChart3, IndianRupee,
  Zap, MapPin, Clock, Linkedin, User,
} from "lucide-react"
import { SEOMeta } from "@/components/SEOMeta"
import { cn } from "@/lib/utils"
import { MktContainer, SectionHead, MktButton, MktCard, IconTile, Eyebrow, FinderGlyph, type IconTint } from "@/components/marketing/ui"
import { PageHero } from "@/components/marketing/PageHero"
import { FaqAccordion } from "@/components/marketing/FaqAccordion"

// ─── JSON-LD schema ───────────────────────────────────────────────────────────
// Deliverable 8: Organization + SoftwareApplication + FAQPage

const ABOUT_JSON_LD = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "GenXQR",
    "url": "https://genxqr.streamsnatcher.com",
    "logo": "https://genxqr.streamsnatcher.com/logo.png",
    "description": "GenXQR is an Indian dynamic QR code generator that lets businesses create, edit, track, and control QR codes — including editing the destination after printing.",
    "foundingDate": "2026",
    "foundingLocation": {
      "@type": "Place",
      "addressCountry": "IN",
    },
    "areaServed": "IN",
    "priceRange": "₹0 – ₹9,999/month",
  },
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
        "description": "50 dynamic QR codes, full scan analytics, scheduled expiry, CSV export.",
      },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "Where is GenXQR based?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "GenXQR is built and operated in India. It is designed specifically for Indian businesses — with INR pricing, UPI payment support, and use cases built around the Indian market: restaurant menus, D2C packaging, event badges, real estate signboards, and more. Our infrastructure is optimised for low-latency scans across Indian cities.",
        },
      },
      {
        "@type": "Question",
        "name": "Is GenXQR free?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes — GenXQR has a free plan for static QR codes, no credit card required. Paid plans start at ₹299/month (Starter) and add 50 dynamic QR codes, full scan analytics by city and device, scheduled expiry, and CSV export — smart routing is available from the Pro plan. All plans accept UPI, debit, and credit cards.",
        },
      },
      {
        "@type": "Question",
        "name": "What is GenXQR used for?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "GenXQR is used to create QR codes that can be edited after printing and track every scan by city, device, and time. Common uses include: restaurant digital menus (update prices without reprinting), product packaging (fix outdated guides without a recall), event badges (change speaker sessions after printing), campaign flyers (swap landing pages mid-campaign), business cards (update contact details), and WiFi sharing. GenXQR supports 16 QR content types.",
        },
      },
      {
        "@type": "Question",
        "name": "Is GenXQR safe to use?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. GenXQR uses HTTPS across all connections, bcrypt password hashing, short-lived JWT authentication tokens with HttpOnly refresh cookies, and rate limiting on all endpoints. QR codes can be password-protected and set to expire automatically after a date or scan count. No personal data from the person scanning is collected — only aggregate scan metadata (city, device type, OS, browser).",
        },
      },
      {
        "@type": "Question",
        "name": "Does GenXQR work in India?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes — GenXQR is built for India. Pricing is in Indian Rupees (INR) starting at ₹299/month. Payments accept UPI, Razorpay, debit cards, and credit cards. Scan analytics track Indian cities across all states. The platform is used by restaurants, retailers, event organisers, clinics, schools, and real estate agents across India. Customer support is available in English.",
        },
      },
    ],
  },
]

// ─── Values data ──────────────────────────────────────────────────────────────
// Deliverable 4: Rewritten benefit-led, India-first
// icon/tint replace the old JSX-element + literal-color-class shape so the
// cards render through the shared <IconTile> tint system instead of raw
// blue/emerald/violet/amber Tailwind classes. Title/desc copy is untouched.

const values = [
  {
    icon: Users,
    tint: "blue" as IconTint,
    title: "Built for operators, not developers",
    desc: "The restaurant owner updating prices at 11pm shouldn't need a developer. Every feature in GenXQR is designed to be done in under 60 seconds, without technical knowledge.",
  },
  {
    icon: Server,
    tint: "emerald" as IconTint,
    title: "A broken scan is a broken promise",
    desc: "Your QR code is on a printed flyer, a menu, or a product in the field. If it fails, there is no fallback. We treat every scan as a commitment we have to honour.",
  },
  {
    icon: Sparkles,
    tint: "violet" as IconTint,
    title: "Features that save money, not just look good",
    desc: "We ship capabilities with a clear ROI: editing after printing saves reprinting costs; analytics tell you which campaign is working before you spend more. That's the standard.",
  },
  {
    icon: Globe2,
    tint: "amber" as IconTint,
    title: "Indian pricing for Indian businesses",
    desc: "Global tools charge in USD and ignore the Indian market. GenXQR is priced in INR, accepts UPI, and is built around use cases that matter here — not Silicon Valley playbooks.",
  },
]

// ─── Milestones data ──────────────────────────────────────────────────────────
// Q1 2026 = LIVE NOW. Q2 and Q3 are upcoming roadmap milestones.

type Milestone = {
  quarter: string
  label: string
  title: string
  desc: string
  status: "live" | "upcoming" | "planned"
}

const milestones: Milestone[] = [
  {
    quarter: "Q1 2026",
    label: "Live now",
    title: "GenXQR launched",
    desc: "The full platform shipped: dynamic QR codes, real-time scan analytics (city, device, OS), smart routing, A/B testing, team workspaces, REST API, and 16 QR types. Everything you see on this site is live today.",
    status: "live",
  },
  {
    quarter: "Q2 2026",
    label: "Coming soon",
    title: "Integrations & automation",
    desc: "Native integrations with Zapier, Google Sheets, and Notion. Deeper webhook controls, campaign tagging, and automated scan-based email triggers — so your QR data connects to the tools you already use.",
    status: "upcoming",
  },
  {
    quarter: "Q3 2026",
    label: "On the roadmap",
    title: "White-label & enterprise",
    desc: "Custom domain QR codes, white-label dashboard for agencies, SSO, and enterprise-grade audit logging — so large teams and resellers can run GenXQR under their own brand.",
    status: "planned",
  },
]

// ─── Founders data ────────────────────────────────────────────────────────────
// Replace placeholder values with real names, roles, bios, and image paths.

type Founder = {
  name: string
  role: string
  bio: string
  image: string | null   // set to imported image path when ready
  linkedin: string | null
}

const founders: Founder[] = [
  {
    name: "Founder Name",            // TODO: replace
    role: "Co-Founder & CEO",
    bio: "Drives product vision and growth strategy. Previously built and scaled [Company]. Obsessed with making offline-to-digital tools accessible for every Indian business.",
    image: null,                     // TODO: replace with imported image
    linkedin: null,                  // TODO: replace with LinkedIn URL
  },
  {
    name: "Founder Name",            // TODO: replace
    role: "Co-Founder & CTO",
    bio: "Leads engineering and infrastructure. Built GenXQR's scan pipeline to handle real-time analytics at scale. Believes the best infrastructure is the kind you never notice.",
    image: null,                     // TODO: replace with imported image
    linkedin: null,                  // TODO: replace with LinkedIn URL
  },
]

// ─── FAQ data ─────────────────────────────────────────────────────────────────
// Deliverable 7: 5 questions, Cluster D featured snippet targeting

const faqs = [
  {
    q: "Where is GenXQR based?",
    a: "GenXQR is built and operated in India — designed specifically for Indian businesses with INR pricing, UPI payment support, and use cases built around the Indian market: restaurant menus, D2C packaging, event badges, real estate signboards, and more. Our infrastructure is optimised for low-latency QR scans across Indian cities.",
  },
  {
    q: "Is GenXQR free?",
    a: "Yes — GenXQR has a free plan for static QR codes, no credit card required. Paid plans start at ₹299/month (Starter) with 50 dynamic QR codes, full scan analytics by city and device, scheduled expiry, and CSV export — smart routing is available from the Pro plan. All plans accept UPI, debit, and credit cards.",
  },
  {
    q: "What is GenXQR used for?",
    a: "GenXQR is used to create QR codes that can be edited after printing and track every scan by city, device, and time. Common uses: restaurant digital menus (update prices without reprinting), product packaging (fix outdated guides without a recall), event badges (change sessions after printing), campaign flyers (swap landing pages mid-campaign), business cards, and WiFi sharing. GenXQR supports 16 QR content types.",
  },
  {
    q: "Is GenXQR safe to use?",
    a: "Yes. GenXQR uses HTTPS on all connections, bcrypt password hashing, short-lived JWT authentication with HttpOnly refresh cookies, and rate limiting on every endpoint. QR codes can be password-protected and set to expire after a date or scan count. No personal data from the person scanning is collected — only aggregate metadata (city, device type, OS, browser).",
  },
  {
    q: "Does GenXQR work in India?",
    a: "Yes — GenXQR is built for India. Pricing starts at ₹299/month in INR. Payments accept UPI, debit cards, and credit cards. Scan analytics cover Indian cities across all states. The platform is used by restaurants, retailers, event organisers, clinics, schools, and real estate agents across India.",
  },
]

// ─── Local presentational data (not user-facing copy sets called out above) ──

const metrics = [
  { icon: RefreshCw, tint: "blue" as IconTint, value: "< 1s", label: "destination update time" },
  { icon: BarChart3, tint: "violet" as IconTint, value: "50+", label: "countries in scan analytics" },
  { icon: IndianRupee, tint: "emerald" as IconTint, value: "₹299", label: "per month to start" },
  { icon: Zap, tint: "amber" as IconTint, value: "16", label: "QR content types" },
]

const missionPoints = [
  "Edit any QR destination in under one second",
  "Turn every scan into city, device, and time data",
  "Make dynamic QR affordable for Indian SMBs at ₹299/month",
]

const indiaComparisons = [
  { label: "Pricing", ours: "INR, from ₹299/mo", theirs: "USD, $15–$100/mo" },
  { label: "Payments", ours: "UPI, debit, credit", theirs: "Credit card only" },
  { label: "Analytics", ours: "Indian city data", theirs: "Country-level only" },
  { label: "Support", ours: "India timezone", theirs: "US/EU hours" },
]

// ─── Page component ───────────────────────────────────────────────────────────

export default function AboutPage() {
  return (
    <div className="bg-paper">
      {/*
        Deliverable 1: SEO title (56 chars) — target keyword: "qr code generator"
        Deliverable 2: Meta description (150 chars) — benefit-led with CTA
        Deliverable 8: JSON-LD — Organization + SoftwareApplication + FAQPage
      */}
      <SEOMeta
        title="About GenXQR | QR Code Generator for Indian Businesses"
        description="GenXQR helps Indian businesses create QR codes they can edit after printing and track by city and device. Free plan available, paid plans from ₹299/month."
        url="/about"
        jsonLd={ABOUT_JSON_LD}
      />

      {/* ── Hero ─────────────────────────────────────────────────────────────
        Deliverable 3: H1 rewrite — differs from title tag
        Deliverable 6: 3 A/B variants
          Variant A (active): "We built GenXQR because one reprinted QR code is one too many"
          Variant B: "Dynamic QR Codes Should Cost Less Than Reprinting. We Made Them."
          Variant C: "Made in India. Built for Every Business Tired of Reprinting."
      */}
      <PageHero
        eyebrow="Why we built GenXQR"
        title={
          <>
            We built GenXQR because{" "}
            <span className="text-accent">one reprinted QR code is one too many</span>
          </>
        }
        intro={
          <>
            A restaurant reprints 500 menus when the price changes. An event organiser
            reorders 8,000 badges when a speaker cancels. A D2C brand scraps 50,000 flyers
            because the offer expired. Every one of these is a problem a dynamic QR code
            solves in 30 seconds. We built GenXQR to make that the default.
          </>
        }
        actions={
          <>
            <MktButton href="/generate" variant="accent" size="lg">
              Create Your First QR Code — Free
              <ArrowRight size={16} />
            </MktButton>
            <MktButton href="/use-cases" variant="outline" size="lg">
              See how businesses use it →
            </MktButton>
          </>
        }
      />

      {/* ── Mission + Metrics ──────────────────────────────────────────────── */}
      {/* Deliverable 4: "What we optimize for" rewritten with real numbers */}
      <section className="py-16 md:py-20 bg-paper-pure border-y border-line">
        <MktContainer>
          <div className="grid lg:grid-cols-2 gap-8 items-stretch">
            <MktCard interactive={false} className="p-8">
              <h2 className="text-2xl md:text-3xl font-bold font-display tracking-tightest text-ink mb-4">
                Our mission
              </h2>
              <p className="text-ink-soft leading-relaxed mb-6">
                Give every business — a one-table café or a 50-branch chain — the ability
                to update a QR code after it's already printed, and see exactly who scanned
                it, from which city, on which device, and when.
              </p>
              <div className="space-y-3">
                {missionPoints.map((item) => (
                  <div key={item} className="flex items-start gap-2 text-ink text-sm">
                    <ShieldCheck size={15} className="text-accent shrink-0 mt-0.5" />
                    {item}
                  </div>
                ))}
              </div>
            </MktCard>

            <MktCard interactive={false} className="p-8">
              <h2 className="text-2xl md:text-3xl font-bold font-display tracking-tightest text-ink mb-5">
                What we're measured by
              </h2>
              <div className="grid grid-cols-2 gap-4">
                {metrics.map((metric) => (
                  <div key={metric.label} className="rounded-xl border border-line bg-paper px-4 py-4">
                    <IconTile icon={metric.icon} tint={metric.tint} size="sm" className="mb-3" />
                    <div className="font-mono text-ink font-bold text-xl">{metric.value}</div>
                    <div className="text-ink-faint text-xs mt-1">{metric.label}</div>
                  </div>
                ))}
              </div>
            </MktCard>
          </div>
        </MktContainer>
      </section>

      {/* ── India-first section ────────────────────────────────────────────── */}
      {/* Deliverable 4: India-first trust signal, competitive differentiator */}
      <section className="py-16 md:py-24 bg-paper">
        <MktContainer>
          <MktCard interactive={false} className="p-8 md:p-10 relative overflow-hidden">
            <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-accent/10 blur-3xl pointer-events-none" />
            <div className="relative grid md:grid-cols-2 gap-8 items-center">
              <div>
                <Eyebrow className="mb-4 inline-flex">
                  <MapPin size={13} />
                  Made for India
                </Eyebrow>
                <h2 className="text-2xl md:text-3xl font-bold font-display tracking-tightest text-ink mb-4">
                  Global QR tools charge in USD.<br />
                  <span className="text-accent">We charge in INR.</span>
                </h2>
                <p className="text-ink-soft text-sm leading-relaxed mb-4">
                  Most QR code platforms are built for the US and European market — with USD
                  pricing, Stripe-only payments, and use cases that don't reflect Indian
                  businesses. GenXQR is built from the ground up for India: INR pricing,
                  UPI payments, and a platform shaped by Indian SMB workflows.
                </p>
                <p className="text-ink-soft text-sm leading-relaxed">
                  From a dhaba in Pune updating its menu, to a D2C brand in Bengaluru
                  running a Diwali flyer campaign, to a hospital in Delhi sharing appointment
                  links — GenXQR is priced and designed for every one of them.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {indiaComparisons.map((row) => (
                  <MktCard key={row.label} interactive={false} className="p-4">
                    <div className="font-mono text-ink-faint text-[10px] font-bold uppercase tracking-wider mb-2">
                      {row.label}
                    </div>
                    <div className="text-accent text-xs font-semibold mb-1">✓ {row.ours}</div>
                    <div className="text-ink-faint text-xs line-through">{row.theirs}</div>
                  </MktCard>
                ))}
              </div>
            </div>
          </MktCard>
        </MktContainer>
      </section>

      {/* ── Core values ────────────────────────────────────────────────────── */}
      {/* Deliverable 4: Values rewritten — benefit-led, no corporate-speak */}
      <section className="py-16 md:py-24 bg-paper-pure border-y border-line">
        <MktContainer>
          <SectionHead
            eyebrow="What we stand for"
            title={<>The principles behind every <span className="text-accent">product decision</span></>}
            intro="Not corporate values hung on a wall. Actual decisions we make every week about what to build, what to skip, and how to price it."
            align="center"
          />
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {values.map((value) => (
              <MktCard key={value.title} className="p-6">
                <IconTile icon={value.icon} tint={value.tint} className="mb-5" />
                <h3 className="text-ink font-semibold text-base mb-2">{value.title}</h3>
                <p className="text-ink-soft text-sm leading-relaxed">{value.desc}</p>
              </MktCard>
            ))}
          </div>
        </MktContainer>
      </section>

      {/* ── Journey / Timeline ─────────────────────────────────────────────── */}
      <section className="py-16 md:py-24 bg-paper">
        <MktContainer>
          <SectionHead
            eyebrow="Roadmap"
            title={<>How we got here</>}
            intro="From a frustrating reprint run to a full campaign engine."
            align="center"
          />
          <div className="mt-12 grid md:grid-cols-3 gap-5">
            {milestones.map((m) => {
              const isLive = m.status === "live"
              const isUpcoming = m.status === "upcoming"
              const isPlanned = m.status === "planned"

              return (
                <div
                  key={m.title}
                  className={cn(
                    "rounded-2xl border p-6 relative transition-all",
                    isLive && "border-accent/40 bg-accent-soft",
                    isUpcoming && "border-line bg-paper-pure",
                    isPlanned && "border-line/60 bg-paper-pure/60 opacity-70",
                  )}
                >
                  {/* Status badge */}
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-mono text-ink-faint text-[10px] font-bold uppercase tracking-widest">
                      {m.quarter}
                    </span>
                    {isLive && (
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-live bg-live/10 border border-live/20 px-2 py-0.5 rounded-full">
                        {/* Pulsing dot */}
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-live opacity-75" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-live" />
                        </span>
                        Live now
                      </span>
                    )}
                    {isUpcoming && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-ink-soft bg-ink/[0.04] border border-line px-2 py-0.5 rounded-full">
                        <Clock size={9} />
                        Coming soon
                      </span>
                    )}
                    {isPlanned && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-ink-faint bg-ink/[0.03] border border-line/60 px-2 py-0.5 rounded-full">
                        <Clock size={9} />
                        Roadmap
                      </span>
                    )}
                  </div>

                  <h3 className={cn("font-semibold mb-2", isLive ? "text-ink" : "text-ink-soft")}>
                    {m.title}
                  </h3>
                  <p className={cn("text-sm leading-relaxed", isLive ? "text-ink-soft" : "text-ink-faint")}>
                    {m.desc}
                  </p>
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center justify-center gap-5 mt-10 pt-6 border-t border-line">
            <span className="flex items-center gap-1.5 text-xs text-ink-faint">
              <span className="w-2 h-2 rounded-full bg-live" />
              Shipped
            </span>
            <span className="flex items-center gap-1.5 text-xs text-ink-faint">
              <span className="w-2 h-2 rounded-full bg-accent" />
              In progress
            </span>
            <span className="flex items-center gap-1.5 text-xs text-ink-faint">
              <span className="w-2 h-2 rounded-full bg-ink/20" />
              Planned
            </span>
          </div>
        </MktContainer>
      </section>

      {/* ── Founders ───────────────────────────────────────────────────────── */}
      {/* Replace image={null} with imported image paths when photos are ready. */}
      {/* Replace name, role, bio, and linkedin with real values.             */}
      <section className="py-16 md:py-24 bg-paper-pure border-y border-line">
        <MktContainer className="max-w-3xl">
          <SectionHead
            eyebrow="The people behind GenXQR"
            title={<>Built by people who <span className="text-accent">felt the problem first</span></>}
            intro="We didn't build GenXQR as a side project. We built it because we were the ones reprinting menus, updating flyers, and wishing QR codes weren't permanent."
            align="center"
          />

          <div className="mt-12 flex flex-col sm:flex-row gap-6 justify-center">
            {founders.map((founder) => (
              <MktCard key={founder.role} className="p-8 flex-1 flex flex-col items-center text-center">
                {/* Avatar — swap div for <img> when photo is ready */}
                <div className="relative mb-5">
                  {founder.image ? (
                    <img
                      src={founder.image}
                      alt={founder.name}
                      className="w-24 h-24 rounded-full object-cover ring-2 ring-accent/30"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-ink/[0.04] border-2 border-line flex items-center justify-center ring-2 ring-accent/20">
                      <User size={36} className="text-ink-faint" />
                    </div>
                  )}
                  {/* Online / active indicator */}
                  <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-paper-pure border-2 border-line flex items-center justify-center">
                    <span className="w-2 h-2 rounded-full bg-live" />
                  </span>
                </div>

                {/* Name + role */}
                <h3 className="text-ink font-bold text-lg mb-0.5">{founder.name}</h3>
                <p className="text-accent text-xs font-semibold uppercase tracking-wider mb-4">
                  {founder.role}
                </p>

                {/* Bio */}
                <p className="text-ink-soft text-sm leading-relaxed flex-1">{founder.bio}</p>

                {/* LinkedIn */}
                {founder.linkedin ? (
                  <a
                    href={founder.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-5 inline-flex items-center gap-1.5 text-xs text-ink-faint hover:text-accent transition-colors"
                  >
                    <Linkedin size={14} />
                    LinkedIn
                  </a>
                ) : (
                  <span className="mt-5 inline-flex items-center gap-1.5 text-xs text-ink-faint/50">
                    <Linkedin size={14} />
                    LinkedIn — coming soon
                  </span>
                )}
              </MktCard>
            ))}
          </div>
        </MktContainer>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────────── */}
      {/* Deliverable 7: 5 questions targeting trust + Cluster D featured snippets */}
      <section className="py-16 md:py-24 bg-paper">
        <MktContainer className="max-w-3xl">
          <SectionHead
            eyebrow="About GenXQR"
            title={<>Questions people ask <span className="text-accent">before they trust us</span></>}
            align="center"
          />
          <div className="mt-10">
            <FaqAccordion items={faqs} />
          </div>
        </MktContainer>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────────── */}
      {/* Deliverable 5: CTAs rewritten — no "sign up", primary to /generate */}
      {/* Deliverable 9: Internal links — /generate, /pricing */}
      <section className="py-16 md:py-24 bg-paper-pure border-t border-line">
        <MktContainer>
          <div className="relative overflow-hidden rounded-[32px] bg-band px-6 py-16 md:px-16 md:py-20 text-center">
            <div className="pointer-events-none absolute -bottom-24 left-1/2 -translate-x-1/2 h-72 w-[560px] rounded-full bg-accent/25 blur-3xl" />
            <div className="relative">
              <h2 className="text-2xl md:text-4xl font-bold font-display tracking-tightest leading-[1.05] text-band-fg mb-4">
                Your next QR code shouldn't need{" "}
                <span className="text-accent">a reprint to fix</span>
              </h2>
              <p className="text-band-fg/70 max-w-xl mx-auto mb-3">
                Whether you run one location or fifty markets, GenXQR gives you editable
                QR codes and real scan data — from the first day, on the free plan.
              </p>
              <p className="text-band-fg/50 text-xs mb-8">
                No credit card · UPI accepted · Cancel any time · Plans from ₹299/month
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <MktButton href="/generate" variant="accent" size="lg">
                  Create Your First QR Code — Free
                  <ArrowRight size={16} />
                </MktButton>
                <MktButton href="/pricing" variant="outlineOnDark" size="lg">
                  See all plans
                </MktButton>
              </div>
            </div>
            <FinderGlyph size={22} className="absolute top-8 right-8 text-white/15" />
          </div>
        </MktContainer>
      </section>
    </div>
  )
}
