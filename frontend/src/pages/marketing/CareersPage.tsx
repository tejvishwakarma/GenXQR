import { useState, type ComponentType } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Briefcase, Users, HeartHandshake, Rocket, ArrowRight, MapPin,
  Clock, ChevronRight, Loader2,
} from "lucide-react"
import { SEOMeta } from "@/components/SEOMeta"
import { fetchPublicJobs, type JobPosting } from "@/lib/api"
import { JobApplicationModal } from "@/components/JobApplicationModal"
import { MktContainer, SectionHead, MktButton, IconTile, FinderGlyph, type IconTint } from "@/components/marketing/ui"
import { PageHero } from "@/components/marketing/PageHero"

type CareerRole = {
  title: string
  type:  string
  desc:  string
  location?:   string
  department?: string
}

const VALUES: { icon: ComponentType<{ size?: number; className?: string }>; tint: IconTint; title: string; desc: string }[] = [
  {
    icon: Users,
    tint: "blue",
    title: "Small, focused teams",
    desc: "Own outcomes end-to-end and ship with clear accountability.",
  },
  {
    icon: HeartHandshake,
    tint: "emerald",
    title: "Respectful collaboration",
    desc: "We value clear communication, thoughtful feedback, and trust.",
  },
  {
    icon: Rocket,
    tint: "violet",
    title: "High growth environment",
    desc: "Move fast on meaningful product problems with measurable impact.",
  },
]

const DEPARTMENTS = ["All", "Engineering", "Design", "Marketing", "Operations", "Product", "Sales", "Other"]

// Same department -> color intent as before, expressed as theme-aware badge classes.
const DEPT_BADGE: Record<string, string> = {
  Engineering: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-line",
  Design:      "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-line",
  Marketing:   "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-line",
  Operations:  "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-line",
  Product:     "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-line",
  Sales:       "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-line",
  Other:       "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-line",
}
const DEPT_BADGE_FALLBACK = "bg-ink/5 text-ink-soft border-line"

