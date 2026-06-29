import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import {
  Briefcase, Users, HeartHandshake, Rocket, ArrowRight, MapPin,
  Clock, ChevronRight, Loader2,
} from "lucide-react"
import { SEOMeta } from "@/components/SEOMeta"
import { fetchPublicJobs, type JobPosting } from "@/lib/api"
import { JobApplicationModal } from "@/components/JobApplicationModal"

type CareerRole = {
  title: string
  type:  string
  desc:  string
  location?:   string
  department?: string
}

const VALUES = [
  {
    icon: <Users size={22} className="text-blue-400" />,
    title: "Small, focused teams",
    desc: "Own outcomes end-to-end and ship with clear accountability.",
    bg: "from-blue-500/10 to-transparent",
    border: "border-blue-500/20",
  },
  {
    icon: <HeartHandshake size={22} className="text-emerald-400" />,
    title: "Respectful collaboration",
    desc: "We value clear communication, thoughtful feedback, and trust.",
    bg: "from-emerald-500/10 to-transparent",
    border: "border-emerald-500/20",
  },
  {
    icon: <Rocket size={22} className="text-violet-400" />,
    title: "High growth environment",
    desc: "Move fast on meaningful product problems with measurable impact.",
    bg: "from-violet-500/10 to-transparent",
    border: "border-violet-500/20",
  },
]

const DEPARTMENTS = ["All", "Engineering", "Design", "Marketing", "Operations", "Product", "Sales", "Other"]

const DEPT_COLORS: Record<string, string> = {
  Engineering: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  Design:      "bg-violet-500/20 text-violet-300 border-violet-500/30",
  Marketing:   "bg-amber-500/20 text-amber-300 border-amber-500/30",
  Operations:  "bg-teal-500/20 text-teal-300 border-teal-500/30",
  Product:     "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  Sales:       "bg-rose-500/20 text-rose-300 border-rose-500/30",
}

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
      <div className="relative overflow-hidden pt-28 pb-24 px-4">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-violet-600/10 blur-3xl rounded-full pointer-events-none" />
        <div className="absolute top-20 right-0 w-[300px] h-[300px] bg-blue-600/10 blur-3xl rounded-full pointer-events-none" />
        <div className="max-w-4xl mx-auto text-center relative">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-sm font-medium mb-8">
            <Briefcase size={14} />
            We're hiring
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight tracking-tight">
            Build the future of<br />
            <span className="gradient-text">QR at GenXQR</span>
          </h1>
          <p className="text-zinc-400 text-xl max-w-2xl mx-auto leading-relaxed">
            We're a small, ambitious team building QR infrastructure that scales. If you thrive on ownership and move fast, there's a place for you here.
          </p>
        </div>
      </div>

      {/* ── Values ── */}
      <div className="max-w-6xl mx-auto px-4 pb-16">
        <h2 className="text-2xl font-bold text-white text-center mb-10">Why join us?</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {VALUES.map((v) => (
            <div
              key={v.title}
              className={`relative rounded-2xl border ${v.border} bg-gradient-to-b ${v.bg} bg-zinc-900/50 p-6 hover:scale-[1.02] transition-transform duration-200`}
            >
              <div className="w-12 h-12 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center mb-4">
                {v.icon}
              </div>
              <h3 className="text-white font-semibold text-lg mb-2">{v.title}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{v.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Open Roles ── */}
      <div className="max-w-6xl mx-auto px-4 pb-24">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
          </div>
        ) : allRoles.length === 0 ? (
          /* ────────────────── No openings at all ────────────────── */
          <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-12 md:p-20 text-center">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-72 h-72 bg-violet-600/5 rounded-full blur-3xl" />
            </div>
            <div className="relative flex flex-col items-center gap-5 max-w-lg mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                <Briefcase size={28} className="text-zinc-500" />
              </div>
              <div>
                <h2 className="text-white font-bold text-2xl mb-3">No current openings</h2>
                <p className="text-zinc-400 leading-relaxed">
                  We don't have any open positions at the moment, but we're always on the lookout
                  for exceptional people. Check back soon — or reach out and introduce yourself.
                </p>
              </div>
              <a
                href="mailto:careers@genxqr.streamsnatcher.com?subject=Speculative Application — GenXQR"
                className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-500 text-zinc-200 hover:text-white text-sm font-semibold rounded-xl transition"
              >
                Send a speculative application
                <ArrowRight size={14} />
              </a>
              <p className="text-zinc-600 text-xs">
                We read every application and reach out when there's a strong match.
              </p>
            </div>
          </div>
        ) : (
          /* ────────────────── Roles list ────────────────── */
          <>
            {/* Header + filter */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <h2 className="text-2xl font-bold text-white">
                Open roles{" "}
                <span className="text-zinc-600 text-lg font-normal">({allRoles.length})</span>
              </h2>
              <div className="flex flex-wrap gap-2">
                {deptTabs.map((dept) => (
                  <button
                    key={dept}
                    onClick={() => setActiveDept(dept)}
                    className={`px-3 py-1.5 text-xs rounded-xl font-medium transition ${
                      activeDept === dept
                        ? "bg-violet-600 text-white"
                        : "bg-zinc-900 border border-zinc-700 text-zinc-400 hover:bg-zinc-800"
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
                <p className="text-zinc-400 font-medium">
                  No openings in {activeDept} right now.
                </p>
                <button
                  onClick={() => setActiveDept("All")}
                  className="mt-3 text-violet-400 hover:text-violet-300 text-sm underline underline-offset-2 transition"
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
                      className="group flex flex-col sm:flex-row sm:items-center gap-4 bg-zinc-900 border border-zinc-800 hover:border-violet-500/40 rounded-2xl p-5 sm:p-6 transition-all duration-200 hover:shadow-[0_0_20px_rgba(124,58,237,0.08)]"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          {role.department && (
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                                DEPT_COLORS[dept] ?? "bg-zinc-700 text-zinc-300 border-zinc-600"
                              }`}
                            >
                              {dept}
                            </span>
                          )}
                        </div>
                        <h3 className="text-white font-bold text-lg">{role.title}</h3>
                        <div className="flex flex-wrap items-center gap-3 mt-1">
                          <span className="flex items-center gap-1 text-zinc-500 text-xs">
                            <Clock size={12} /> {role.type}
                          </span>
                          {role.location && (
                            <span className="flex items-center gap-1 text-zinc-500 text-xs">
                              <MapPin size={12} /> {role.location}
                            </span>
                          )}
                        </div>
                        <p className="text-zinc-400 text-sm mt-3 leading-relaxed">{role.desc}</p>
                      </div>
                      <div className="shrink-0">
                        <button
                          type="button"
                          onClick={() => setApplyingFor(role.title)}
                          className="inline-flex items-center gap-2 px-5 py-2.5 bg-zinc-800 hover:bg-violet-600 border border-zinc-700 hover:border-violet-600 text-zinc-200 hover:text-white text-sm font-semibold rounded-xl transition-all duration-200"
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
            <div className="mt-12 relative overflow-hidden rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 via-zinc-900 to-zinc-900 p-8 text-center">
              <h3 className="text-xl font-bold text-white mb-2">Don't see your role?</h3>
              <p className="text-zinc-400 mb-6">
                Send us your profile and the kind of problems you want to solve.
              </p>
              <Link to="/contact">
                <button className="inline-flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl transition">
                  Contact recruiting <ArrowRight size={16} />
                </button>
              </Link>
            </div>
          </>
        )}
      </div>

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
