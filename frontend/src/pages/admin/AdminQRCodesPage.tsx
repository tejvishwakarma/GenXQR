import { useState, useCallback, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Search, Loader2, Trash2, PowerOff, QrCode,
  Activity, CheckCircle2, XCircle, X, ChevronDown,
  Link2,
} from "lucide-react"
import AdminPagination from "@/components/admin/AdminPagination"
import { fetchAdminQRCodes, deactivateAdminQR, deleteAdminQR, type AdminQRCode } from "@/lib/api"

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  URL:    "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  APP:    "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  COUPON: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  TEXT:   "bg-zinc-600/40 text-zinc-300 ring-zinc-500/30",
  EMAIL:  "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  SMS:    "bg-teal-500/15 text-teal-300 ring-teal-500/30",
  PHONE:  "bg-green-500/15 text-green-300 ring-green-500/30",
  WIFI:   "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  VCARD:  "bg-indigo-500/15 text-indigo-300 ring-indigo-500/30",
}

const CAT_COLORS: Record<string, string> = {
  DYNAMIC: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/25",
  STATIC:  "bg-zinc-700/60 text-zinc-400 ring-zinc-600/30",
}

const STATUS_FILTERS = ["All", "Active", "Inactive"] as const
const TYPE_FILTERS   = ["All Types", "URL", "APP", "COUPON", "TEXT", "EMAIL", "SMS", "PHONE", "WIFI", "VCARD"] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function typeClass(type: string) {
  return TYPE_COLORS[type.toUpperCase()] ?? "bg-zinc-600/40 text-zinc-300 ring-zinc-500/30"
}

function catClass(cat: string) {
  return CAT_COLORS[cat.toUpperCase()] ?? "bg-zinc-600/40 text-zinc-400 ring-zinc-500/25"
}

/** Mini scan-bar — visual heat indicator relative to the page max */
function ScanBar({ count, max }: { count: number; max: number }) {
  const pct = max > 0 ? Math.max(4, Math.round((count / max) * 100)) : 0
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-zinc-300 font-medium tabular-nums text-xs w-8 text-right">
        {count.toLocaleString()}
      </span>
      <div className="w-20 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-400 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ─── Skeleton Row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-zinc-800/40">
      {[40, 18, 28, 22, 16, 14].map((w, i) => (
        <td key={i} className="px-5 py-4">
          <div
            className="h-3 rounded-full bg-zinc-800 animate-pulse"
            style={{ width: `${w * 3.5}px`, maxWidth: "100%" }}
          />
          {i === 0 && (
            <div className="h-2.5 rounded-full bg-zinc-800/60 animate-pulse mt-1.5 w-24" />
          )}
        </td>
      ))}
      <td className="px-5 py-4">
        <div className="flex gap-2 justify-end">
          <div className="w-7 h-7 rounded-lg bg-zinc-800 animate-pulse" />
          <div className="w-7 h-7 rounded-lg bg-zinc-800 animate-pulse" />
        </div>
      </td>
    </tr>
  )
}

