import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { LifeBuoy, Plus, Loader2, Check, X, MessageSquare } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { listMyTickets, createSupportTicket, type SupportTicketCategory } from "@/lib/api"

/**
 * Help & Support — the customer's side of the ticket system.
 *
 * The backend already exposed POST and GET /api/support/tickets, but nothing in
 * the app called them: the ticket confirmation email told people to "track your
 * ticket status from your dashboard → Help & Support" and that page did not
 * exist. Admin has had its own view all along, so tickets were arriving and being
 * worked on with no way for the submitter to see what happened.
 */

/** Kept in step with the server enum and the labels used in the admin view. */
const CATEGORIES: { value: SupportTicketCategory; label: string }[] = [
  { value: "technical",       label: "Technical" },
  { value: "billing",         label: "Billing" },
  { value: "feature_request", label: "Feature request" },
  { value: "other",           label: "Other" },
]

const CATEGORY_LABEL: Record<string, string> = {
  billing: "Billing",
  technical: "Technical",
  feature_request: "Feature request",
  other: "Other",
  general: "General",
}

/** Same palette as the admin list, so a status means the same thing in both. */
const STATUS_STYLE: Record<string, string> = {
  OPEN:        "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  IN_PROGRESS: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  RESOLVED:    "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  CLOSED:      "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
}

const STATUS_LABEL: Record<string, string> = {
  OPEN:        "Open",
  IN_PROGRESS: "In progress",
  RESOLVED:    "Resolved",
  CLOSED:      "Closed",
}

// The server enforces these too; checking here saves a round trip and names the
// field that is wrong.
const MIN_SUBJECT = 5
const MIN_MESSAGE = 20

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
}

export default function SupportPage() {
  const qc = useQueryClient()
  // A closed ticket links here with ?new=1, since closed is terminal and the way
  // forward is a fresh ticket. Opening the form straight away saves a second click
  // at the point someone has already decided.
  const [params] = useSearchParams()
  const [showForm, setShowForm] = useState(params.get("new") === "1")
  const [subject, setSubject] = useState("")
  const [category, setCategory] = useState<SupportTicketCategory>("technical")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["my-tickets"],
    queryFn: () => listMyTickets(1, 50),
  })
  const tickets = data?.data ?? []

  const create = useMutation({
    mutationFn: () => createSupportTicket({ subject, message, category }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["my-tickets"] })
      setSubject("")
      setMessage("")
      setCategory("technical")
      setError("")
      setShowForm(false)
    },
    onError: (err: Error) => setError(err.message || "Could not submit your ticket. Please try again."),
  })

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (create.isPending) return
    if (subject.trim().length < MIN_SUBJECT) {
      setError(`Please give the subject at least ${MIN_SUBJECT} characters.`)
      return
    }
    if (message.trim().length < MIN_MESSAGE) {
      setError(`Please describe the problem in at least ${MIN_MESSAGE} characters.`)
      return
    }
    setError("")
    create.mutate()
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <LifeBuoy size={18} className="text-violet-500 dark:text-violet-400" />
            Help &amp; Support
          </h1>
          <p className="text-zinc-500 text-sm mt-0.5">
            Raise a ticket, read our replies, and follow up — all in one place.
          </p>
        </div>
        {!showForm && (
          <Button size="sm" className="gap-1.5 shrink-0" onClick={() => { setShowForm(true); setError("") }}>
            <Plus size={14} /> New ticket
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">New ticket</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} noValidate className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label htmlFor="ticket-subject" className="text-xs text-zinc-500 mb-1 block">Subject</label>
                  <Input
                    id="ticket-subject"
                    name="subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Short summary of the problem"
                    className="h-9 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="ticket-category" className="text-xs text-zinc-500 mb-1 block">Category</label>
                  <select
                    id="ticket-category"
                    name="category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as SupportTicketCategory)}
                    className="w-full h-9 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 text-sm text-zinc-800 dark:text-zinc-200"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="ticket-message" className="text-xs text-zinc-500 mb-1 block">
                  What is happening?
                </label>
                <textarea
                  id="ticket-message"
                  name="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Include what you expected, what happened instead, and anything you have already tried."
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2.5 text-sm text-zinc-800 dark:text-zinc-200 resize-none h-28"
                />
              </div>

              {error && <p role="alert" className="text-red-500 text-xs">{error}</p>}

              <div className="flex gap-2 pt-1">
                <Button type="submit" size="sm" disabled={create.isPending} className="gap-1.5">
                  {create.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Submit ticket
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => { setShowForm(false); setError("") }}
                >
                  <X size={14} /> Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Your tickets</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-zinc-100 dark:bg-zinc-800/60 animate-pulse" />
              ))}
            </div>
          ) : tickets.length === 0 ? (
            <div className="py-10 text-center">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
                <MessageSquare size={18} className="text-zinc-500 dark:text-zinc-400" />
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">No tickets yet.</p>
              <p className="text-xs text-zinc-500 mt-1">
                Raise one and it will appear here with its whole conversation.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {tickets.map((t) => (
                <Link
                  key={t.id}
                  to={`/app/support/${t.id}`}
                  className="block py-4 first:pt-0 last:pb-0 -mx-2 px-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-zinc-900 dark:text-white">{t.subject}</div>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {/* Same short reference the confirmation email quotes, so the
                            two can be matched up. */}
                        #{t.id.slice(0, 8).toUpperCase()} · {CATEGORY_LABEL[t.category] ?? t.category} · {formatDate(t.createdAt)}
                        {t.resolvedAt && ` · resolved ${formatDate(t.resolvedAt)}`}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-md shrink-0 ${STATUS_STYLE[t.status] ?? "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"}`}>
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 line-clamp-2 break-words">
                    {t.message}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4">
          <p className="text-xs text-zinc-500">
            We email you when support replies, and you can answer right on the
            ticket. Replying to a resolved ticket reopens it.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
