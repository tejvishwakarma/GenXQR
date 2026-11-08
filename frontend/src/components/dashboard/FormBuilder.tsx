import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"

/** A FORM code's content as the editor holds it (backend: utils/typed-content.util.ts). */
export interface FormDraft {
  title: string
  intro: string
  submitLabel: string
  thankYou: string
  notify: boolean
  fields: FormFieldDraft[]
}

export interface FormFieldDraft {
  id: string
  label: string
  type: "text" | "email" | "phone" | "textarea" | "rating" | "select"
  required: boolean
  /** Choices for "select", one per line in the editor. */
  options: string
}

export const FIELD_TYPES: { value: FormFieldDraft["type"]; label: string }[] = [
  { value: "text", label: "Short answer" },
  { value: "textarea", label: "Long answer" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "rating", label: "Rating (1–5 stars)" },
  { value: "select", label: "Multiple choice" },
]

export const DEFAULT_FORM: FormDraft = {
  title: "",
  intro: "",
  submitLabel: "",
  thankYou: "",
  notify: true,
  fields: [
    { id: "name", label: "Name", type: "text", required: true, options: "" },
    { id: "phone", label: "Phone", type: "phone", required: false, options: "" },
    { id: "message", label: "Message", type: "textarea", required: false, options: "" },
  ],
}

/** A fresh id that is not taken: q1, q2, … */
function nextId(fields: FormFieldDraft[]): string {
  for (let i = 1; ; i++) if (!fields.some((f) => f.id === `q${i}`)) return `q${i}`
}

export function formDraftFromContent(d: Record<string, unknown>): FormDraft {
  const fields = Array.isArray(d.fields) ? (d.fields as Array<Record<string, unknown>>) : []
  return {
    title: String(d.title ?? ""),
    intro: String(d.intro ?? ""),
    submitLabel: String(d.submitLabel ?? ""),
    thankYou: String(d.thankYou ?? ""),
    notify: d.notify === true,
    fields: fields.map((f) => ({
      id: String(f.id ?? ""),
      label: String(f.label ?? ""),
      type: (FIELD_TYPES.some((t) => t.value === f.type) ? f.type : "text") as FormFieldDraft["type"],
      required: f.required === true,
      options: Array.isArray(f.options) ? (f.options as string[]).join("\n") : "",
    })),
  }
}

export function formContent(f: FormDraft): Record<string, unknown> {
  return {
    title: f.title,
    intro: f.intro,
    submitLabel: f.submitLabel,
    thankYou: f.thankYou,
    notify: f.notify,
    fields: f.fields.map((x) => ({
      id: x.id,
      label: x.label,
      type: x.type,
      required: x.required,
      ...(x.type === "select" && { options: x.options.split("\n").map((o) => o.trim()).filter(Boolean) }),
    })),
  }
}

/** The questions of a lead / feedback form: add, reorder, change type, mark required. */
export function FormBuilder({ value, onChange }: { value: FormDraft; onChange: (v: FormDraft) => void }) {
  const set = (patch: Partial<FormDraft>) => onChange({ ...value, ...patch })
  const setField = (i: number, patch: Partial<FormFieldDraft>) =>
    set({ fields: value.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) })
  const move = (i: number, by: number) => {
    const fields = [...value.fields]
    const [f] = fields.splice(i, 1)
    fields.splice(i + by, 0, f!)
    set({ fields })
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="label-text">Form title</label>
        <Input value={value.title} onChange={(e) => set({ title: e.target.value })} maxLength={150} placeholder="Tell us how we did" />
      </div>
      <div>
        <label className="label-text">Intro (optional)</label>
        <textarea value={value.intro} onChange={(e) => set({ intro: e.target.value })} maxLength={1000} rows={2} className="input-field resize-none" placeholder="Takes 30 seconds. Thank you!" />
      </div>

      <div className="space-y-3">
        <p className="label-text">Questions</p>
        {value.fields.map((f, i) => (
          <div key={i} className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 space-y-2">
            <div className="flex gap-2">
              <Input value={f.label} onChange={(e) => setField(i, { label: e.target.value })} maxLength={100} placeholder={`Question ${i + 1}`} aria-label={`Question ${i + 1}`} className="flex-1" />
              <select value={f.type} onChange={(e) => setField(i, { type: e.target.value as FormFieldDraft["type"] })} aria-label={`Answer type for question ${i + 1}`}
                className="h-10 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm text-zinc-900 dark:text-white">
                {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {f.type === "select" && (
              <textarea value={f.options} onChange={(e) => setField(i, { options: e.target.value })} rows={3} className="input-field resize-none text-sm"
                placeholder={"One choice per line, e.g.\nDine-in\nTakeaway"} aria-label={`Choices for question ${i + 1}`} />
            )}
            <div className="flex items-center justify-between">
              <label className="inline-flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                <input type="checkbox" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} className="accent-violet-600" />
                Required
              </label>
              <div className="flex items-center gap-1 text-zinc-400">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="p-1.5 rounded-lg hover:text-violet-500 disabled:opacity-30"><ArrowUp size={14} /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === value.fields.length - 1} aria-label="Move down" className="p-1.5 rounded-lg hover:text-violet-500 disabled:opacity-30"><ArrowDown size={14} /></button>
                <button type="button" onClick={() => set({ fields: value.fields.filter((_, j) => j !== i) })} disabled={value.fields.length === 1} aria-label="Remove question" className="p-1.5 rounded-lg hover:text-red-500 disabled:opacity-30"><Trash2 size={14} /></button>
              </div>
            </div>
          </div>
        ))}
        {value.fields.length < 15 && (
          <button type="button" onClick={() => set({ fields: [...value.fields, { id: nextId(value.fields), label: "", type: "text", required: false, options: "" }] })}
            className="w-full inline-flex items-center justify-center gap-1.5 h-10 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 text-sm text-zinc-500 hover:text-violet-500 hover:border-violet-500/60">
            <Plus size={14} /> Add question
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label-text">Button text (optional)</label>
          <Input value={value.submitLabel} onChange={(e) => set({ submitLabel: e.target.value })} maxLength={40} placeholder="Send" />
        </div>
        <div>
          <label className="label-text">Thank-you message (optional)</label>
          <Input value={value.thankYou} onChange={(e) => set({ thankYou: e.target.value })} maxLength={300} placeholder="Thanks! We'll be in touch." />
        </div>
      </div>
      <label className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
        <input type="checkbox" checked={value.notify} onChange={(e) => set({ notify: e.target.checked })} className="accent-violet-600 mt-0.5" />
        <span>Email me each response <span className="block text-xs text-zinc-500">All responses are also on the code's page, with a CSV download.</span></span>
      </label>
    </div>
  )
}