// ─── Filter Chip ──────────────────────────────────────────────────────────────

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-medium transition-all border ${
        active
          ? "bg-red-600 border-red-500 text-white shadow-sm shadow-red-900/30"
          : "bg-zinc-800/60 border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500"
      }`}
    >
      {label}
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminQRCodesPage() {
  const qc = useQueryClient()

  const [page, setPage]            = useState(1)
  const [search, setSearch]        = useState("")
  const [q, setQ]                  = useState("")
  const [statusFilter, setStatus]  = useState<"All" | "Active" | "Inactive">("All")
  const [typeFilter, setType]      = useState("All Types")
  const [showFilters, setShowFilters] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "qr-codes", page, q],
    queryFn: () => fetchAdminQRCodes(page, 20, q),
  })

  const deactivateMut = useMutation({
    mutationFn: deactivateAdminQR,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "qr-codes"] }),
  })

  const deleteMut = useMutation({
    mutationFn: deleteAdminQR,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "qr-codes"] }),
  })

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      setQ(search)
      setPage(1)
    },
    [search],
  )

  const clearSearch = () => {
    setSearch("")
    setQ("")
    setPage(1)
    inputRef.current?.focus()
  }

  const rawCodes: AdminQRCode[] = data?.data ?? []
  const meta = data?.meta

  // Client-side filter by status / type
  const codes = rawCodes.filter((qr) => {
    if (statusFilter === "Active"   && !qr.isActive) return false
    if (statusFilter === "Inactive" && qr.isActive)  return false
    if (typeFilter !== "All Types"  && qr.type.toUpperCase() !== typeFilter) return false
    return true
  })

  // Stats for summary bar (current page)
  const totalQRs      = meta?.total ?? 0
  const activeCount   = rawCodes.filter((c) => c.isActive).length
  const totalScans    = rawCodes.reduce((s, c) => s + c.scanCount, 0)
  const maxScans      = Math.max(...rawCodes.map((c) => c.scanCount), 1)

  const hasActiveFilter = statusFilter !== "All" || typeFilter !== "All Types"

  return (
    <div className="space-y-6 max-w-6xl">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">QR Codes</h1>
          {meta && (
            <p className="text-zinc-500 text-sm mt-0.5">
              {meta.total.toLocaleString()} codes across all users
            </p>
          )}
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or slug…"
              className="bg-zinc-800/80 border border-zinc-700 rounded-xl pl-8 pr-8 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500/50 w-60 transition"
            />
            {search && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition"
              >
                <X size={13} />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white text-sm rounded-xl transition font-medium"
          >
            Search
          </button>
          <button
            type="button"
            onClick={() => setShowFilters((p) => !p)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border transition ${
              showFilters || hasActiveFilter
                ? "border-red-500/50 text-red-400 bg-red-500/10"
                : "border-zinc-700 text-zinc-400 hover:text-zinc-200 bg-zinc-800/60 hover:border-zinc-500"
            }`}
            title="Filters"
          >
            <ChevronDown
              size={14}
              className={`transition-transform duration-200 ${showFilters ? "rotate-180" : ""}`}
            />
            Filters
            {hasActiveFilter && (
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 ml-0.5" />
            )}
          </button>
        </form>
      </div>

      {/* ── Stat bar ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: QrCode,        label: "Total QR Codes",    value: totalQRs.toLocaleString(),   color: "text-violet-400", bg: "bg-violet-500/10" },
          { icon: CheckCircle2,  label: "Active (this page)", value: `${activeCount} / ${rawCodes.length}`, color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { icon: Activity,      label: "Total Scans (page)", value: totalScans.toLocaleString(), color: "text-sky-400",    bg: "bg-sky-500/10" },
        ].map(({ icon: Icon, label, value, color, bg }) => (
          <div
            key={label}
            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800"
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${bg}`}>
              <Icon size={16} className={color} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-zinc-500 truncate">{label}</p>
              <p className="text-base font-semibold text-white leading-tight">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filter chips ───────────────────────────────────────────────────── */}
      {showFilters && (
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Status</p>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_FILTERS.map((s) => (
                <FilterChip
                  key={s}
                  label={s}
                  active={statusFilter === s}
                  onClick={() => { setStatus(s); setPage(1) }}
                />
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Type</p>
            <div className="flex flex-wrap gap-1.5">
              {TYPE_FILTERS.map((t) => (
                <FilterChip
                  key={t}
                  label={t === "All Types" ? "All" : t}
                  active={typeFilter === t}
                  onClick={() => { setType(t); setPage(1) }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/80">
                <th className="text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-5 py-3">Name / Slug</th>
                <th className="text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Type</th>
                <th className="text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Category</th>
                <th className="text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Owner</th>
                <th className="text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Scans</th>
                <th className="text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Status</th>
                <th className="text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>

            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                : codes.map((qr) => (
                    <tr
                      key={qr.id}
                      className="border-b border-zinc-800/40 hover:bg-zinc-800/25 transition-colors group"
                    >
                      {/* Name / Slug */}
                      <td className="px-5 py-3.5 max-w-[200px]">
                        <div className="font-medium text-white truncate">{qr.name}</div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Link2 size={10} className="text-zinc-600 flex-shrink-0" />
                          <span className="text-zinc-500 text-xs font-mono truncate">{qr.slug}</span>
                        </div>
                      </td>

                      {/* Type */}
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${typeClass(qr.type)}`}>
                          {qr.type}
                        </span>
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${catClass(qr.category)}`}>
                          {qr.category?.charAt(0) + qr.category?.slice(1).toLowerCase()}
                        </span>
                      </td>

                      {/* Owner */}
                      <td className="px-4 py-3.5 max-w-[180px]">
                        {qr.user ? (
                          <div>
                            <div className="text-zinc-300 text-xs font-medium truncate">{qr.user.name}</div>
                            <div className="text-zinc-500 text-xs truncate">{qr.user.email}</div>
                          </div>
                        ) : (
                          <span className="text-zinc-700 text-xs">—</span>
                        )}
                      </td>

                      {/* Scans + bar */}
                      <td className="px-4 py-3.5">
                        <ScanBar count={qr.scanCount} max={maxScans} />
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${
                            qr.isActive
                              ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30"
                              : "bg-zinc-700/60 text-zinc-500 ring-zinc-600/30"
                          }`}
                        >
                          {qr.isActive
                            ? <CheckCircle2 size={10} />
                            : <XCircle      size={10} />}
                          {qr.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>

                      {/* Created */}
                      <td className="px-4 py-3.5 text-zinc-500 text-xs whitespace-nowrap">
                        {new Date(qr.createdAt).toLocaleDateString()}
                      </td>

                      {/* Actions — reveal on hover */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          {qr.isActive && (
                            <button
                              onClick={() => deactivateMut.mutate(qr.id)}
                              disabled={deactivateMut.isPending}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10 transition disabled:opacity-40"
                              title="Force deactivate"
                            >
                              {deactivateMut.isPending
                                ? <Loader2 size={13} className="animate-spin" />
                                : <PowerOff size={14} />}
                            </button>
                          )}
                          <button
                            onClick={() => {
                              if (window.confirm(`Delete QR "${qr.name}"? This is irreversible.`)) {
                                deleteMut.mutate(qr.id)
                              }
                            }}
                            disabled={deleteMut.isPending}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition disabled:opacity-40"
                            title="Delete QR"
                          >
                            {deleteMut.isPending
                              ? <Loader2 size={13} className="animate-spin" />
                              : <Trash2 size={14} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

              {/* Empty state */}
              {!isLoading && codes.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center">
                        <QrCode size={22} className="text-zinc-600" />
                      </div>
                      <p className="text-zinc-400 font-medium">No QR codes found</p>
                      <p className="text-zinc-600 text-sm">
                        {q
                          ? `No results for "${q}". Try adjusting your search or filters.`
                          : "No QR codes match the active filters."}
                      </p>
                      {(q || hasActiveFilter) && (
                        <button
                          type="button"
                          onClick={() => {
                            clearSearch()
                            setStatus("All")
                            setType("All Types")
                          }}
                          className="mt-1 text-sm text-red-400 hover:text-red-300 transition underline underline-offset-2"
                        >
                          Clear all filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
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
    </div>
  )
}
