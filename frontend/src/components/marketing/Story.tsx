import {
  Link2, List, Contact, Building2, Smartphone, FileText, Video, Music, Images,
  UtensilsCrossed, Ticket, Share2, MessageCircle, Wifi, Palette, BarChart3, RefreshCw,
} from "lucide-react"
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
function TrustStat({ value, suffix, label, borderLeft }: { value: number; suffix: string; label: string; borderLeft: boolean }) {
  const [count, ref] = useCountUp(value)
  // useCountUp rounds to a whole number internally (built for large integer
  // counters), which would round 99.9% up to "100.0%". Percent stats skip the
  // animated count and just show the real decimal value; the ref is still
  // attached so the reveal trigger stays consistent with the other stats.
  const display = suffix === "%" ? value.toFixed(1) : formatStat(count)
  return (
    <div ref={ref} className={borderLeft ? "md:border-l md:border-line md:pl-8" : ""}>
      <div className="font-mono text-3xl md:text-4xl font-semibold text-ink tracking-tight">{display}{suffix}</div>
      <div className="mt-1 text-sm text-ink-soft">{label}</div>
    </div>
  )
}

export function TrustStrip() {
  const { stats } = usePlatformStats()
  return (
    <section className="border-y border-line bg-paper-pure">
      <MktContainer className="py-8">
        <p className="text-center text-sm text-ink-faint">
          Made in India, used worldwide — by teams in retail, hospitality, events, and marketing.
        </p>
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-y-6">
          <TrustStat value={stats.qrCodesGenerated} suffix="+" label="QR codes created" borderLeft={false} />
          <TrustStat value={stats.totalScans} suffix="+" label="scans tracked" borderLeft />
          <TrustStat value={stats.activeBusinesses} suffix="+" label="businesses across India" borderLeft />
          <TrustStat value={stats.uptimeSla} suffix="%" label="uptime guaranteed" borderLeft />
        </div>
      </MktContainer>
    </section>
  )
}

// ── QR type groups ──────────────────────────────────────────────────────────
const GROUPS = [
  {
    group: "Link & web",
    items: [
      { icon: Link2, label: "Website / URL" },
      { icon: List, label: "Multi-link page" },
      { icon: Wifi, label: "WiFi access" },
    ],
  },
  {
    group: "Contact & business",
    items: [
      { icon: Contact, label: "vCard" },
      { icon: Building2, label: "Business info" },
      { icon: Smartphone, label: "App download" },
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
    group: "Marketing",
    items: [
      { icon: UtensilsCrossed, label: "Menu" },
      { icon: Ticket, label: "Coupon" },
      { icon: Share2, label: "Social profiles" },
      { icon: MessageCircle, label: "WhatsApp" },
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
          intro="Fourteen content types, grouped by what you're trying to do — not a wall of icons to decode."
          align="center"
        />
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {GROUPS.map((g) => (
            <div key={g.group} className="rounded-[20px] border border-line bg-paper-pure p-6 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift hover:border-ink/10">
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">{g.group}</div>
              <ul className="mt-4 space-y-1">
                {g.items.map((it) => (
                  <li
                    key={it.label}
                    className="group flex items-center gap-3 rounded-xl px-2.5 py-2 -mx-2.5 hover:bg-accent-soft transition-colors cursor-default"
                  >
                    <span className="grid place-items-center w-8 h-8 rounded-lg bg-ink/[0.04] text-ink group-hover:bg-white group-hover:text-accent transition-colors">
                      <it.icon size={16} />
                    </span>
                    <span className="text-[15px] text-ink">{it.label}</span>
                  </li>
                ))}
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
