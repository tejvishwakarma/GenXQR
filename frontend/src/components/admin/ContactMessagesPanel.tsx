import { useCallback, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronDown, Loader2, Mail, Search, Trash2 } from "lucide-react"
import AdminPagination from "@/components/admin/AdminPagination"
import {
  deleteContactMessage, fetchContactMessage, fetchContactMessages, getTokenRole,
  replyToContactMessage, updateContactMessage,
  type ContactMessageDetail, type ContactMessageStatus, type ContactMessageSummary,
} from "@/lib/api"

/**
 * Messages from the public contact form (/contact). No account is needed to send
 * one, so they are not support tickets; until 17 Nov 2026 they only reached the
 * support inbox by email. Replies are emailed from here with Reply-To: support.
 */

const STATUS_COLORS: Record<ContactMessageStatus, string> = {
  NEW:     "bg-blue-500/15 text-blue-400",
  REPLIED: "bg-emerald-500/15 text-emerald-400",
  CLOSED:  "bg-zinc-700 text-zinc-400",
}
const STATUS_LABELS: Record<ContactMessageStatus, string> = { NEW: "New", REPLIED: "Replied", CLOSED: "Closed" }
const CATEGORY_LABELS: Record<string, string> = {
  general: "General", sales: "Sales & Enterprise", technical: "Technical", billing: "Billing",
}
const reference = (id: string) => id.slice(0, 8).toUpperCase()
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })

