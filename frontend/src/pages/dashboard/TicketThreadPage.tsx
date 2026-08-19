import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Send, Loader2, LifeBuoy } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getMyTicket, replyToTicket } from "@/lib/api"

/**
 * One support ticket as a conversation the customer can read and add to.
 *
 * Before this, replies existed only in email: the dashboard could show that a
 * ticket had moved to RESOLVED but never what was actually said, so the answer
 * lived in an inbox and follow-ups arrived as brand new tickets.
 */

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

const MIN_REPLY = 2

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  })
}

export default function TicketThreadPage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [body, setBody] = useState("")
  const [error, setError] = useState("")

  const { data, isLoading, isError } = useQuery({
    queryKey: ["ticket", id],
    queryFn: () => getMyTicket(id!),
    enabled: !!id,
  })
  const ticket = data?.data

  const reply = useMutation({
    mutationFn: () => replyToTicket(id!, body),
    onSuccess: () => {
      setBody("")
      setError("")
      void qc.invalidateQueries({ queryKey: ["ticket", id] })
      // The list shows status, which a reply can change by reopening the ticket.
      void qc.invalidateQueries({ queryKey: ["my-tickets"] })
    },
    onError: (err: Error) => setError(err.message || "Could not send your reply. Please try again."),
  })

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (reply.isPending) return
    if (body.trim().length < MIN_REPLY) {
      setError("Write a reply first.")
      return
    }
    setError("")
    reply.mutate()
  }

  if (isError) {
    return (
      <div className="space-y-4 animate-fade-in max-w-3xl">
        <Link to="/app/support" className="text-sm text-violet-600 dark:text-violet-400 hover:underline">
          ← Back to Help &amp; Support
        </Link>
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-zinc-600 dark:text-zinc-300">This ticket could not be found.</p>
            <p className="text-xs text-zinc-500 mt-1">It may have been removed, or belong to another account.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in max-w-3xl">
      <div className="flex items-start gap-3">
        <Link to="/app/support" aria-label="Back to Help and Support">
          <button className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
            <ArrowLeft size={16} />
          </button>
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white break-words">
            {ticket?.subject ?? "Loading…"}
          </h1>
          {ticket && (
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-md ${STATUS_STYLE[ticket.status] ?? "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"}`}>
                {STATUS_LABEL[ticket.status] ?? ticket.status}
              </span>
              <span className="text-xs text-zinc-500">
                #{ticket.id.slice(0, 8).toUpperCase()} · opened {formatWhen(ticket.createdAt)}
              </span>
            </div>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="py-5 space-y-4">
          {isLoading ? (
            [0, 1].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-zinc-100 dark:bg-zinc-800/60 animate-pulse" />
            ))
          ) : (
            ticket?.messages.map((m) => (
              <div key={m.id} className={m.isStaff ? "flex justify-start" : "flex justify-end"}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    m.isStaff
                      ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
                      : "bg-violet-600 text-white"
                  }`}
                >
                  <div className={`text-[11px] font-medium mb-1 ${m.isStaff ? "text-zinc-500 dark:text-zinc-400" : "text-white/70"}`}>
                    {m.isStaff ? "GenXQR Support" : "You"} · {formatWhen(m.createdAt)}
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4">
          <form onSubmit={onSubmit} noValidate className="space-y-3">
            <label htmlFor="reply-body" className="text-xs text-zinc-500 block">
              Add a reply
            </label>
            <textarea
              id="reply-body"
              name="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type your reply…"
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2.5 text-sm text-zinc-800 dark:text-zinc-200 resize-none h-24"
            />
            {error && <p role="alert" className="text-red-500 text-xs">{error}</p>}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-[11px] text-zinc-500 flex items-center gap-1.5">
                <LifeBuoy size={12} />
                {/* Replying here reopens a resolved ticket, which is worth saying
                    so it does not come as a surprise. */}
                {ticket && (ticket.status === "RESOLVED" || ticket.status === "CLOSED")
                  ? "Replying will reopen this ticket."
                  : "We'll email you when support replies."}
              </p>
              <Button type="submit" size="sm" disabled={reply.isPending} className="gap-1.5">
                {reply.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Send reply
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
