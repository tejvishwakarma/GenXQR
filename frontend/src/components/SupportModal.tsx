import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { MessageCircleQuestion, X, Send, CheckCircle2, Loader2, ChevronDown } from "lucide-react"
import { createSupportTicket, type SupportTicketCategory } from "@/lib/api"

const CATEGORIES: { value: SupportTicketCategory; label: string }[] = [
  { value: "billing",         label: "💳 Billing & Payments" },
  { value: "technical",      label: "🔧 Technical Issue" },
  { value: "feature_request",label: "✨ Feature Request" },
  { value: "other",          label: "💬 Other" },
]

export function SupportModal() {
  const [open, setOpen] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [ticketShortId, setTicketShortId] = useState("")
  const [form, setForm] = useState({
    subject:  "",
    message:  "",
    category: "other" as SupportTicketCategory,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const mutation = useMutation({
    mutationFn: () => createSupportTicket(form),
    onSuccess: (res) => {
      setTicketShortId(res.data.shortId)
      setSubmitted(true)
    },
  })

  function validate() {
    const e: Record<string, string> = {}
    if (form.subject.trim().length < 5)  e["subject"]  = "Subject must be at least 5 characters"
    if (form.message.trim().length < 20) e["message"]  = "Please provide more detail (min 20 chars)"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    mutation.mutate()
  }

  function handleClose() {
    setOpen(false)
    setTimeout(() => {
      setSubmitted(false)
      setTicketShortId("")
      setForm({ subject: "", message: "", category: "other" })
      setErrors({})
      mutation.reset()
    }, 300)
  }

  return (
    <>
      {/* Floating button */}
      <button
        id="support-fab"
        onClick={() => setOpen(true)}
        aria-label="Get help"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-violet-600 hover:bg-violet-500 shadow-[0_0_24px_rgba(124,58,237,0.5)] flex items-center justify-center text-white transition-all duration-200 hover:scale-110 active:scale-95"
      >
        <MessageCircleQuestion size={24} />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={handleClose}
        />
      )}

      {/* Modal panel */}
      <div
        className={`fixed z-50 inset-x-4 bottom-4 sm:inset-auto sm:bottom-24 sm:right-6 sm:w-[420px] transition-all duration-300 ${
          open ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-4 pointer-events-none"
        }`}
      >
        <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-gradient-to-r from-violet-600/20 to-indigo-600/10">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-violet-600/30 border border-violet-500/40 flex items-center justify-center">
                <MessageCircleQuestion size={16} className="text-violet-400" />
              </div>
              <div>
                <p className="text-white text-sm font-semibold">Help & Support</p>
                <p className="text-zinc-500 text-xs">We typically reply in 1–2 days</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition"
            >
              <X size={14} />
            </button>
          </div>

          {/* Body */}
          <div className="p-5">
            {submitted ? (
              /* ── Success state ── */
              <div className="text-center py-8 space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto">
                  <CheckCircle2 size={32} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-white font-semibold text-lg">Ticket submitted!</p>
                  <p className="text-zinc-400 text-sm mt-1">
                    Ticket #{ticketShortId} — We'll get back to you soon.
                  </p>
                </div>
                <button
                  onClick={handleClose}
                  className="w-full px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium rounded-xl transition"
                >
                  Close
                </button>
              </div>
            ) : (
              /* ── Form state ── */
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Category */}
                <div>
                  <label className="block text-zinc-400 text-xs font-medium mb-1.5">Category</label>
                  <div className="relative">
                    <select
                      value={form.category}
                      onChange={(e) => setForm(f => ({ ...f, category: e.target.value as SupportTicketCategory }))}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl px-3 py-2.5 appearance-none focus:outline-none focus:border-violet-500 transition"
                    >
                      {CATEGORIES.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                  </div>
                </div>

                {/* Subject */}
                <div>
                  <label className="block text-zinc-400 text-xs font-medium mb-1.5">Subject</label>
                  <input
                    type="text"
                    value={form.subject}
                    onChange={(e) => setForm(f => ({ ...f, subject: e.target.value }))}
                    placeholder="Brief summary of your issue"
                    className={`w-full bg-zinc-800 border text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none transition placeholder:text-zinc-600 ${
                      errors["subject"] ? "border-red-500" : "border-zinc-700 focus:border-violet-500"
                    }`}
                  />
                  {errors["subject"] && <p className="text-red-400 text-xs mt-1">{errors["subject"]}</p>}
                </div>

                {/* Message */}
                <div>
                  <label className="block text-zinc-400 text-xs font-medium mb-1.5">Message</label>
                  <textarea
                    rows={4}
                    value={form.message}
                    onChange={(e) => setForm(f => ({ ...f, message: e.target.value }))}
                    placeholder="Describe your issue in detail..."
                    className={`w-full bg-zinc-800 border text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none transition placeholder:text-zinc-600 resize-none ${
                      errors["message"] ? "border-red-500" : "border-zinc-700 focus:border-violet-500"
                    }`}
                  />
                  {errors["message"] && <p className="text-red-400 text-xs mt-1">{errors["message"]}</p>}
                </div>

                {mutation.isError && (
                  <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                    {(mutation.error as Error)?.message ?? "Failed to submit ticket. Please try again."}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={mutation.isPending}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {mutation.isPending ? (
                    <><Loader2 size={16} className="animate-spin" /> Submitting…</>
                  ) : (
                    <><Send size={16} /> Submit Ticket</>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