function ContactDrawer({ message, onClose }: { message: ContactMessageDetail; onClose: () => void }) {
  const qc = useQueryClient()
  const [reply, setReply] = useState("")
  const [replyError, setReplyError] = useState("")
  const [status, setStatus] = useState<ContactMessageStatus>(message.status)
  const [adminNotes, setAdminNotes] = useState(message.adminNotes ?? "")
  const isSuperAdmin = getTokenRole() === "SUPER_ADMIN"

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin", "contact-message", message.id] })
    qc.invalidateQueries({ queryKey: ["admin", "contact-messages"] })
    qc.invalidateQueries({ queryKey: ["admin", "contact-message-count"] })
  }

  const sendReply = useMutation({
    mutationFn: () => replyToContactMessage(message.id, reply),
    onSuccess: () => {
      setReply("")
      setReplyError("")
      setStatus("REPLIED")
      refresh()
    },
    onError: (err: Error) => setReplyError(err.message || "Could not send the reply."),
  })

  const save = useMutation({
    mutationFn: () => updateContactMessage(message.id, { status, adminNotes }),
    onSuccess: () => {
      refresh()
      onClose()
    },
  })

  const remove = useMutation({
    mutationFn: () => deleteContactMessage(message.id),
    onSuccess: () => {
      refresh()
      onClose()
    },
  })

  const onReply = (e: React.FormEvent) => {
    e.preventDefault()
    if (sendReply.isPending) return
    if (reply.trim().length < 2) {
      setReplyError("Write a reply first.")
      return
    }
    sendReply.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-zinc-950 border-l border-zinc-800 flex flex-col h-full overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800 shrink-0">
          <h2 className="text-white font-semibold">Contact message · {reference(message.id)}</h2>
          <button onClick={onClose} aria-label="Close" className="text-zinc-500 hover:text-zinc-300 transition text-xl leading-none">&times;</button>
        </div>

        <div className="flex-1 p-5 space-y-5">
          {/* Sender */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1">
            <div className="text-zinc-200 font-medium text-sm">{message.name}</div>
            <a href={`mailto:${message.email}`} className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-white text-xs">
              <Mail size={12} /> {message.email}
            </a>
            {message.account ? (
              <Link to={`/admin/users/${message.account.id}`} className="block text-xs text-violet-400 hover:text-violet-300 pt-1">
                Has a GenXQR account: {message.account.name} →
              </Link>
            ) : (
              <div className="text-xs text-zinc-600 pt-1">No GenXQR account with this address</div>
            )}
          </div>

          {/* Message */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs px-2 py-0.5 rounded-md bg-zinc-700 text-zinc-300">
                {CATEGORY_LABELS[message.category] ?? message.category}
              </span>
              <span className="text-zinc-500 text-xs">{when(message.createdAt)}</span>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
              <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap break-words">{message.message}</p>
            </div>
          </div>

          {/* Replies sent from here */}
          {message.replies.length > 0 && (
            <div className="space-y-3">
              {message.replies.map((r) => (
                <div key={r.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-xl px-4 py-3 border bg-violet-500/10 border-violet-500/30">
                    <div className="text-[11px] text-zinc-500 mb-1">
                      {r.author?.name ? `${r.author.name} (emailed)` : "Emailed"} · {when(r.createdAt)}
                    </div>
                    <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap break-words">{r.body}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Reply */}
          <form onSubmit={onReply} noValidate className="space-y-2">
            <label htmlFor="contact-reply" className="text-xs text-zinc-500 block">
              Reply by email to {message.name}. Their answer comes back to support@genxqr.com.
            </label>
            <textarea
              id="contact-reply"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={6}
              placeholder={"Hi " + (message.name.split(" ")[0] || "there") + ",\n\n…\n\nBest regards,\nTej"}
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

          {/* Status + notes */}
          <div className="space-y-1.5">
            <label htmlFor="contact-status" className="text-zinc-500 text-xs">Status</label>
            <select
              id="contact-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ContactMessageStatus)}
              className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/40"
            >
              {(["NEW", "REPLIED", "CLOSED"] as const).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
            <p className="text-zinc-600 text-xs">Answered from your inbox instead? Set it to Replied.</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="contact-notes" className="text-zinc-500 text-xs">Admin notes (internal)</label>
            <textarea
              id="contact-notes"
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={4}
              placeholder="Visible only to admins…"
              className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl px-4 py-3 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-red-500/40 resize-none"
            />
          </div>

          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete this message from ${message.name} and its replies? This cannot be undone.`)) remove.mutate()
              }}
              disabled={remove.isPending}
              className="inline-flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
            >
              <Trash2 size={12} /> Delete message (e.g. on a deletion request)
            </button>
          )}
        </div>

        <div className="p-5 border-t border-zinc-800 shrink-0 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm text-zinc-400 hover:text-zinc-200 transition">Cancel</button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm rounded-xl transition disabled:opacity-50"
          >
            {save.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
            Save changes
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ContactMessagesPanel() {
  const [params, setParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState("")
  const [search, setSearch] = useState("")
  const [q, setQ] = useState("")
  // ?contact=<id> opens a message directly: the support email links here.
  const selectedId = params.get("contact")

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "contact-messages", page, status, q],
    queryFn: () => fetchContactMessages(page, 20, status, q),
  })
  const { data: detail, isError: detailMissing } = useQuery({
    queryKey: ["admin", "contact-message", selectedId],
    queryFn: () => fetchContactMessage(selectedId!),
    enabled: !!selectedId,
  })

  const open = (id: string | null) => {
    const next = new URLSearchParams(params)
    next.set("tab", "contact")
    if (id) next.set("contact", id)
    else next.delete("contact")
    setParams(next, { replace: true })
  }

  const messages: ContactMessageSummary[] = data?.data ?? []
  const meta = data?.meta

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    setQ(search)
    setPage(1)
  }, [search])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-zinc-500 text-sm">
          {meta ? `${meta.total.toLocaleString()} from the contact form` : "From the contact form"} · no account needed to send one
        </p>
        <div className="flex gap-3 flex-wrap">
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1) }}
            aria-label="Status"
            className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/40"
          >
            <option value="">All statuses</option>
            {(["NEW", "REPLIED", "CLOSED"] as const).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, email or text…"
                className="bg-zinc-800 border border-zinc-700 rounded-xl pl-8 pr-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500/40 w-52"
              />
            </div>
            <button type="submit" className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded-xl transition">Filter</button>
          </form>
        </div>
      </div>

      {selectedId && detailMissing && (
        <p className="text-amber-400 text-sm">That message no longer exists (it may have been deleted).</p>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-red-400 animate-spin" /></div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] table-fixed text-sm">
              <colgroup>
                <col className="w-[28%]" />
                <col />
                <col className="w-[12%]" />
                <col className="w-[18%]" />
                <col className="w-10" />
              </colgroup>
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-zinc-500 font-medium px-5 py-3">From</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3">About</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3">Status</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3">Received</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {messages.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => open(m.id)}
                    className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3">
                      <div className="text-zinc-200 text-sm truncate">{m.name}</div>
                      <div className="text-zinc-500 text-xs truncate" title={m.email}>{m.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-zinc-300 text-sm truncate" title={m.message}>{m.message}</div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{CATEGORY_LABELS[m.category] ?? m.category}</span>
                        {m._count.replies > 0 && (
                          <span className="text-[11px] text-zinc-500">{m._count.replies} repl{m._count.replies === 1 ? "y" : "ies"}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-md whitespace-nowrap ${STATUS_COLORS[m.status] ?? "bg-zinc-700 text-zinc-400"}`}>
                        {STATUS_LABELS[m.status] ?? m.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">{when(m.createdAt)}</td>
                    <td className="px-5 py-3 text-right"><ChevronDown size={14} className="text-zinc-600 inline-block -rotate-90" /></td>
                  </tr>
                ))}
                {messages.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-zinc-500">No contact messages yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {meta && (
            <AdminPagination page={page} totalPages={meta.pages} total={meta.total} pageSize={20} onPageChange={setPage} />
          )}
        </div>
      )}

      {selectedId && detail?.data && <ContactDrawer key={detail.data.id} message={detail.data} onClose={() => open(null)} />}
    </div>
  )
}
