import {
  MapPin, Check, Split, Route, Layers, Users, Code2, Plug,
  ShoppingBag, UtensilsCrossed, CalendarDays, Home, Package, Megaphone,
  Lock, Timer, ShieldCheck, KeyRound,
} from "lucide-react"
import { MktContainer, SectionHead, Eyebrow, MktButton, FinderGlyph } from "./ui"
import { cn } from "@/lib/utils"

// ── Analytics showcase ────────────────────────────────────────────────────────
const TOP_LOCATIONS = [
  { city: "Mumbai", pct: 42 },
  { city: "Delhi", pct: 18 },
  { city: "Bengaluru", pct: 14 },
  { city: "Dubai", pct: 9 },
]
const DEVICES = [
  { name: "Mobile", pct: 71 },
  { name: "Desktop", pct: 22 },
  { name: "Tablet", pct: 7 },
]
const WEEK = [38, 52, 44, 70, 61, 88, 74]

export function MarketingAnalytics() {
  return (
    <section className="py-20 md:py-28 bg-paper">
      <MktContainer className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <div>
          <SectionHead
            eyebrow="Analytics"
            title={<>Know exactly who scanned, where, and when</>}
            intro="Every scan is logged with location, device, OS, and browser — then rolled up into clean dashboards per code and across your whole account."
            className="text-center mx-auto lg:text-left lg:mx-0"
          />
          <ul className="mt-8 space-y-3 w-fit mx-auto lg:mx-0">
            {[
              "Geolocation down to the city, with a live map",
              "Device, OS, and browser breakdowns",
              "Scan timelines — today, this week, this month",
              "Export raw scans or view per-QR reports",
            ].map((t) => (
              <li key={t} className="flex items-start gap-3 text-[15px] text-ink">
                <Check size={18} className="mt-0.5 text-live shrink-0" /> {t}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex justify-center lg:justify-start">
            <MktButton href="/features" variant="ink" size="md">Explore analytics</MktButton>
          </div>
        </div>

        {/* Dashboard mockup */}
        <div className="rounded-[24px] border border-line bg-paper-pure shadow-lift p-5 md:p-6">
          <div className="flex items-center justify-between">
            <Eyebrow>Scan analytics</Eyebrow>
            <span className="text-xs text-ink-faint font-mono">last 30 days</span>
          </div>
          <div className="mt-2 flex items-end gap-3">
            <span className="font-mono text-4xl font-semibold text-ink">12,904</span>
            <span className="mb-1.5 text-sm text-live font-medium">▲ 23%</span>
          </div>

          <div className="mt-5 grid grid-cols-5 gap-4">
            <div className="col-span-3 relative rounded-2xl bg-band overflow-hidden h-40">
              <div className="absolute inset-0 text-white/10 mkt-qr-grid" />
              {[
                { l: "28%", t: "44%" },
                { l: "52%", t: "58%" },
                { l: "63%", t: "36%" },
                { l: "78%", t: "62%" },
              ].map((p, i) => (
                <span key={i} className="absolute" style={{ left: p.l, top: p.t }}>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-accent/70 animate-ping" style={{ animationDelay: `${i * 0.4}s` }} />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
                  </span>
                </span>
              ))}
              <span className="absolute left-3 bottom-3 text-[11px] font-mono uppercase tracking-wider text-white/60">
                scans by location
              </span>
            </div>
            <div className="col-span-2 space-y-2.5">
              {TOP_LOCATIONS.map((loc) => (
                <div key={loc.city}>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="flex items-center gap-1 text-ink"><MapPin size={12} className="text-accent" />{loc.city}</span>
                    <span className="font-mono text-ink-faint">{loc.pct}%</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-ink/[0.06] overflow-hidden">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${loc.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4">
            <div className="rounded-2xl border border-line p-4">
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">Devices</div>
              <div className="mt-3 space-y-2">
                {DEVICES.map((d) => (
                  <div key={d.name} className="flex items-center gap-2 text-[13px]">
                    <span className="w-16 text-ink-soft">{d.name}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-ink/[0.06] overflow-hidden">
                      <div className="h-full rounded-full bg-ink" style={{ width: `${d.pct}%` }} />
                    </div>
                    <span className="font-mono text-ink-faint w-8 text-right">{d.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-line p-4">
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">This week</div>
              <div className="mt-3 flex items-end gap-1.5 h-16">
                {WEEK.map((h, i) => (
                  <div key={i} className="flex-1 rounded-t bg-accent/80 hover:bg-accent transition-colors" style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </MktContainer>
    </section>
  )
}

// ── Power features (dark band) ────────────────────────────────────────────────
const FEATURES = [
  { icon: Split, title: "A/B testing", body: "Split scans across variants and let the winner emerge." },
  { icon: Route, title: "Smart routing", body: "Send scanners to different URLs by time, device, or country." },
  { icon: Layers, title: "Bulk generation", body: "Upload a CSV and get thousands of codes as a ZIP." },
  { icon: Users, title: "Team workspaces", body: "Invite your team with owner, admin, editor, and viewer roles." },
  { icon: Code2, title: "Developer API", body: "Automate everything with a clean REST API and API keys." },
  { icon: Plug, title: "Integrations", body: "Connect Zapier, Make, and n8n to your existing workflows." },
]

export function PowerFeatures() {
  return (
    <section id="mkt-platform" className="py-20 md:py-28 bg-band text-band-fg">
      <MktContainer>
        <SectionHead
          eyebrow="Platform"
          title={<>The depth of an enterprise tool, without the sales call</>}
          intro="Everything the cheap generators skip — self-serve, and included on the plans that need them."
          align="center"
          onDark
        />
        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-px rounded-[24px] overflow-hidden border border-line-dark bg-line-dark">
          {FEATURES.map((f) => (
            <div key={f.title} className="group relative bg-band p-7 transition-all duration-200 hover:z-10 hover:-translate-y-0.5 hover:bg-white/[0.04]">
              <span className="grid place-items-center w-11 h-11 rounded-xl bg-accent/15 text-accent transition-colors group-hover:bg-accent group-hover:text-white">
                <f.icon size={20} />
              </span>
              <h3 className="mt-5 text-lg font-bold font-display text-band-fg">{f.title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-band-fg/60">{f.body}</p>
            </div>
          ))}
        </div>
      </MktContainer>
    </section>
  )
}

// ── Use cases ─────────────────────────────────────────────────────────────────
const USE_CASES = [
  { icon: ShoppingBag, title: "Retail & packaging", body: "Product info, authenticity, and re-order links on every package." },
  { icon: UtensilsCrossed, title: "Restaurants", body: "Digital menus you can update without reprinting a thing." },
  { icon: CalendarDays, title: "Events", body: "Tickets, check-ins, schedules, and post-event surveys." },
  { icon: Home, title: "Real estate", body: "Listing pages and virtual tours on signage and flyers." },
  { icon: Package, title: "Logistics", body: "Track-and-trace and asset labels that never go stale." },
  { icon: Megaphone, title: "Marketing", body: "Campaign QR with A/B tests and full attribution." },
]

export function MarketingUseCases() {
  return (
    <section id="mkt-usecases" className="py-20 md:py-28 bg-paper">
      <MktContainer>
        <SectionHead eyebrow="Solutions" title={<>Built for the way real businesses use QR</>} align="center" />
        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {USE_CASES.map((u) => (
            <div key={u.title} className="group rounded-[20px] border border-line bg-paper-pure p-6 shadow-card hover:-translate-y-0.5 hover:shadow-lift transition-all">
              <span className="grid place-items-center w-11 h-11 rounded-xl bg-ink/[0.04] text-ink group-hover:bg-accent group-hover:text-white transition-colors">
                <u.icon size={20} />
              </span>
              <h3 className="mt-5 text-lg font-bold font-display text-ink">{u.title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-ink-soft">{u.body}</p>
            </div>
          ))}
        </div>
      </MktContainer>
    </section>
  )
}

// ── Security / control ──────────────────────────────────────────────────────
const CONTROLS = [
  { icon: Lock, title: "Password protection", body: "Lock sensitive codes behind a password before they resolve." },
  { icon: Timer, title: "Expiry & scan limits", body: "Set a code to stop working after a date or a number of scans." },
  { icon: KeyRound, title: "Role-based access", body: "Owner, admin, editor, and viewer permissions for your team." },
  { icon: ShieldCheck, title: "Privacy first", body: "No hidden trackers — you own your scan data, exportable anytime." },
]

export function MarketingSecurity() {
  return (
    <section className="py-20 md:py-24 bg-paper-pure border-y border-line">
      <MktContainer className="grid lg:grid-cols-[0.9fr_1.1fr] gap-12 items-center">
        <SectionHead
          eyebrow="Control & privacy"
          title={<>Your codes, your data, your rules</>}
          intro="Protect, expire, and delegate access to every code — with privacy built in, not bolted on."
          className="text-center mx-auto lg:text-left lg:mx-0"
        />
        <div className="grid sm:grid-cols-2 gap-4">
          {CONTROLS.map((c) => (
            <div key={c.title} className="group relative rounded-[20px] border border-line bg-paper p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift hover:border-ink/10">
              <c.icon size={22} className="text-accent transition-transform duration-200 group-hover:scale-110" />
              <h3 className="mt-4 text-[17px] font-bold font-display text-ink">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{c.body}</p>
              <FinderGlyph size={14} className={cn("absolute top-6 right-6 text-line")} />
            </div>
          ))}
        </div>
      </MktContainer>
    </section>
  )
}
