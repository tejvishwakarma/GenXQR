import { useState, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Plus, Pencil, Trash2, ChevronDown, Loader2, Briefcase,
  MapPin, Clock, CheckCircle2, PauseCircle, XCircle, X, Save,
  Users, Search, Mail, Phone, ExternalLink, FileText,
  AlertCircle, ChevronRight, StickyNote, Download,
} from "lucide-react"
import {
  fetchAdminJobs, createJob, updateJob, deleteJob,
  fetchAdminApplications, updateApplication, deleteApplication,
  fetchNewApplicationCount, getCvDownloadUrl,
  type JobPosting, type JobStatus, type CreateJobInput,
  type JobApplication, type ApplicationStatus,
} from "@/lib/api"

// ── Shared status configs ─────────────────────────────────────────────────────

const JOB_STATUS: Record<JobStatus, { label: string; color: string; icon: React.ReactNode; desc: string }> = {
  OPEN:   { label: "Open",   color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: <CheckCircle2 size={13} />, desc: "Visible on careers page" },
  PAUSED: { label: "Paused", color: "bg-amber-500/15 text-amber-400 border-amber-500/30",       icon: <PauseCircle  size={13} />, desc: "Hidden while reviewing" },
  FILLED: { label: "Filled", color: "bg-blue-500/15 text-blue-400 border-blue-500/30",          icon: <CheckCircle2 size={13} />, desc: "Position filled" },
  CLOSED: { label: "Closed", color: "bg-zinc-700 text-zinc-400 border-zinc-600",                icon: <XCircle      size={13} />, desc: "Permanently closed" },
}

