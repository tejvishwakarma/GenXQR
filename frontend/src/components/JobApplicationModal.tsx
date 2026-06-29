import { useState, useRef, useCallback } from "react"
import { X, Send, CheckCircle2, Loader2, Upload, FileText, Trash2, Briefcase, ExternalLink } from "lucide-react"

const EXPERIENCE_OPTIONS = [
  "Less than 1 year",
  "1–2 years",
  "3–5 years",
  "5–8 years",
  "8+ years",
]

const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ""

interface Props {
  jobTitle: string
  onClose: () => void
}

export function JobApplicationModal({ jobTitle, onClose }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    name:        "",
    email:       "",
    phone:       "",
    linkedin:    "",
    experience:  "",
    coverLetter: "",
  })
  const [cv, setCv] = useState<File | null>(null)
  const [cvError, setCvError] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState("")
  const [dragOver, setDragOver] = useState(false)

  function setField(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => { const next = { ...e }; delete next[key]; return next })
  }

  function handleFile(file: File) {
    setCvError("")
    if (!ALLOWED_TYPES.includes(file.type)) {
      setCvError("Only PDF, DOC, or DOCX files are accepted.")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setCvError("File must be under 5 MB.")
      return
    }
    setCv(file)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [])

  function validate() {
    const e: Record<string, string> = {}
    if (form.name.trim().length < 2)       e["name"] = "Name is required"
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e["email"] = "Valid email required"
    if (form.coverLetter.trim().length < 50) e["coverLetter"] = "Cover letter must be at least 50 characters"
    if (!cv) e["cv"] = "Please attach your CV"
    if (form.linkedin && !/^https?:\/\//i.test(form.linkedin))
      e["linkedin"] = "LinkedIn URL must start with https://"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setServerError("")
    if (!validate()) return

    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append("name",        form.name)
      fd.append("email",       form.email)
      fd.append("phone",       form.phone)
      fd.append("linkedin",    form.linkedin)
      fd.append("experience",  form.experience)
      fd.append("jobTitle",    jobTitle)
      fd.append("coverLetter", form.coverLetter)
      fd.append("cv",          cv!)

      const res = await fetch(`${API_BASE}/api/careers/apply`, {
        method: "POST",
        body: fd,
      })

      const body = await res.json() as { success: boolean; message?: string; error?: string }

      if (!res.ok) {
        setServerError(body.error ?? "Submission failed. Please try again.")
        return
      }

      setSubmitted(true)
    } catch {
      setServerError("Network error — please check your connection and try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-x-0 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 z-50 w-full sm:w-[600px] sm:max-h-[90vh] flex flex-col bg-zinc-900 border border-zinc-700 sm:rounded-2xl shadow-2xl overflow-hidden max-h-[95vh]">

        {/* Header */}
        <div className="shrink-0 flex items-start justify-between px-6 py-5 border-b border-zinc-800 bg-gradient-to-r from-violet-600/15 to-indigo-600/10">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center mt-0.5">
              <Briefcase size={17} className="text-violet-400" />
            </div>
            <div>
              <p className="text-white font-bold text-base leading-snug">Apply for this role</p>
              <p className="text-violet-400 text-sm font-medium mt-0.5">{jobTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition shrink-0 mt-0.5"
          >
            <X size={14} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {submitted ? (
            /* ── Success ── */
            <div className="flex flex-col items-center justify-center text-center py-16 px-8 gap-5">
              <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                <CheckCircle2 size={40} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-white font-bold text-2xl mb-2">Application sent!</p>
                <p className="text-zinc-400 leading-relaxed max-w-xs">
                  Thanks for applying for <span className="text-white font-medium">{jobTitle}</span>.
                  We'll review your profile and reach out if there's a strong match.
                </p>
              </div>
              <button
                onClick={onClose}
                className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-semibold rounded-xl transition"
              >
                Close
              </button>
            </div>
          ) : (
            /* ── Form ── */
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Name + Email */}
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Full Name *" error={errors["name"]}>
                  <input
                    value={form.name}
                    onChange={(e) => setField("name", e.target.value)}
                    placeholder="Jane Smith"
                    className={input(!!errors["name"])}
                  />
                </Field>
                <Field label="Email Address *" error={errors["email"]}>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setField("email", e.target.value)}
                    placeholder="jane@example.com"
                    className={input(!!errors["email"])}
                  />
                </Field>
              </div>

              {/* Phone + LinkedIn */}
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Phone (optional)">
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setField("phone", e.target.value)}
                    placeholder="+91 98765 43210"
                    className={input(false)}
                  />
                </Field>
                <Field label="LinkedIn URL (optional)" error={errors["linkedin"]}>
                  <div className="relative">
                    <input
                      value={form.linkedin}
                      onChange={(e) => setField("linkedin", e.target.value)}
                      placeholder="https://linkedin.com/in/..."
                      className={`${input(!!errors["linkedin"])} pr-9`}
                    />
                    <ExternalLink size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
                  </div>
                </Field>
              </div>

              {/* Experience */}
              <Field label="Years of Experience">
                <select
                  value={form.experience}
                  onChange={(e) => setField("experience", e.target.value)}
                  className={`${input(false)} appearance-none`}
                >
                  <option value="">— Select —</option>
                  {EXPERIENCE_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </Field>

              {/* Cover Letter */}
              <Field label="Cover Letter *" error={errors["coverLetter"]}>
                <textarea
                  rows={5}
                  value={form.coverLetter}
                  onChange={(e) => setField("coverLetter", e.target.value)}
                  placeholder="Tell us why you're a great fit, what excites you about this role, and what you'd bring to the team..."
                  className={`${input(!!errors["coverLetter"])} resize-none`}
                />
                <p className="text-zinc-600 text-xs mt-1">{form.coverLetter.length} / 5000</p>
              </Field>

              {/* CV Upload */}
              <Field label="CV / Resume *" error={errors["cv"] ?? cvError}>
                {cv ? (
                  <div className="flex items-center gap-3 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl">
                    <FileText size={18} className="text-violet-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{cv.name}</p>
                      <p className="text-zinc-500 text-xs">{(cv.size / 1024).toFixed(0)} KB</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setCv(null); setCvError("") }}
                      className="text-zinc-500 hover:text-red-400 transition"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex flex-col items-center justify-center gap-2 py-7 px-4 border-2 border-dashed rounded-xl cursor-pointer transition ${
                      dragOver
                        ? "border-violet-500 bg-violet-500/10"
                        : errors["cv"] || cvError
                        ? "border-red-500/50 bg-red-500/5 hover:border-red-400"
                        : "border-zinc-700 hover:border-violet-500 hover:bg-violet-500/5"
                    }`}
                  >
                    <Upload size={24} className="text-zinc-500" />
                    <div className="text-center">
                      <p className="text-zinc-300 text-sm font-medium">Drop your CV here or click to browse</p>
                      <p className="text-zinc-600 text-xs mt-1">PDF, DOC, DOCX · Max 5 MB</p>
                    </div>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
                />
              </Field>

              {/* Server error */}
              {serverError && (
                <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                  {serverError}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <><Loader2 size={16} className="animate-spin" /> Submitting Application…</>
                ) : (
                  <><Send size={16} /> Submit Application</>
                )}
              </button>

              <p className="text-center text-zinc-600 text-xs">
                Your application will be sent directly to our recruiting team.
              </p>
            </form>
          )}
        </div>
      </div>
    </>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-zinc-400 text-xs font-medium mb-1.5">{label}</label>
      {children}
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  )
}

function input(hasError: boolean) {
  return `w-full bg-zinc-800 border text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none transition placeholder:text-zinc-600 ${
    hasError ? "border-red-500 focus:border-red-400" : "border-zinc-700 focus:border-violet-500"
  }`
}
