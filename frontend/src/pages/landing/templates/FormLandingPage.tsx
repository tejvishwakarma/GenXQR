import { readableAccent } from "@/lib/utils"
import { useRef, useState } from "react"
import { CheckCircle2, Loader2, Star } from "lucide-react"
import { ApiError, submitFormResponse, type PublicQRFile } from "@/lib/api"
import { Turnstile, TURNSTILE_ENABLED, type TurnstileHandle } from "@/components/Turnstile"

interface Props {
  name: string
  content: Record<string, unknown>
  design: Record<string, unknown>
  files: PublicQRFile[]
  slug: string
  access?: string | null
}

interface Field {
  id: string
  label: string
  type: "text" | "email" | "phone" | "textarea" | "rating" | "select"
  required: boolean
  options?: string[]
}

const s = (v: unknown) => (typeof v === "string" ? v : "")
const inputClass = "w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent"

/** A FORM code's scan page: the owner's questions; answers go to the owner (form-response.service). */
export default function FormLandingPage({ name, content, design, slug, access }: Props) {
  const fields = (Array.isArray(content.fields) ? content.fields : []) as Field[]
  const accent = readableAccent(design)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle")
  const [error, setError] = useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const turnstileRef = useRef<TurnstileHandle>(null)
  const set = (id: string, v: string) => setAnswers((a) => ({ ...a, [id]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const missing = fields.find((f) => f.required && !(answers[f.id] ?? "").trim())
    if (missing) { setError(`Please answer "${missing.label}".`); return }
    if (TURNSTILE_ENABLED && !turnstileToken) { setError("Please complete the check below."); return }
    setState("sending")
    try {
      await submitFormResponse(slug, answers, access, turnstileToken ?? undefined)
      setState("sent")
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
      setState("idle")
      setTurnstileToken(null)
      turnstileRef.current?.reset()
    }
  }

  if (state === "sent") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <CheckCircle2 size={48} className="mx-auto" style={{ color: accent }} />
          <h1 className="text-2xl font-bold text-gray-900 mt-4">Thank you!</h1>
          <p className="text-gray-600 mt-2">{s(content.thankYou) || "Your response has been sent."}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <form onSubmit={submit} className="max-w-md mx-auto bg-white rounded-2xl shadow-sm p-6 space-y-5" noValidate>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{s(content.title) || name}</h1>
          {s(content.intro) && <p className="text-gray-600 text-sm mt-2 whitespace-pre-line">{s(content.intro)}</p>}
        </div>

        {fields.map((f) => {
          const id = `f-${f.id}`
          const label = (
            <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1.5">
              {f.label}{f.required && <span className="text-red-500"> *</span>}
            </label>
          )
          const common = { id, value: answers[f.id] ?? "", required: f.required, style: { ["--tw-ring-color" as string]: accent } }
          if (f.type === "rating") {
            const value = Number(answers[f.id] ?? 0)
            return (
              <div key={f.id}>
                <p className="block text-sm font-medium text-gray-700 mb-1.5" id={id}>{f.label}{f.required && <span className="text-red-500"> *</span>}</p>
                <div className="flex gap-1" role="radiogroup" aria-labelledby={id}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => set(f.id, String(n))} className="p-1">
                      <Star size={32} className={n <= value ? "fill-amber-400 text-amber-400" : "text-gray-300"} />
                    </button>
                  ))}
                </div>
              </div>
            )
          }
          if (f.type === "select") {
            return (
              <div key={f.id}>
                {label}
                <select {...common} onChange={(e) => set(f.id, e.target.value)} className={inputClass}>
                  <option value="">Choose…</option>
                  {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            )
          }
          if (f.type === "textarea") {
            return (
              <div key={f.id}>
                {label}
                <textarea {...common} onChange={(e) => set(f.id, e.target.value)} rows={4} maxLength={3000} className={`${inputClass} resize-none`} />
              </div>
            )
          }
          return (
            <div key={f.id}>
              {label}
              <input
                {...common}
                onChange={(e) => set(f.id, e.target.value)}
                type={f.type === "email" ? "email" : f.type === "phone" ? "tel" : "text"}
                inputMode={f.type === "phone" ? "tel" : f.type === "email" ? "email" : undefined}
                autoComplete={f.type === "email" ? "email" : f.type === "phone" ? "tel" : f.id === "name" ? "name" : "off"}
                maxLength={f.type === "email" ? 254 : f.type === "phone" ? 20 : 300}
                className={inputClass}
              />
            </div>
          )
        })}

        <Turnstile ref={turnstileRef} onVerify={setTurnstileToken} onExpire={() => setTurnstileToken(null)} />
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

        <button type="submit" disabled={state === "sending"} className="w-full rounded-xl text-white font-semibold py-3.5 inline-flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: accent }}>
          {state === "sending" && <Loader2 size={18} className="animate-spin" />}
          {s(content.submitLabel) || "Send"}
        </button>
        <p className="text-xs text-gray-400 text-center">Your answers go to the business that made this form.</p>
      </form>
    </div>
  )
}