const APP_STATUS: Record<ApplicationStatus, { label: string; color: string }> = {
  NEW:         { label: "New",         color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  REVIEWING:   { label: "Reviewing",   color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  SHORTLISTED: { label: "Shortlisted", color: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  REJECTED:    { label: "Rejected",    color: "bg-red-500/15 text-red-400 border-red-500/30" },
  HIRED:       { label: "Hired",       color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
}

const DEPT_OPTIONS = ["Engineering", "Design", "Marketing", "Operations", "Product", "Sales", "Other"]
const TYPE_OPTIONS = [
  "Full-time · Remote", "Full-time · On-site", "Full-time · Hybrid",
  "Part-time · Remote", "Contract · Remote", "Internship",
]
const EMPTY_FORM: CreateJobInput = {
  title: "", department: "", location: "", type: "Full-time · Remote", description: "", status: "OPEN",
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1 — JOB POSTINGS
// ═══════════════════════════════════════════════════════════════════════════════

function JobForm({ initial, onSave, onCancel, isPending }: {
  initial: CreateJobInput; onSave: (d: CreateJobInput) => void; onCancel: () => void; isPending: boolean
}) {
  const [form, setForm] = useState<CreateJobInput>(initial)
  const set = (k: keyof CreateJobInput, v: string) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form) }} className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-zinc-400 text-xs font-medium mb-1.5">Job Title *</label>
          <input value={form.title} onChange={(e) => set("title", e.target.value)} required
            placeholder="e.g. Senior Frontend Engineer"
            className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-red-500 placeholder:text-zinc-600" />
        </div>
        <div>
          <label className="block text-zinc-400 text-xs font-medium mb-1.5">Employment Type *</label>
          <select value={form.type} onChange={(e) => set("type", e.target.value)} required
            className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-red-500">
            {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-zinc-400 text-xs font-medium mb-1.5">Department</label>
          <select value={form.department ?? ""} onChange={(e) => set("department", e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-red-500">
            <option value="">— None —</option>
            {DEPT_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-zinc-400 text-xs font-medium mb-1.5">Location</label>
          <input value={form.location ?? ""} onChange={(e) => set("location", e.target.value)}
            placeholder="e.g. Remote, Bangalore"
            className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-red-500 placeholder:text-zinc-600" />
        </div>
      </div>
      {initial.status !== undefined && (
        <div>
          <label className="block text-zinc-400 text-xs font-medium mb-1.5">Status</label>
          <select value={form.status} onChange={(e) => set("status", e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-red-500">
            {(Object.keys(JOB_STATUS) as JobStatus[]).map((s) => (
              <option key={s} value={s}>{JOB_STATUS[s].label} — {JOB_STATUS[s].desc}</option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="block text-zinc-400 text-xs font-medium mb-1.5">Job Description *</label>
        <textarea value={form.description} onChange={(e) => set("description", e.target.value)}
          rows={6} required minLength={20}
          placeholder="Describe the role, responsibilities, requirements…"
          className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-red-500 resize-none placeholder:text-zinc-600" />
        <p className="text-zinc-600 text-xs mt-1">{form.description.length} / 10000</p>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition">Cancel</button>
        <button type="submit" disabled={isPending}
          className="flex items-center gap-2 px-5 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-xl transition disabled:opacity-50">
          {isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Job
        </button>
      </div>
    </form>
  )
}

function StatusPicker({ job }: { job: JobPosting }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const mutation = useMutation({
    mutationFn: (status: JobStatus) => updateJob(job.id, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "careers-jobs"] }); setOpen(false) },
  })
  const cfg = JOB_STATUS[job.status]
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${cfg.color} hover:opacity-80`}>
        {cfg.icon} {cfg.label}
        <ChevronDown size={10} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 left-0 z-20 w-64 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
            {(Object.keys(JOB_STATUS) as JobStatus[]).map((s) => {
              const c = JOB_STATUS[s]
              return (
                <button key={s} disabled={mutation.isPending || s === job.status}
                  onClick={() => mutation.mutate(s)}
                  className={`w-full flex items-start gap-2.5 px-4 py-3 text-left hover:bg-zinc-800 transition disabled:opacity-40 ${s === job.status ? "bg-zinc-800/50" : ""}`}>
                  <span className={`mt-0.5 ${c.color.split(" ").find((x) => x.startsWith("text-"))}`}>{c.icon}</span>
                  <div>
                    <div className="text-white text-xs font-semibold">{c.label}</div>
                    <div className="text-zinc-500 text-[11px] mt-0.5">{c.desc}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function JobPostingsTab() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editingJob, setEditingJob] = useState<JobPosting | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ["admin", "careers-jobs"], queryFn: fetchAdminJobs })
  const jobs: JobPosting[] = data?.data ?? []

  const createMutation = useMutation({
    mutationFn: createJob,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "careers-jobs"] }); setShowCreate(false) },
  })
  const editMutation = useMutation({
    mutationFn: (input: Partial<CreateJobInput>) => updateJob(editingJob!.id, input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "careers-jobs"] }); setEditingJob(null) },
  })
  const deleteMutation = useMutation({
    mutationFn: deleteJob,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "careers-jobs"] }); setDeletingId(null) },
  })

  const openCount = jobs.filter((j) => j.status === "OPEN").length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-zinc-500 text-sm">
          <span className="text-emerald-400 font-medium">{openCount} open</span> · {jobs.length} total
          <span className="text-zinc-600"> — only Open jobs appear publicly</span>
        </p>
        <button onClick={() => { setShowCreate(true); setEditingJob(null) }}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-xl transition">
          <Plus size={15} /> Post a Job
        </button>
      </div>

      {showCreate && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <Briefcase size={15} className="text-red-400" /> New Job Posting
          </h3>
          <JobForm initial={EMPTY_FORM} onSave={(d) => createMutation.mutate(d)}
            onCancel={() => setShowCreate(false)} isPending={createMutation.isPending} />
          {createMutation.isError && (
            <p className="text-red-400 text-sm mt-2 flex items-center gap-1.5"><AlertCircle size={13} /> Failed to create. Please try again.</p>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-red-400 animate-spin" /></div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center">
            <Briefcase size={24} className="text-zinc-600" />
          </div>
          <p className="text-zinc-400 font-medium">No job postings yet</p>
          <p className="text-zinc-600 text-sm">Click "Post a Job" to create your first listing.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div key={job.id}>
              {editingJob?.id === job.id ? (
                <div className="bg-zinc-900 border border-red-500/30 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white font-semibold text-sm flex items-center gap-2"><Pencil size={13} className="text-red-400" /> Editing: {job.title}</h3>
                    <button onClick={() => setEditingJob(null)} className="text-zinc-500 hover:text-zinc-300 transition"><X size={15} /></button>
                  </div>
                  <JobForm
                    initial={{ title: job.title, department: job.department ?? "", location: job.location ?? "", type: job.type, description: job.description, status: job.status }}
                    onSave={(d) => editMutation.mutate(d)} onCancel={() => setEditingJob(null)} isPending={editMutation.isPending} />
                </div>
              ) : (
                <div className={`group bg-zinc-900 border rounded-2xl p-5 transition ${job.status !== "OPEN" ? "border-zinc-800/50 opacity-60" : "border-zinc-800 hover:border-zinc-700"}`}>
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <StatusPicker job={job} />
                        {job.department && <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">{job.department}</span>}
                      </div>
                      <h3 className="text-white font-bold">{job.title}</h3>
                      <div className="flex flex-wrap items-center gap-3 mt-1 mb-3">
                        <span className="flex items-center gap-1 text-zinc-500 text-xs"><Clock size={11} /> {job.type}</span>
                        {job.location && <span className="flex items-center gap-1 text-zinc-500 text-xs"><MapPin size={11} /> {job.location}</span>}
                        <span className="text-zinc-600 text-xs">Posted {new Date(job.postedAt).toLocaleDateString()}</span>
                      </div>
                      <p className="text-zinc-400 text-sm leading-relaxed line-clamp-2">{job.description}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => { setEditingJob(job); setShowCreate(false) }}
                        className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition" title="Edit">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => setDeletingId(job.id)}
                        className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-red-500/20 border border-zinc-700 hover:border-red-500/30 flex items-center justify-center text-zinc-400 hover:text-red-400 transition" title="Delete">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      {deletingId && (
        <>
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={() => setDeletingId(null)} />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 sm:inset-auto sm:left-1/2 sm:-translate-x-1/2 z-50 w-full sm:max-w-md bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0"><Trash2 size={18} className="text-red-400" /></div>
              <div>
                <h3 className="text-white font-semibold">Delete job posting?</h3>
                <p className="text-zinc-400 text-sm mt-1">This is permanent. If the role is filled, set the status to <strong className="text-blue-400">Filled</strong> instead to preserve the record.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeletingId(null)} className="flex-1 py-2.5 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-xl transition">Cancel</button>
              <button onClick={() => deleteMutation.mutate(deletingId)} disabled={deleteMutation.isPending}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-xl transition disabled:opacity-50">
                {deleteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete Permanently
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2 — RECEIVED APPLICATIONS
// ═══════════════════════════════════════════════════════════════════════════════

function ApplicationDrawer({ app, onClose }: { app: JobApplication; onClose: () => void }) {
  const qc = useQueryClient()
  const [status, setStatus] = useState<ApplicationStatus>(app.status)
  const [notes, setNotes]   = useState(app.notes ?? "")

  const mutation = useMutation({
    mutationFn: () => updateApplication(app.id, { status, notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "careers-applications"] })
      qc.invalidateQueries({ queryKey: ["admin", "careers-application-count"] })
      onClose()
    },
  })

  const delMutation = useMutation({
    mutationFn: () => deleteApplication(app.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "careers-applications"] })
      qc.invalidateQueries({ queryKey: ["admin", "careers-application-count"] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-zinc-950 border-l border-zinc-800 flex flex-col h-full overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800 shrink-0">
          <h2 className="text-white font-semibold">Application</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition text-xl leading-none">&times;</button>
        </div>

        <div className="flex-1 p-5 space-y-5 overflow-y-auto">
          {/* Applicant info */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-white font-bold text-base">{app.name}</p>
                <p className="text-zinc-500 text-xs mt-0.5">Applied for <span className="text-zinc-300">{app.jobTitle}</span></p>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-lg border font-semibold ${APP_STATUS[app.status].color}`}>
                {APP_STATUS[app.status].label}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <a href={`mailto:${app.email}`} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-violet-400 transition">
                <Mail size={13} className="shrink-0" /> {app.email}
              </a>
              {app.phone && (
                <a href={`tel:${app.phone}`} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-violet-400 transition">
                  <Phone size={13} className="shrink-0" /> {app.phone}
                </a>
              )}
              {app.linkedin && (
                <a href={app.linkedin} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-zinc-400 hover:text-violet-400 transition">
                  <ExternalLink size={13} className="shrink-0" /> LinkedIn Profile
                </a>
              )}
              {app.experience && (
                <span className="flex items-center gap-2 text-sm text-zinc-400">
                  <Clock size={13} className="shrink-0" /> {app.experience}
                </span>
              )}
              <span className="flex items-center gap-2 text-sm text-zinc-400">
                <FileText size={13} className="shrink-0" /> {app.cvFilename}
              </span>
              {/* CV Download — primary CTA */}
              <a
                href={getCvDownloadUrl(app.id)}
                download={app.cvFilename}
                className="mt-1 flex items-center gap-2 w-full px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-xl transition"
              >
                <Download size={13} /> Download CV — {app.cvFilename}
              </a>
            </div>
            <p className="text-zinc-600 text-xs">Submitted {new Date(app.createdAt).toLocaleString()}</p>
          </div>

          {/* Cover letter */}
          <div>
            <p className="text-zinc-500 text-xs font-medium mb-2">Cover Letter</p>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
              {app.coverLetter}
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="text-zinc-500 text-xs font-medium block mb-2">Application Status</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(Object.keys(APP_STATUS) as ApplicationStatus[]).map((s) => (
                <button key={s} onClick={() => setStatus(s)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition ${status === s ? APP_STATUS[s].color : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700"}`}>
                  {APP_STATUS[s].label}
                </button>
              ))}
            </div>
          </div>

          {/* Internal notes */}
          <div>
            <label className="text-zinc-500 text-xs font-medium block mb-2 flex items-center gap-1.5">
              <StickyNote size={12} /> Recruiter Notes <span className="text-zinc-700">(internal only)</span>
            </label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4}
              placeholder="Add interview feedback, screening notes…"
              className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl px-4 py-3 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-red-500/40 resize-none" />
          </div>
        </div>

        <div className="p-5 border-t border-zinc-800 shrink-0 flex gap-3">
          <button onClick={() => delMutation.mutate()} disabled={delMutation.isPending}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-red-500/20 border border-zinc-700 hover:border-red-500/30 text-zinc-400 hover:text-red-400 transition" title="Delete application">
            {delMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
          <button onClick={onClose} className="flex-1 py-2.5 text-sm text-zinc-400 hover:text-zinc-200 transition">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm rounded-xl transition disabled:opacity-50">
            {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null} Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}

function ApplicationsTab() {
  const [page, setPage]           = useState(1)
  const [statusFilter, setStatus] = useState("")
  const [search, setSearch]       = useState("")
  const [q, setQ]                 = useState("")
  const [selected, setSelected]   = useState<JobApplication | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "careers-applications", page, statusFilter, q],
    queryFn:  () => fetchAdminApplications(page, statusFilter, q),
  })

  const apps: JobApplication[] = data?.data ?? []
  const meta = data?.meta

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault(); setQ(search); setPage(1)
  }, [search])

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={statusFilter} onChange={(e) => { setStatus(e.target.value); setPage(1) }}
          className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm rounded-xl px-3 py-2 focus:outline-none">
          <option value="">All statuses</option>
          {(Object.keys(APP_STATUS) as ApplicationStatus[]).map((s) => (
            <option key={s} value={s}>{APP_STATUS[s].label}</option>
          ))}
        </select>
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-0 max-w-xs">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email, or job…"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-8 pr-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none" />
          </div>
          <button type="submit" className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded-xl transition">Search</button>
        </form>
        {meta && <p className="text-zinc-500 text-sm ml-auto">{meta.total.toLocaleString()} application{meta.total !== 1 ? "s" : ""}</p>}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-red-400 animate-spin" /></div>
      ) : apps.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center">
            <Users size={24} className="text-zinc-600" />
          </div>
          <p className="text-zinc-400 font-medium">No applications yet</p>
          <p className="text-zinc-600 text-sm">Applications will appear here when candidates apply from the careers page.</p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left text-zinc-500 font-medium px-5 py-3">Candidate</th>
                <th className="text-left text-zinc-500 font-medium px-4 py-3">Role</th>
                <th className="text-left text-zinc-500 font-medium px-4 py-3">Experience</th>
                <th className="text-left text-zinc-500 font-medium px-4 py-3">Status</th>
                <th className="text-left text-zinc-500 font-medium px-4 py-3">Date</th>
                <th className="text-right text-zinc-500 font-medium px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => (
                <tr key={app.id} onClick={() => setSelected(app)}
                  className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition cursor-pointer">
                  <td className="px-5 py-3">
                    <div className="text-zinc-200 text-sm font-medium">{app.name}</div>
                    <div className="text-zinc-500 text-xs">{app.email}</div>
                  </td>
                  <td className="px-4 py-3 text-zinc-300 text-sm max-w-[180px] truncate">{app.jobTitle}</td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">{app.experience ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-md border font-medium ${APP_STATUS[app.status].color}`}>
                      {APP_STATUS[app.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">{new Date(app.createdAt).toLocaleDateString()}</td>
                  <td className="px-5 py-3 text-right">
                    <ChevronRight size={14} className="text-zinc-600 inline-block" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Pagination */}
          {meta && meta.pages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-800">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                className="text-zinc-400 text-sm disabled:opacity-30 hover:text-white transition">← Prev</button>
              <span className="text-zinc-500 text-xs">Page {page} of {meta.pages}</span>
              <button disabled={page >= meta.pages} onClick={() => setPage((p) => p + 1)}
                className="text-zinc-400 text-sm disabled:opacity-30 hover:text-white transition">Next →</button>
            </div>
          )}
        </div>
      )}

      {selected && <ApplicationDrawer app={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE — Two tabs
// ═══════════════════════════════════════════════════════════════════════════════

type Tab = "postings" | "applications"

export default function AdminCareersPage() {
  const [tab, setTab] = useState<Tab>("postings")

  // Use the dedicated count endpoint — same source of truth as the sidebar badge
  const { data: newCount = 0 } = useQuery({
    queryKey: ["admin", "careers-application-count"],
    queryFn:  fetchNewApplicationCount,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  return (
    <div className="max-w-5xl space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Careers</h1>
        <p className="text-zinc-500 text-sm">Manage job postings and review received applications.</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-2xl p-1 w-fit">
        {([
          { key: "postings",      label: "Job Postings",  icon: <Briefcase size={14} /> },
          { key: "applications",  label: "Applications",  icon: <Users size={14} />,
            badge: newCount > 0 ? newCount : null },
        ] as { key: Tab; label: string; icon: React.ReactNode; badge?: number | null }[]).map(({ key, label, icon, badge }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`relative flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl transition ${
              tab === key ? "bg-red-600 text-white shadow" : "text-zinc-400 hover:text-zinc-200"
            }`}>
            {icon} {label}
            {badge != null && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-white text-red-600 text-[10px] font-bold flex items-center justify-center">
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "postings"     && <JobPostingsTab />}
      {tab === "applications" && <ApplicationsTab />}
    </div>
  )
}
