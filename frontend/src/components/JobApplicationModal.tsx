import { useState, useRef, useCallback } from "react"
import { X, Send, CheckCircle2, Loader2, Upload, FileText, Trash2, Briefcase, ExternalLink } from "lucide-react"
import { IconTile } from "@/components/marketing/ui"

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
        className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-x-0 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 z-50 w-full sm:w-[600px] sm:max-h-[90vh] flex flex-col bg-paper-pure border border-line sm:rounded-2xl shadow-lift overflow-hidden max-h-[95vh]">

        {/* Header */}
        <div className="shrink-0 flex items-start justify-between px-6 py-5 border-b border-line bg-accent-soft">
          <div className="flex items-start gap-3">
            <IconTile icon={Briefcase} tint="violet" size="sm" className="mt-0.5" />
            <div>
              <p className="text-ink font-bold text-base leading-snug">Apply for this role</p>
              <p className="text-accent text-sm font-medium mt-0.5">{jobTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg border border-line bg-paper hover:border-ink/30 flex items-center justify-center text-ink-faint hover:text-ink transition-colors shrink-0 mt-0.5"
          >
            <X size={14} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {submitted ? (
            /* ── Success ── */
            <div className="flex flex-col items-center justify-center text-center py-16 px-8 gap-5">
              <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/20 dark:border-emerald-500/30 flex items-center justify-center">
                <CheckCircle2 size={40} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-ink font-bold text-2xl mb-2 font-display">Application sent!</p>
                <p className="text-ink-soft leading-relaxed max-w-xs">
                  Thanks for applying for <span className="text-ink font-medium">{jobTitle}</span>.
                  We'll review your profile and reach out if there's a strong match.
                </p>
              </div>
              <button
                onClick={onClose}
                className="px-6 py-2.5 border border-line bg-paper hover:border-ink/30 text-ink text-sm font-semibold rounded-full transition-colors"
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
                    <ExternalLink size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
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
                <p className="text-ink-faint text-xs mt-1">{form.coverLetter.length} / 5000</p>
              </Field>

              {/* CV Upload */}
              <Field label="CV / Resume *" error={errors["cv"] ?? cvError}>
                {cv ? (
                  <div className="flex items-center gap-3 px-4 py-3 bg-paper border border-line rounded-xl">
                    <FileText size={18} className="text-accent shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-ink text-sm font-medium truncate">{cv.name}</p>
                      <p className="text-ink-faint text-xs">{(cv.size / 1024).toFixed(0)} KB</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setCv(null); setCvError("") }}
                      className="text-ink-faint hover:text-red-500 transition-colors"
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
                    className={`flex flex-col items-center justify-center gap-2 py-7 px-4 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                      dragOver
                        ? "border-accent bg-accent-soft"
                        : errors["cv"] || cvError
                        ? "border-red-500/50 bg-red-500/5 hover:border-red-400"
                        : "border-line hover:border-accent hover:bg-accent-soft"
                    }`}
                  >
                    <Upload size={24} className="text-ink-faint" />
                    <div className="text-center">
                      <p className="text-ink-soft text-sm font-medium">Drop your CV here or click to browse</p>
                      <p className="text-ink-faint text-xs mt-1">PDF, DOC, DOCX · Max 5 MB</p>
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
                <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-sm">
                  {serverError}
                </div>
              )}

              {/* Submit — visually matches MktButton variant="accent"; kept as a native
                  submit button (not <MktButton>, which renders an <a>) so the form's
                  native submit/disabled semantics and handleSubmit wiring stay intact. */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 h-11 px-5 bg-accent hover:bg-accent-ink text-white font-medium text-sm rounded-full shadow-[0_12px_34px_-12px_rgba(91,75,255,0.65)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <><Loader2 size={16} className="animate-spin" /> Submitting Application…</>
                ) : (
                  <><Send size={16} /> Submit Application</>
                )}
              </button>

              <p className="text-center text-ink-faint text-xs">
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
      <label className="block text-ink-faint text-xs font-medium mb-1.5">{label}</label>
      {children}
      {error && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{error}</p>}
    </div>
  )
}

function input(hasError: boolean) {
  return `w-full bg-paper border text-ink text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 transition-colors placeholder:text-ink-faint ${
    hasError
      ? "border-red-500 focus:border-red-500 focus:ring-red-500/30"
      : "border-line focus:border-accent focus:ring-accent/40"
  }`
}
