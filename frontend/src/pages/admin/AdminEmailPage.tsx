import { useState, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2, Search, CheckCircle, XCircle, Clock } from "lucide-react"
import AdminPagination from "@/components/admin/AdminPagination"
import { fetchEmailLogs, type EmailLogEntry } from "@/lib/api"

const STATUS_ICONS: Record<string, React.ReactNode> = {
  sent:    <CheckCircle size={13} className="text-emerald-400" />,
  failed:  <XCircle size={13} className="text-red-400" />,
  bounced: <Clock size={13} className="text-amber-400" />,
}

const STATUS_COLORS: Record<string, string> = {
  sent:    "bg-emerald-500/15 text-emerald-400",
  failed:  "bg-red-500/15 text-red-400",
  bounced: "bg-amber-500/15 text-amber-400",
}

const STATUSES = ["", "sent", "failed", "bounced"]

export default function AdminEmailPage() {
  const [page, setPage]     = useState(1)
  const [status, setStatus] = useState("")
  const [search, setSearch] = useState("")
  const [q, setQ]           = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "email-logs", page, status, q],
    queryFn:  () => fetchEmailLogs(page, 20, status, q),
  })

  const logs: EmailLogEntry[] = data?.data ?? []
  const meta = data?.meta

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    setQ(search)
    setPage(1)
  }, [search])

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Email Logs</h1>
        {meta && <p className="text-zinc-500 text-sm">{meta.total.toLocaleString()} emails logged</p>}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1) }}
          className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/40"
        >
          {STATUSES.map((s) => <option key={s} value={s}>{s || "All statuses"}</option>)}
        </select>

        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by recipient…"
              className="bg-zinc-800 border border-zinc-700 rounded-xl pl-8 pr-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500/40 w-52"
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded-xl transition">
            Filter
          </button>
        </form>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-red-400 animate-spin" /></div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-zinc-500 font-medium px-5 py-3">To</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3">Subject</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3">Template</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3">Provider</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3">Status</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3">Sent</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                    <td className="px-5 py-3 text-zinc-300 text-sm">{log.to}</td>
                    <td className="px-4 py-3 text-zinc-400 text-sm max-w-xs truncate" title={log.subject}>{log.subject}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400 font-mono">{log.template}</span>
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs">{log.provider}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md ${STATUS_COLORS[log.status] ?? "bg-zinc-700 text-zinc-400"}`}>
                        {STATUS_ICONS[log.status]} {log.status}
                      </span>
                      {log.error && (
                        <div className="text-red-400 text-xs mt-0.5 max-w-xs truncate" title={log.error}>{log.error}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">
                      {new Date(log.sentAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-zinc-500">No email logs found.</td></tr>
                )}
              </tbody>
            </table>
          </div>

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
    </div>
  )
}
