import { useState, useCallback, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import {
  Loader2, Search, Filter, X, Shield, QrCode, CreditCard, Users, Key, Activity,
  ChevronDown, ExternalLink,
} from "lucide-react"
import { fetchAdminAudit, type AuditEntry, type AuditFilters } from "@/lib/api"
import AdminPagination from "@/components/admin/AdminPagination"

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: "",        label: "All",     icon: <Activity  size={13} />, color: "text-zinc-400",   bg: "bg-zinc-700/60" },
  { value: "auth",    label: "Auth",    icon: <Shield    size={13} />, color: "text-violet-400", bg: "bg-violet-500/15" },
  { value: "qr",      label: "QR",      icon: <QrCode    size={13} />, color: "text-blue-400",   bg: "bg-blue-500/15" },
  { value: "billing", label: "Billing", icon: <CreditCard size={13} />, color: "text-emerald-400", bg: "bg-emerald-500/15" },
  { value: "admin",   label: "Admin",   icon: <Shield    size={13} />, color: "text-red-400",    bg: "bg-red-500/15" },
  { value: "team",    label: "Team",    icon: <Users     size={13} />, color: "text-amber-400",  bg: "bg-amber-500/15" },
  { value: "apikey",  label: "API Key", icon: <Key       size={13} />, color: "text-pink-400",   bg: "bg-pink-500/15" },
]

const ACTION_COLORS: Record<string, string> = {
  auth:    "text-violet-400 bg-violet-500/10 border-violet-500/20",
  qr:      "text-blue-400 bg-blue-500/10 border-blue-500/20",
  billing: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  admin:   "text-red-400 bg-red-500/10 border-red-500/20",
  team:    "text-amber-400 bg-amber-500/10 border-amber-500/20",
  apikey:  "text-pink-400 bg-pink-500/10 border-pink-500/20",
  system:  "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
}

