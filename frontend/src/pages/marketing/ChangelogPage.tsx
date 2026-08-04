import { useQuery } from "@tanstack/react-query"
import { CalendarClock, Sparkles, ShieldCheck, Gauge, Wrench, Zap, Star, Loader2 } from "lucide-react"
import { SEOMeta } from "@/components/SEOMeta"
import { fetchPublicSiteContent } from "@/lib/api"
import { MktContainer, Reveal, IconTile, type IconTint } from "@/components/marketing/ui"
import { PageHero } from "@/components/marketing/PageHero"

type ChangelogEntry = {
  version: string
  date: string
  title: string
  items: string[]
  icon?: string
}

const FALLBACK: ChangelogEntry[] = [
  {
    version: "v1.9.0",
    date: "April 2026",
    title: "Support tickets, analytics & dashboard overhaul",
    items: [
      "Added user-facing support ticketing with email notifications",
      "Redesigned Admin Dashboard with Recharts charts and KPI tiles",
      "Added 5-panel Admin Analytics with static QR popularity tracking",
      "Permanent static QR generation tracking stored to database",
      "Redesigned Careers and Changelog public pages",
    ],
    icon: "sparkles",
  },
  {
    version: "v1.8.0",
    date: "March 2026",
    title: "Marketing page refresh",
    items: [
      "Redesigned Features, About, and Use Cases pages",
      "Added Cookie Policy, GDPR, Careers, and Changelog routes",
      "Improved route scroll-to-top behavior",
    ],
    icon: "sparkles",
  },
  {
    version: "v1.7.0",
    date: "March 2026",
    title: "Analytics reliability improvements",
    items: [
      "Fixed timeline chart rendering for low-scan datasets",
      "Improved scan deduplication logic for multi-device LAN scenarios",
      "Enhanced dashboard analytics widgets",
    ],
    icon: "gauge",
  },
  {
    version: "v1.6.0",
    date: "February 2026",
    title: "Admin and auth upgrades",
    items: [
      "Role-aware login redirect for admin and super admin",
      "Admin navigation visibility improvements",
      "Notification preference persistence groundwork",
    ],
    icon: "shield",
  },
]

const TYPE_META: Record<string, { label: string; tint: IconTint; icon: typeof Sparkles }> = {
  sparkles: { label: "Feature", tint: "violet", icon: Sparkles },
  shield: { label: "Security", tint: "emerald", icon: ShieldCheck },
  gauge: { label: "Improvement", tint: "blue", icon: Gauge },
  wrench: { label: "Fix", tint: "amber", icon: Wrench },
  zap: { label: "Performance", tint: "cyan", icon: Zap },
  star: { label: "Major", tint: "orange", icon: Star },
}

function iconMeta(name: string | undefined) {
  return TYPE_META[name ?? "sparkles"] ?? TYPE_META.sparkles
}

export default function ChangelogPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["public-site-content"],
    queryFn: fetchPublicSiteContent,
    staleTime: 60_000,
  })

  const entries: ChangelogEntry[] = data?.data.changelog?.length ? data.data.changelog : FALLBACK

  return (
    <div className="pb-24 md:pb-32">
      <SEOMeta
        title="Changelog"
        description="Track recent GenXQR product improvements, fixes, and platform releases."
        url="/changelog"
      />

      <PageHero
        eyebrow="Product updates"
        title={
          <>
            GenXQR <span className="text-accent">Changelog</span>
          </>
        }
        intro="A running log of meaningful improvements shipped to the platform."
      />

      <MktContainer className="max-w-3xl">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-accent animate-spin" />
          </div>
        ) : (
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-6 md:left-8 top-0 bottom-0 w-px bg-gradient-to-b from-accent/40 via-line to-transparent pointer-events-none" />

            {entries.map((entry, idx) => {
              const meta = iconMeta(entry.icon)
              const isFirst = idx === 0
              return (
                <Reveal key={`${entry.version}-${idx}`} delay={idx * 60} className="relative flex gap-6 md:gap-10 pb-12">
                  {/* Timeline node */}
                  <div className="relative shrink-0">
                    <IconTile
                      icon={meta.icon}
                      tint={meta.tint}
                      size="md"
                      className={`relative z-10 !w-12 !h-12 md:!w-16 md:!h-16 rounded-2xl shadow-card transition-transform hover:scale-110 ${isFirst ? "ring-2 ring-accent/40" : ""}`}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pt-1">
                    {/* Meta row */}
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-line bg-paper-pure text-ink-soft text-xs font-semibold">
                        <meta.icon size={14} /> {meta.label}
                      </span>
                      <code className="px-2.5 py-1 bg-paper-pure border border-line text-ink-soft text-xs rounded-lg font-mono font-semibold">
                        {entry.version}
                      </code>
                      <span className="text-ink-faint text-xs flex items-center gap-1">
                        <CalendarClock size={11} /> {entry.date}
                      </span>
                      {isFirst && (
                        <span className="relative inline-flex items-center gap-1.5 px-2 py-0.5 bg-accent-soft border border-accent/30 text-accent text-xs rounded-full font-semibold">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-accent" />
                          </span>
                          Latest
                        </span>
                      )}
                    </div>

                    {/* Title & items */}
                    <h2 className="text-ink font-bold text-xl mb-3 leading-snug font-display tracking-tightest">{entry.title}</h2>
                    <ul className="space-y-2">
                      {entry.items.map((item, j) => (
                        <li key={j} className="flex items-start gap-2.5 text-ink-soft text-sm leading-relaxed">
                          <span className="mt-2 w-1.5 h-1.5 rounded-full shrink-0 bg-accent" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </Reveal>
              )
            })}
          </div>
        )}

        {/* Subscribe CTA */}
        <div className="mt-4 rounded-2xl border border-line bg-paper-pure p-8 text-center shadow-card">
          <p className="text-ink font-bold text-lg mb-1 font-display tracking-tightest">Stay in the loop</p>
          <p className="text-ink-soft text-sm mb-5">Follow our release notes directly from the admin dashboard or check back here.</p>
          <div className="flex items-center justify-center gap-2 text-ink-faint text-sm">
            <CalendarClock size={14} />
            Updated regularly with every meaningful release
          </div>
        </div>
      </MktContainer>
    </div>
  )
}
