import { useState, useRef, type MouseEvent } from "react"
import { Check, ArrowRight, Star } from "lucide-react"
import { MktContainer, SectionHead, MktButton, Eyebrow, FinderGlyph } from "./ui"
import { cn } from "@/lib/utils"

// ── Testimonials ──────────────────────────────────────────────────────────────
const QUOTES = [
  {
    quote:
      "We reprinted 4,000 table tents once. With GenXQR we just change the link — menus update the same morning, and we finally see which outlets scan most.",
    name: "Aarav Mehta",
    title: "Head of Ops, a regional café chain",
    stat: "4,000 codes, zero reprints",
  },
  {
    quote:
      "The analytics sold it. Location and device data per campaign, in rupees, with a real API — we automated our whole print-to-web flow through n8n.",
    name: "Priya Nair",
    title: "Growth Lead, D2C brand",
    stat: "1.2M scans tracked",
  },
]

export function Testimonials() {
  return (
    <section className="py-20 md:py-28 bg-paper">
      <MktContainer>
        <SectionHead eyebrow="Proof" title={<>Teams switch for the tracking, stay for the control</>} align="center" />
        <div className="mt-14 grid md:grid-cols-2 gap-6">
          {QUOTES.map((q) => (
            <figure key={q.name} className="flex flex-col rounded-[24px] border border-line bg-paper-pure p-8 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift hover:border-ink/10">
              <div className="flex gap-0.5 text-accent">
                {Array.from({ length: 5 }).map((_, i) => <Star key={i} size={16} fill="currentColor" />)}
              </div>
              <blockquote className="mt-5 text-lg leading-relaxed text-ink">“{q.quote}”</blockquote>
              <figcaption className="mt-6 flex items-center justify-between border-t border-line pt-5">
                <div>
                  <div className="font-medium text-ink">{q.name}</div>
                  <div className="text-sm text-ink-faint">{q.title}</div>
                </div>
                <div className="font-mono text-[12px] text-accent text-right">{q.stat}</div>
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-ink-faint">Sample testimonials shown for layout — replace with your own before launch.</p>
      </MktContainer>
    </section>
  )
}

// ── Pricing ───────────────────────────────────────────────────────────────────
type Plan = {
  name: string
  inr: string
  usd: string
  tagline: string
  features: string[]
  cta: string
  href: string
  featured?: boolean
}
const PLANS: Plan[] = [
  { name: "Free", inr: "0", usd: "0", tagline: "For trying it out", cta: "Start free", href: "/signup",
    features: ["4 static QR types", "PNG download", "No account needed", "Free forever"] },
  { name: "Starter", inr: "299", usd: "4", tagline: "For small businesses", cta: "Choose Starter", href: "/signup",
    features: ["50 dynamic QR codes", "5,000 scans / mo", "90-day analytics", "1 GB storage"] },
  { name: "Pro", inr: "799", usd: "10", tagline: "For growing teams", cta: "Choose Pro", href: "/signup", featured: true,
    features: ["250 dynamic QR codes", "50,000 scans / mo", "Bulk + A/B + API", "5 team seats"] },
  { name: "Business", inr: "2,499", usd: "30", tagline: "For scale", cta: "Choose Business", href: "/signup",
    features: ["2,000 dynamic QR codes", "500,000 scans / mo", "White-label + priority", "20 team seats"] },
]

export function MarketingPricing() {
  const [cur, setCur] = useState<"inr" | "usd">("inr")
  const sym = cur === "inr" ? "₹" : "$"
  return (
    <section id="mkt-pricing" className="py-20 md:py-28 bg-paper-pure border-y border-line">
      <MktContainer>
        <SectionHead
          eyebrow="Pricing"
          title={<>Fair, transparent pricing — in ₹ and $</>}
          intro="No sales gate, no surprise upsells. Start free, upgrade only when you outgrow it."
          align="center"
        />

        <div className="mt-8 flex justify-center">
          <div className="inline-flex items-center rounded-full border border-line bg-paper p-1">
            {(["inr", "usd"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCur(c)}
                className={cn(
                  "px-5 h-9 rounded-full text-sm font-medium transition-colors",
                  cur === c ? "bg-ink text-paper" : "text-ink-soft hover:text-ink",
                )}
              >
                {c === "inr" ? "₹ INR" : "$ USD"}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={cn(
                "relative flex flex-col rounded-[22px] border p-7 bg-paper transition-all duration-200",
                p.featured
                  ? "border-accent shadow-lift lg:-mt-3 lg:mb-[-12px] hover:-translate-y-1 hover:shadow-[0_32px_70px_-16px_rgba(91,75,255,0.35)]"
                  : "border-line shadow-card hover:-translate-y-1 hover:shadow-lift hover:border-ink/20",
              )}
            >
              {p.featured && (
                <span className="absolute -top-3 left-7 inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-[11px] font-medium text-white">
                  <Star size={11} fill="currentColor" /> Most popular
                </span>
              )}
              <div className="text-sm font-semibold text-ink">{p.name}</div>
              <div className="text-xs text-ink-faint">{p.tagline}</div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-mono text-4xl font-semibold text-ink">{sym}{p[cur]}</span>
                <span className="text-sm text-ink-faint">/mo</span>
              </div>
              <ul className="mt-6 space-y-2.5 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[14px] text-ink-soft">
                    <Check size={16} className="mt-0.5 text-live shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <div className="mt-7">
                <MktButton href={p.href} variant={p.featured ? "accent" : "outline"} size="md" className="w-full">
                  {p.cta}
                </MktButton>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 rounded-[20px] border border-line bg-paper p-6">
          <div>
            <div className="font-semibold text-ink">Enterprise</div>
            <div className="text-sm text-ink-soft">Unlimited scale, SSO, custom contracts, and dedicated support.</div>
          </div>
          <MktButton href="/contact" variant="ink" size="md">Talk to us</MktButton>
        </div>
      </MktContainer>
    </section>
  )
}

// ── Final CTA ─────────────────────────────────────────────────────────────────
export function MarketingFinalCta() {
  const glowRef = useRef<HTMLDivElement>(null)
  const handleMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = glowRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty("--mx", `${e.clientX - r.left}px`)
    el.style.setProperty("--my", `${e.clientY - r.top}px`)
  }
  return (
    <section className="py-20 md:py-28 bg-paper">
      <MktContainer>
        <div
          ref={glowRef}
          onMouseMove={handleMove}
          className="group relative overflow-hidden rounded-[32px] bg-band px-6 py-16 md:px-16 md:py-20 text-center"
        >
          <div className="pointer-events-none absolute inset-0 text-white/[0.05] mkt-qr-grid" />
          <div
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{
              background:
                "radial-gradient(480px circle at var(--mx, 50%) var(--my, 0px), rgba(91,75,255,0.30), transparent 42%)",
            }}
          />
          <div className="pointer-events-none absolute -bottom-24 left-1/2 -translate-x-1/2 h-72 w-[560px] rounded-full bg-accent/25 blur-3xl" />
          <div className="relative">
            <Eyebrow className="justify-center text-band-fg/60">Get started</Eyebrow>
            <h2 className="mt-5 mx-auto max-w-2xl text-3xl md:text-5xl font-bold font-display tracking-tightest leading-[1.05] text-band-fg">
              Your first QR code is a minute away.
            </h2>
            <p className="mt-4 mx-auto max-w-lg text-band-fg/70">
              Create it free, brand it, and start tracking scans today. Upgrade only when you're ready.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
              <MktButton href="/signup" variant="accent" size="lg">Create your QR code — free <ArrowRight size={18} /></MktButton>
              <MktButton href="#mkt-pricing" variant="outlineOnDark" size="lg">See pricing</MktButton>
            </div>
            <p className="mt-5 text-sm text-band-fg/50">Free forever plan · No credit card required</p>
          </div>
          <FinderGlyph size={22} className="absolute top-8 right-8 text-white/15" />
        </div>
      </MktContainer>
    </section>
  )
}