export default function CareersPage() {
  const [activeDept, setActiveDept]   = useState("All")
  const [applyingFor, setApplyingFor] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["public-jobs"],
    queryFn:  fetchPublicJobs,
    staleTime: 60_000,
  })

  // Map API shape → internal CareerRole shape
  const allRoles: CareerRole[] = (data?.data ?? []).map((j: JobPosting) => ({
    title:      j.title,
    type:       j.type,
    desc:       j.description,
    location:   j.location   ?? undefined,
    department: j.department ?? undefined,
  }))

  const filteredRoles =
    activeDept === "All" ? allRoles : allRoles.filter((r) => r.department === activeDept)

  // Only show department tabs that actually have jobs (+ "All")
  const activeDepts = Array.from(new Set(allRoles.map((r) => r.department).filter(Boolean)))
  const deptTabs    = ["All", ...DEPARTMENTS.filter((d) => d !== "All" && activeDepts.includes(d))]

  return (
    <div className="animate-fade-in">
      <SEOMeta
        title="Careers"
        description="Join GenXQR and help build the next generation of dynamic QR infrastructure."
        url="/careers"
      />

      {/* ── Hero ── */}
      <PageHero
        eyebrow="We're hiring"
        title={<>Build the future of<br />QR at <span className="text-accent">GenXQR</span></>}
        intro="We're a small, ambitious team building QR infrastructure that scales. If you thrive on ownership and move fast, there's a place for you here."
      />

      {/* ── Values ── */}
      <section className="py-16 md:py-20 bg-paper-pure border-y border-line">
        <MktContainer>
          <SectionHead eyebrow="Culture" title="Why join us?" align="center" />
          <div className="mt-12 grid md:grid-cols-3 gap-6">
            {VALUES.map((v) => (
              <div
                key={v.title}
                className="rounded-[22px] border border-line bg-paper p-7 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift hover:border-ink/10"
              >
                <IconTile icon={v.icon} tint={v.tint} />
                <h3 className="mt-5 text-lg font-bold font-display text-ink">{v.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-ink-soft">{v.desc}</p>
              </div>
            ))}
          </div>
        </MktContainer>
      </section>

      {/* ── Open Roles ── */}
      <section className="py-20 md:py-24 bg-paper">
        <MktContainer>
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-accent animate-spin" />
            </div>
          ) : allRoles.length === 0 ? (
            /* ────────────────── No openings at all ────────────────── */
            <div className="relative overflow-hidden rounded-2xl border border-line bg-paper-pure p-12 md:p-20 text-center">
              <div className="relative flex flex-col items-center gap-5 max-w-lg mx-auto">
                <IconTile icon={Briefcase} tint="violet" />
                <div>
                  <h2 className="text-2xl font-bold font-display text-ink mb-3">No current openings</h2>
                  <p className="text-ink-soft leading-relaxed">
                    We don't have any open positions at the moment, but we're always on the lookout
                    for exceptional people. Check back soon — or reach out and introduce yourself.
                  </p>
                </div>
                <a
                  href="mailto:support@genxqr.com?subject=Speculative Application — GenXQR"
                  className="inline-flex items-center gap-2 px-6 py-3 border border-line bg-paper hover:border-ink/30 hover:shadow-card text-ink text-sm font-semibold rounded-full transition-all duration-200"
                >
                  Send a speculative application
                  <ArrowRight size={14} />
                </a>
                <p className="text-ink-faint text-xs">
                  We read every application and reach out when there's a strong match.
                </p>
              </div>
            </div>
          ) : (
            /* ────────────────── Roles list ────────────────── */
            <>
              {/* Header + filter */}
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <h2 className="text-2xl md:text-[2rem] font-bold font-display tracking-tightest text-ink">
                  Open roles{" "}
                  <span className="text-ink-faint text-lg font-normal">({allRoles.length})</span>
                </h2>
                <div className="flex flex-wrap gap-2">
                  {deptTabs.map((dept) => (
                    <button
                      key={dept}
                      onClick={() => setActiveDept(dept)}
                      className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors ${
                        activeDept === dept
                          ? "bg-accent text-white"
                          : "bg-paper-pure border border-line text-ink-soft hover:border-ink/30 hover:text-ink"
                      }`}
                    >
                      {dept}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filtered empty */}
              {filteredRoles.length === 0 ? (
                <div className="py-14 text-center">
                  <p className="text-ink-soft font-medium">
                    No openings in {activeDept} right now.
                  </p>
                  <button
                    onClick={() => setActiveDept("All")}
                    className="mt-3 text-accent hover:text-accent-ink text-sm underline underline-offset-2 transition-colors"
                  >
                    View all departments
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredRoles.map((role, i) => {
                    const dept = role.department ?? "Other"
                    return (
                      <div
                        key={`${role.title}-${i}`}
                        className="group flex flex-col sm:flex-row sm:items-center gap-4 bg-paper-pure border border-line hover:border-ink/10 rounded-2xl p-5 sm:p-6 transition-all duration-200 hover:shadow-lift"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            {role.department && (
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                                  DEPT_BADGE[dept] ?? DEPT_BADGE_FALLBACK
                                }`}
                              >
                                {dept}
                              </span>
                            )}
                          </div>
                          <h3 className="text-ink font-bold text-lg font-display">{role.title}</h3>
                          <div className="flex flex-wrap items-center gap-3 mt-1">
                            <span className="flex items-center gap-1 text-ink-faint text-xs">
                              <Clock size={12} /> {role.type}
                            </span>
                            {role.location && (
                              <span className="flex items-center gap-1 text-ink-faint text-xs">
                                <MapPin size={12} /> {role.location}
                              </span>
                            )}
                          </div>
                          <p className="text-ink-soft text-sm mt-3 leading-relaxed">{role.desc}</p>
                        </div>
                        <div className="shrink-0">
                          <button
                            type="button"
                            onClick={() => setApplyingFor(role.title)}
                            className="inline-flex items-center gap-2 px-5 py-2.5 border border-line hover:bg-accent hover:border-accent bg-paper text-ink hover:text-white text-sm font-semibold rounded-full transition-all duration-200"
                          >
                            Apply
                            <ChevronRight
                              size={14}
                              className="group-hover:translate-x-0.5 transition-transform"
                            />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Don't see your role CTA */}
              <div className="mt-12 relative overflow-hidden rounded-2xl border border-line bg-accent-soft p-8 text-center">
                <FinderGlyph size={18} className="absolute top-6 right-6 text-line" />
                <h3 className="text-xl font-bold font-display text-ink mb-2">Don't see your role?</h3>
                <p className="text-ink-soft mb-6">
                  Send us your profile and the kind of problems you want to solve.
                </p>
                <MktButton href="/contact" variant="accent">
                  Contact recruiting <ArrowRight size={16} />
                </MktButton>
              </div>
            </>
          )}
        </MktContainer>
      </section>

      {/* Job application modal */}
      {applyingFor && (
        <JobApplicationModal
          jobTitle={applyingFor}
          onClose={() => setApplyingFor(null)}
        />
      )}
    </div>
  )
}
