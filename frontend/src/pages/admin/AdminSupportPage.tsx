import { useState, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, Search, ChevronDown } from "lucide-react"
import AdminPagination from "@/components/admin/AdminPagination"
import {
  fetchSupportTickets, fetchSupportTicket, updateSupportTicket, replyToTicketAsAdmin,
  type SupportTicket, type SupportTicketDetail,
} from "@/lib/api"

const STATUS_COLORS: Record<string, string> = {
  OPEN:        "bg-blue-500/15 text-blue-400",
  IN_PROGRESS: "bg-amber-500/15 text-amber-400",
  RESOLVED:    "bg-emerald-500/15 text-emerald-400",
  CLOSED:      "bg-zinc-700 text-zinc-400",
}

/**
 * Human labels for the stored category values. The customer picks these in the
 * support widget and the DB keeps them snake_cased, so "feature_request" would
 * otherwise appear verbatim in the admin UI.
 *
 * Unknown values fall through to the raw string rather than being hidden — if a
 * new category is added to the widget, it should still be visible here.
 */
const CATEGORY_LABELS: Record<string, string> = {
  billing: "Billing",
  technical: "Technical",
  feature_request: "Feature request",
  other: "Other",
  general: "General",
}

const CATEGORY_COLORS: Record<string, string> = {
  billing: "bg-amber-500/15 text-amber-400",
  technical: "bg-blue-500/15 text-blue-400",
  feature_request: "bg-violet-500/15 text-violet-400",
  other: "bg-zinc-700 text-zinc-300",
  general: "bg-zinc-700 text-zinc-300",
}

function categoryLabel(value: string): string {
  return CATEGORY_LABELS[value] ?? value
}

const PRIORITY_COLORS: Record<string, string> = {
  LOW:    "bg-zinc-700 text-zinc-400",
  MEDIUM: "bg-blue-500/15 text-blue-400",
  HIGH:   "bg-amber-500/15 text-amber-400",
  URGENT: "bg-red-500/15 text-red-400",
}

