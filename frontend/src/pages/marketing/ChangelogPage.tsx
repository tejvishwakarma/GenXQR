import { useQuery } from "@tanstack/react-query"
import { CalendarClock, Sparkles, ShieldCheck, Gauge, Wrench, Zap, Star, Loader2 } from "lucide-react"
import { SEOMeta } from "@/components/SEOMeta"
import { fetchPublicSiteContent } from "@/lib/api"

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

const TYPE_META: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  sparkles:    { label: "Feature",     color: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/25", icon: <Sparkles size={14} /> },
  shield:      { label: "Security",    color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/25", icon: <ShieldCheck size={14} /> },
  gauge:       { label: "Improvement", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/25", icon: <Gauge size={14} /> },
  wrench:      { label: "Fix",         color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/25", icon: <Wrench size={14} /> },
  zap:         { label: "Performance", color: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/25", icon: <Zap size={14} /> },
  star:        { label: "Major",       color: "text-gold-400", bg: "bg-yellow-500/10", border: "border-yellow-500/25", icon: <Star size={14} /> },
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
    <div className="animate-fade-in">
      <SEOMeta
        title="Changelog"
        description="Track recent GenXQR product improvements, fixes, and platform releases."
        url="/changelog"
      />

      {/* ── Hero ── */}
      <div className="relative overflow-hidden pt-28 pb-20 px-4">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-indigo-600/10 blur-3xl rounded-full pointer-events-none" />
        <div className="max-w-4xl mx-auto text-center relative">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-sm font-medium mb-8">
            <CalendarClock size={14} />
            Product updates
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-5 tracking-tight">
            GenXQR <span className="gradient-text">Changelog</span>
          </h1>
          <p className="text-zinc-400 text-xl max-w-xl mx-auto">
            A running log of meaningful improvements shipped to the platform.
          </p>
        </div>
      </div>

      {/* ── Timeline ── */}
      <div className="max-w-3xl mx-auto px-4 pb-24">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
          </div>
        ) : (
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-6 md:left-8 top-0 bottom-0 w-px bg-gradient-to-b from-violet-500/40 via-zinc-700 to-transparent pointer-events-none" />

            {entries.map((entry, idx) => {
              const meta = iconMeta(entry.icon)
              const isFirst = idx === 0
              return (
                <div key={`${entry.version}-${idx}`} className="relative flex gap-6 md:gap-10 pb-12">
                  {/* Timeline node */}
                  <div className="relative shrink-0 flex flex-col items-center">
                    <div className={`relative z-10 w-12 h-12 md:w-16 md:h-16 rounded-2xl ${meta.bg} border ${meta.border} flex items-center justify-center shadow-lg transition-transform hover:scale-110 ${isFirst ? "ring-2 ring-violet-500/30 shadow-[0_0_16px_rgba(124,58,237,0.25)]" : ""}`}>
                      <span className={meta.color}>{meta.icon}</span>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pt-1">
                    {/* Meta row */}
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl ${meta.bg} border ${meta.border} ${meta.color} text-xs font-semibold`}>
                        {meta.icon} {meta.label}
                      </span>
                      <code className="px-2.5 py-1 bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg font-mono font-semibold">
                        {entry.version}
                      </code>
                      <span className="text-zinc-600 text-xs flex items-center gap-1">
                        <CalendarClock size={11} /> {entry.date}
                      </span>
                      {isFirst && (
                        <span className="px-2 py-0.5 bg-violet-600/20 border border-violet-500/30 text-violet-400 text-xs rounded-full font-semibold">
                          Latest
                        </span>
                      )}
                    </div>

                    {/* Title & items */}
                    <h2 className="text-white font-bold text-xl mb-3 leading-snug">{entry.title}</h2>
                    <ul className="space-y-2">
                      {entry.items.map((item, j) => (
                        <li key={j} className="flex items-start gap-2.5 text-zinc-400 text-sm leading-relaxed">
                          <span className={`mt-2 w-1.5 h-1.5 rounded-full shrink-0 ${meta.color.replace("text-", "bg-")}`} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Subscribe CTA */}
        <div className="mt-4 rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-zinc-900 to-zinc-900 p-8 text-center">
          <p className="text-white font-bold text-lg mb-1">Stay in the loop</p>
          <p className="text-zinc-400 text-sm mb-5">Follow our release notes directly from the admin dashboard or check back here.</p>
          <div className="flex items-center justify-center gap-2 text-zinc-600 text-sm">
            <CalendarClock size={14} />
            Updated regularly with every meaningful release
          </div>
        </div>
      </div>
    </div>
  )
}
