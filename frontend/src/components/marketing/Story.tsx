import {
  Link2, List, Contact, Building2, Smartphone, FileText, Video, Music, Images,
  UtensilsCrossed, Ticket, Share2, MessageCircle, Wifi, Palette, BarChart3, RefreshCw,
  Instagram, Facebook,
} from "lucide-react"
import { Link } from "react-router-dom"
import { MktContainer, SectionHead, FinderGlyph } from "./ui"
import { usePlatformStats } from "@/hooks/usePlatformStats"
import { useCountUp } from "@/hooks/useCountUp"

function formatStat(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(0)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return value.toFixed(0)
}

// ── Trust stats band — real platform data, animated count-up ─────────────────
// `value` is null until /api/public/stats answers (and always in the prerendered
// HTML, where effects never run). A null value renders a neutral dash, never a
// made-up number.
function TrustStat({ value, label, borderLeft }: { value: number | null; label: string; borderLeft: boolean }) {
  return (
    <div className={borderLeft ? "md:border-l md:border-line md:pl-8" : ""}>
      <div className="font-mono text-3xl md:text-4xl font-semibold text-ink tracking-tight">
        {/* CountUp is only mounted once the real value exists: useCountUp
            animates once per mount, so mounting it with a placeholder 0 and
            swapping the target later would leave it stuck at 0. */}
        {value === null ? "—" : <CountUp value={value} />}
      </div>
      <div className="mt-1 text-sm text-ink-soft">{label}</div>
    </div>
  )
}

function CountUp({ value }: { value: number }) {
  const [count, ref] = useCountUp(value)
  return <div ref={ref}>{formatStat(count)}+</div>
}

/**
 * Live platform stats. NOT rendered (removed from HomePage 18 Oct 2026): the
 * real numbers are still small, and small numbers hurt credibility more than
 * no numbers. Re-add <TrustStrip /> to HomePage once they help.
 */
export function TrustStrip() {
  const { stats, failed } = usePlatformStats()
  return (
    <section className="border-y border-line bg-paper-pure">
      <MktContainer className="py-8">
        <p className="text-center text-sm text-ink-faint">
          Made in India, used worldwide — by teams in retail, hospitality, events, and marketing.
        </p>
        {/* If the stats request fails, show no numbers at all rather than
            placeholders that never resolve. */}
        {!failed && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-y-6">
            <TrustStat value={stats?.qrCodesGenerated ?? null} label="QR codes created" borderLeft={false} />
            <TrustStat value={stats?.totalScans ?? null} label="scans tracked" borderLeft />
            <TrustStat value={stats?.activeBusinesses ?? null} label="accounts created" borderLeft />
          </div>
        )}
      </MktContainer>
    </section>
  )
}

// ── QR type groups ──────────────────────────────────────────────────────────
const GROUPS = [
  {
    group: "Link & web",
    items: [
      { icon: Link2, label: "Website / URL", href: "/generate/url" },
      { icon: List, label: "Multi-link page" },
      { icon: Wifi, label: "WiFi access", href: "/generate/wifi" },
      { icon: UtensilsCrossed, label: "Menu" },
    ],
  },
  {
    group: "Contact & business",
    items: [
      { icon: Contact, label: "vCard" },
      { icon: Building2, label: "Business info" },
      { icon: Smartphone, label: "App download" },
      { icon: Ticket, label: "Coupon" },
    ],
  },
  {
    group: "Media",
    items: [
      { icon: FileText, label: "PDF document" },
      { icon: Video, label: "Video" },
      { icon: Music, label: "Audio / MP3" },
      { icon: Images, label: "Image gallery" },
    ],
  },
  {
    group: "Social",
    items: [
      { icon: Share2, label: "Social profiles" },
      { icon: MessageCircle, label: "WhatsApp", href: "/generate/whatsapp" },
      { icon: Instagram, label: "Instagram", href: "/generate/instagram" },
      { icon: Facebook, label: "Facebook" },
    ],
  },
]

export function QrTypes() {
  return (
    <section id="mkt-product" className="py-20 md:py-28 bg-paper">
      <MktContainer>
        <SectionHead
          eyebrow="One code for everything"
          title={<>Every kind of QR code your business needs</>}
          intro="Sixteen content types, grouped by what you're trying to do — not a wall of icons to decode."
          align="center"
        />
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {GROUPS.map((g) => (
            <div key={g.group} className="rounded-[20px] border border-line bg-paper-pure p-6 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift hover:border-ink/10">
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">{g.group}</div>
              <ul className="mt-4 space-y-1">
                {g.items.map((it) => {
                  const inner = (
                    <>
                      <span className="grid place-items-center w-8 h-8 rounded-lg bg-ink/[0.04] text-ink group-hover:bg-white group-hover:text-accent transition-colors">
                        <it.icon size={16} />
                      </span>
                      <span className="text-[15px] text-ink">{it.label}</span>
                    </>
                  )
                  const rowClass = "group flex items-center gap-3 rounded-xl px-2.5 py-2 -mx-2.5 hover:bg-accent-soft transition-colors"
                  // Types with their own free generator page link to it (internal
                  // links help those pages rank); the rest are dashboard-only.
                  return (
                    <li key={it.label}>
                      {"href" in it && it.href ? (
                        <Link to={it.href} className={rowClass}>{inner}</Link>
                      ) : (
                        <div className={`${rowClass} cursor-default`}>{inner}</div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </MktContainer>
    </section>
  )
}

// ── Value trio ────────────────────────────────────────────────────────────────
const VALUES = [
  {
    icon: Palette,
    title: "Design & brand it",
    body: "Add your logo, colors, custom dot styles, and frames. Branded codes look trustworthy — and get scanned more.",
  },
  {
    icon: BarChart3,
    title: "Track every scan",
    body: "See scans by location, device, OS, and time as they happen. Real analytics you can act on, not vanity counts.",
  },
  {
    icon: RefreshCw,
    title: "Edit anytime",
    body: "Point a printed code somewhere new whenever you want. Fix a typo or run a new campaign — no reprint, ever.",
  },
]

export function ValueTrio() {
  return (
    <section className="py-20 md:py-24 bg-paper-pure border-y border-line">
      <MktContainer>
        <SectionHead
          eyebrow="Why dynamic"
          title={<>Print once. Change the destination as often as you like.</>}
          align="center"
        />
        <div className="mt-14 grid md:grid-cols-3 gap-6">
          {VALUES.map((v) => (
            <div key={v.title} className="group relative rounded-[22px] border border-line bg-paper p-7 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift hover:border-ink/10">
              <span className="grid place-items-center w-12 h-12 rounded-2xl bg-ink text-paper transition-colors group-hover:bg-accent">
                <v.icon size={22} />
              </span>
              <h3 className="mt-5 text-xl font-bold font-display text-ink">{v.title}</h3>
              <p className="mt-2.5 text-[15px] leading-relaxed text-ink-soft">{v.body}</p>
              <FinderGlyph size={16} className="absolute top-7 right-7 text-line" />
            </div>
          ))}
        </div>
      </MktContainer>
    </section>
  )
}