function actionBadgeClass(category: string): string {
  return ACTION_COLORS[category] ?? ACTION_COLORS["system"]
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function MetadataView({ metadata }: { metadata: unknown }) {
  if (!metadata || typeof metadata !== "object") return <span className="text-zinc-600">—</span>
  const entries = Object.entries(metadata as Record<string, unknown>).slice(0, 4)
  if (entries.length === 0) return <span className="text-zinc-600">—</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([k, v]) => (
        <span key={k} className="text-[10px] bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-400">
          <span className="text-zinc-500">{k}:</span> {String(v).slice(0, 30)}
        </span>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminAuditPage() {
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<AuditFilters>({})
  const [showFilters, setShowFilters] = useState(false)

  // Controlled inputs (committed on submit/blur)
  const [draftQ,         setDraftQ]         = useState("")
  const [draftUserEmail, setDraftUserEmail] = useState("")
  const [draftDateFrom,  setDraftDateFrom]  = useState("")
  const [draftDateTo,    setDraftDateTo]    = useState("")
  const [draftIP,        setDraftIP]        = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "audit", page, filters],
    queryFn: () => fetchAdminAudit(page, 25, filters),
    placeholderData: (prev) => prev,
  })

  const entries: AuditEntry[] = data?.data ?? []
  const meta = data?.meta
  const activeFilterCount = useMemo(
    () => Object.values(filters).filter(Boolean).length,
    [filters],
  )

  function applyFilters() {
    setFilters({
      q:         draftQ         || undefined,
      category:  filters.category,           // category set by pills, not form
      userEmail: draftUserEmail || undefined,
      dateFrom:  draftDateFrom  || undefined,
      dateTo:    draftDateTo    || undefined,
      ip:        draftIP        || undefined,
    })
    setPage(1)
  }

  function clearAllFilters() {
    setFilters({})
    setDraftQ("")
    setDraftUserEmail("")
    setDraftDateFrom("")
    setDraftDateTo("")
    setDraftIP("")
    setPage(1)
  }

  const setCategory = useCallback((cat: string) => {
    setFilters((prev) => ({ ...prev, category: cat || undefined }))
    setPage(1)
  }, [])

  function handleFilterKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") applyFilters()
  }

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Audit Log</h1>
          <p className="text-zinc-500 text-sm">
            {meta ? `${meta.total.toLocaleString()} entries` : "Track all platform actions"}
          </p>
        </div>
        <button
          onClick={() => setShowFilters((p) => !p)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition ${
            showFilters || activeFilterCount > 0
              ? "border-violet-500/40 bg-violet-500/10 text-violet-300"
              : "border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800"
          }`}
        >
          <Filter size={15} />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-0.5 min-w-4 h-4 px-1 bg-violet-600 rounded-full text-[10px] leading-none flex items-center justify-center text-white font-semibold">
              {activeFilterCount}
            </span>
          )}
          <ChevronDown size={13} className={`transition-transform ${showFilters ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => {
          const active = (filters.category ?? "") === cat.value
          return (
            <button
              key={cat.value}
              onClick={() => setCategory(cat.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition ${
                active
                  ? `${cat.bg} ${cat.color} border-current/20`
                  : "bg-zinc-800/50 text-zinc-400 border-zinc-700 hover:bg-zinc-700/50 hover:text-zinc-300"
              }`}
            >
              {cat.icon}
              {cat.label}
            </button>
          )
        })}
        {activeFilterCount > 0 && (
          <button
            onClick={clearAllFilters}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-500/30 text-xs font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 transition"
          >
            <X size={12} />
            Clear all
          </button>
        )}
      </div>

      {/* Advanced filter panel */}
      {showFilters && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Action search */}
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Action contains</label>
            <div className="relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                value={draftQ}
                onChange={(e) => setDraftQ(e.target.value)}
                onKeyDown={handleFilterKeyDown}
                placeholder="e.g. qr.delete"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-8 pr-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500"
              />
            </div>
          </div>

          {/* User email */}
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">User email</label>
            <input
              value={draftUserEmail}
              onChange={(e) => setDraftUserEmail(e.target.value)}
              onKeyDown={handleFilterKeyDown}
              placeholder="user@example.com"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500"
            />
          </div>

          {/* Date from */}
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">From date</label>
            <input
              type="date"
              value={draftDateFrom}
              onChange={(e) => setDraftDateFrom(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
            />
          </div>

          {/* Date to */}
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">To date</label>
            <input
              type="date"
              value={draftDateTo}
              onChange={(e) => setDraftDateTo(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
            />
          </div>

          {/* IP address */}
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">IP address</label>
            <input
              value={draftIP}
              onChange={(e) => setDraftIP(e.target.value)}
              onKeyDown={handleFilterKeyDown}
              placeholder="192.168.1.1"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500"
            />
          </div>

          {/* Apply */}
          <div className="sm:col-span-2 lg:col-span-3 flex items-end gap-2">
            <button
              onClick={applyFilters}
              className="px-5 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-xl transition"
            >
              Apply filters
            </button>
            <button
              onClick={clearAllFilters}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-xl transition"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-7 h-7 text-violet-400 animate-spin" />
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-zinc-500 font-medium px-5 py-3 text-xs">Time</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Action</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Actor</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Entity</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">Details</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3 text-xs">IP</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className={`border-b border-zinc-800/50 transition-colors ${
                      entry.category === "admin" ? "hover:bg-red-500/5" : "hover:bg-zinc-800/20"
                    }`}
                  >
                    {/* Timestamp */}
                    <td className="px-5 py-3 whitespace-nowrap">
                      <div className="text-zinc-300 text-xs">{formatRelativeTime(entry.createdAt)}</div>
                      <div className="text-zinc-600 text-[10px]">{new Date(entry.createdAt).toLocaleString()}</div>
                    </td>

                    {/* Action badge */}
                    <td className="px-4 py-3">
                      <span className={`font-mono text-[11px] px-2 py-0.5 rounded-md border ${actionBadgeClass(entry.category)}`}>
                        {entry.action}
                      </span>
                    </td>

                    {/* Actor */}
                    <td className="px-4 py-3">
                      {entry.user ? (
                        <div>
                          <Link
                            to={`/admin/users/${entry.user.id}`}
                            className="text-zinc-300 text-xs hover:text-white flex items-center gap-1 group"
                          >
                            {entry.user.name}
                            <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                          </Link>
                          <div className="text-zinc-500 text-[10px]">{entry.user.email}</div>
                        </div>
                      ) : (
                        <span className="text-zinc-600 text-xs italic">System</span>
                      )}
                    </td>

                    {/* Entity */}
                    <td className="px-4 py-3">
                      {entry.entityType ? (
                        <div>
                          <div className="text-zinc-400 text-xs">{entry.entityType}</div>
                          {entry.entityId && (
                            <div className="text-zinc-600 text-[10px] font-mono">{entry.entityId.slice(0, 10)}…</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-zinc-700 text-xs">—</span>
                      )}
                    </td>

                    {/* Metadata */}
                    <td className="px-4 py-3 max-w-xs">
                      <MetadataView metadata={entry.metadata} />
                    </td>

                    {/* IP + UA */}
                    <td className="px-4 py-3">
                      <div className="text-zinc-500 text-xs font-mono">{entry.ip ?? "—"}</div>
                      {entry.userAgent && (
                        <div className="text-zinc-700 text-[10px] truncate max-w-28" title={entry.userAgent}>
                          {entry.userAgent.slice(0, 24)}…
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-16 text-center text-zinc-500">
                      No audit entries match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {meta && (
            <AdminPagination
              page={page}
              totalPages={meta.pages}
              total={meta.total}
              pageSize={25}
              onPageChange={setPage}
            />
          )}
        </div>
      )}
    </div>
  )
}