const STATUSES = ["", "OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]

function TicketDrawer({ ticket, onClose }: { ticket: SupportTicketDetail; onClose: () => void }) {
  const qc = useQueryClient()
  const [adminNotes, setAdminNotes] = useState(ticket.adminNotes ?? "")
  const [status, setStatus]         = useState(ticket.status)
  const [priority, setPriority]     = useState(ticket.priority)
  const [reply, setReply]           = useState("")
  const [replyError, setReplyError] = useState("")

  /**
   * A staff reply is not the same thing as an admin note: the note is internal and
   * the customer never sees it, whereas this is sent to them and emailed.
   */
  const sendReply = useMutation({
    mutationFn: () => replyToTicketAsAdmin(ticket.id, reply),
    onSuccess: () => {
      setReply("")
      setReplyError("")
      // The thread, the list and the badge can all change: replying moves an OPEN
      // ticket to IN_PROGRESS.
      qc.invalidateQueries({ queryKey: ["admin", "support-ticket", ticket.id] })
      qc.invalidateQueries({ queryKey: ["admin", "support-tickets"] })
      qc.invalidateQueries({ queryKey: ["admin", "support-ticket-count"] })
    },
    onError: (err: Error) => setReplyError(err.message || "Could not send the reply."),
  })

  const onReply = (e: React.FormEvent) => {
    e.preventDefault()
    if (sendReply.isPending) return
    if (reply.trim().length < 2) {
      setReplyError("Write a reply first.")
      return
    }
    setReplyError("")
    sendReply.mutate()
  }

  const mutation = useMutation({
    mutationFn: () => updateSupportTicket(ticket.id, { status, priority, adminNotes }),
    onSuccess: () => {
      // Invalidate both the list AND the sidebar badge count so it updates immediately
      qc.invalidateQueries({ queryKey: ["admin", "support-tickets"] })
      qc.invalidateQueries({ queryKey: ["admin", "support-ticket-count"] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-zinc-950 border-l border-zinc-800 flex flex-col h-full overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800 shrink-0">
          <h2 className="text-white font-semibold">Ticket #{ticket.id.slice(-6)}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition text-xl leading-none">&times;</button>
        </div>

        <div className="flex-1 p-5 space-y-5">
          {/* User */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1">
            <div className="text-zinc-200 font-medium text-sm">{ticket.user.name}</div>
            <div className="text-zinc-500 text-xs">{ticket.user.email}</div>
          </div>

          {/* Subject + message */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-white font-semibold">{ticket.subject}</div>
              {/* The category the customer chose. Stored and returned all along,
                  but never rendered — so an admin could not tell a billing
                  problem from a feature request without reading the message. */}
              <span className={`text-xs px-2 py-0.5 rounded-md ${CATEGORY_COLORS[ticket.category] ?? "bg-zinc-700 text-zinc-300"}`}>
                {categoryLabel(ticket.category)}
              </span>
            </div>
            {/* The whole conversation, not just the opening message. Falls back to
                ticket.message for any ticket whose thread is somehow empty, so an
                admin is never shown a blank ticket. */}
            <div className="space-y-3">
              {(ticket.messages?.length ? ticket.messages : [{
                id: "legacy",
                body: ticket.message,
                isStaff: false,
                createdAt: ticket.createdAt,
                author: null,
              }]).map((m) => (
                <div key={m.id} className={m.isStaff ? "flex justify-end" : "flex justify-start"}>
                  <div className={`max-w-[85%] rounded-xl px-4 py-3 border ${
                    m.isStaff
                      ? "bg-violet-500/10 border-violet-500/30"
                      : "bg-zinc-900 border-zinc-800"
                  }`}>
                    <div className="text-[11px] text-zinc-500 mb-1">
                      {m.isStaff ? (m.author?.name ? `${m.author.name} (support)` : "Support") : "Customer"}
                      {" · "}
                      {new Date(m.createdAt).toLocaleString()}
                    </div>
                    <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap break-words">{m.body}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="text-zinc-600 text-xs">
              Created {new Date(ticket.createdAt).toLocaleString()}
              {ticket.resolvedAt && ` · Resolved ${new Date(ticket.resolvedAt).toLocaleString()}`}
            </div>

            {/* Reply box */}
            <form onSubmit={onReply} noValidate className="space-y-2 pt-1">
              <label htmlFor="admin-reply" className="text-xs text-zinc-500 block">
                Reply to the customer — they see this on their ticket and receive it by email
              </label>
              <textarea
                id="admin-reply"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={4}
                placeholder="Type your reply…"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-200 resize-none"
              />
              {replyError && <p role="alert" className="text-red-400 text-xs">{replyError}</p>}
              <button
                type="submit"
                disabled={sendReply.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
              >
                {sendReply.isPending ? "Sending…" : "Send reply"}
              </button>
            </form>
          </div>

          {/* Status / Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-zinc-500 text-xs">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/40">
                {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-zinc-500 text-xs">Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/40">
                {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* Admin notes */}
          <div className="space-y-1.5">
            <label className="text-zinc-500 text-xs">Admin Notes (internal)</label>
            <textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} rows={5}
              placeholder="Internal notes visible only to admins…"
              className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl px-4 py-3 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-red-500/40 resize-none" />
          </div>
        </div>

        <div className="p-5 border-t border-zinc-800 shrink-0 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm text-zinc-400 hover:text-zinc-200 transition">
            Cancel
          </button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm rounded-xl transition disabled:opacity-50">
            {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminSupportPage() {
  const [page, setPage]         = useState(1)
  const [status, setStatus]     = useState("")
  const [search, setSearch]     = useState("")
  const [q, setQ]               = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "support-tickets", page, status, q],
    queryFn:  () => fetchSupportTickets(page, 20, status, "", q),
  })

  const { data: ticketDetail } = useQuery({
    queryKey: ["admin", "support-ticket", selectedId],
    queryFn:  () => fetchSupportTicket(selectedId!),
    enabled:  !!selectedId,
  })

  const tickets: SupportTicket[] = data?.data ?? []
  const meta = data?.meta

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    setQ(search)
    setPage(1)
  }, [search])

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Support Tickets</h1>
          {meta && <p className="text-zinc-500 text-sm">{meta.total.toLocaleString()} total</p>}
        </div>
        <div className="flex gap-3 flex-wrap">
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}
            className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/40">
            {STATUSES.map((s) => <option key={s} value={s}>{s || "All statuses"}</option>)}
          </select>
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
                className="bg-zinc-800 border border-zinc-700 rounded-xl pl-8 pr-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500/40 w-48" />
            </div>
            <button type="submit" className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded-xl transition">
              Filter
            </button>
          </form>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-red-400 animate-spin" /></div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left text-zinc-500 font-medium px-5 py-3">Subject</th>
                <th className="text-left text-zinc-500 font-medium px-4 py-3">User</th>
                <th className="text-left text-zinc-500 font-medium px-4 py-3">Category</th>
                <th className="text-left text-zinc-500 font-medium px-4 py-3">Priority</th>
                <th className="text-left text-zinc-500 font-medium px-4 py-3">Status</th>
                <th className="text-left text-zinc-500 font-medium px-4 py-3">Opened</th>
                <th className="text-right text-zinc-500 font-medium px-5 py-3"><ChevronDown size={14} /></th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors cursor-pointer"
                  onClick={() => setSelectedId(t.id)}>
                  <td className="px-5 py-3 text-zinc-200 text-sm max-w-xs truncate">{t.subject}</td>
                  <td className="px-4 py-3">
                    <div className="text-zinc-300 text-xs">{t.user.name}</div>
                    <div className="text-zinc-500 text-xs">{t.user.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-md ${CATEGORY_COLORS[t.category] ?? "bg-zinc-700 text-zinc-300"}`}>
                      {categoryLabel(t.category)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-md ${PRIORITY_COLORS[t.priority] ?? "bg-zinc-700 text-zinc-400"}`}>
                      {t.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-md ${STATUS_COLORS[t.status] ?? "bg-zinc-700 text-zinc-400"}`}>
                      {t.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">{new Date(t.createdAt).toLocaleDateString()}</td>
                  <td className="px-5 py-3 text-right">
                    <ChevronDown size={14} className="text-zinc-600 inline-block -rotate-90" />
                  </td>
                </tr>
              ))}
              {tickets.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-zinc-500">No tickets found.</td></tr>
              )}
            </tbody>
          </table>

          {meta && (
            <AdminPagination
              page={page}
              totalPages={meta.pages}
              total={meta.total}
              pageSize={20}
              onPageChange={setPage}
            />
          )}
        </div>
      )}

      {/* Ticket detail drawer */}
      {selectedId && ticketDetail?.data && (
        <TicketDrawer ticket={ticketDetail.data} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}
