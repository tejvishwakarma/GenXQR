import { useState, useCallback, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import {
  Search, X, ChevronDown, CreditCard,
  CheckCircle2, XCircle, Clock, IndianRupee,
  Copy, Check,
} from "lucide-react"
import AdminPagination from "@/components/admin/AdminPagination"
import { fetchAdminPayments, type AdminPayment } from "@/lib/api"

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
  paid:    { cls: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30", icon: <CheckCircle2 size={10} />, label: "Paid"    },
  failed:  { cls: "bg-red-500/15 text-red-400 ring-red-500/30",            icon: <XCircle      size={10} />, label: "Failed"  },
  pending: { cls: "bg-amber-500/15 text-amber-400 ring-amber-500/30",      icon: <Clock        size={10} />, label: "Pending" },
}

const CYCLE_META: Record<string, string> = {
  monthly: "bg-blue-500/15 text-blue-300 ring-blue-500/25",
  yearly:  "bg-violet-500/15 text-violet-300 ring-violet-500/25",
}

const STATUS_FILTERS = ["All", "paid", "failed", "pending"] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rupees(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-zinc-800/40">
      {[36, 20, 14, 18, 28, 16].map((w, i) => (
        <td key={i} className="px-5 py-4">
          <div className="h-3 rounded-full bg-zinc-800 animate-pulse" style={{ width: `${w * 4}px`, maxWidth: "100%" }} />
          {i === 0 && <div className="h-2.5 rounded-full bg-zinc-800/60 animate-pulse mt-1.5 w-28" />}
        </td>
      ))}
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

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onClick={copy}
      className="ml-1 text-zinc-600 hover:text-zinc-300 transition opacity-0 group-hover/row:opacity-100"
      title="Copy payment ID"
    >
      {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPaymentsPage() {
  const [page, setPage]            = useState(1)
  const [search, setSearch]        = useState("")
  const [q, setQ]                  = useState("")
  const [statusFilter, setStatus]  = useState<typeof STATUS_FILTERS[number]>("All")
  const [showFilters, setShowFilters] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "payments", page, statusFilter === "All" ? "" : statusFilter],
    queryFn: () => fetchAdminPayments(page, 20, statusFilter === "All" ? "" : statusFilter),
  })

  const payments: AdminPayment[] = data?.data ?? []
  const meta = data?.meta

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    setQ(search)
    setPage(1)
  }, [search])

  const clearSearch = () => { setSearch(""); setQ(""); setPage(1); inputRef.current?.focus() }

  // Client-side search filter (name / email / plan)
  const filtered = q
    ? payments.filter(
        (p) =>
          p.user.name.toLowerCase().includes(q.toLowerCase()) ||
          p.user.email.toLowerCase().includes(q.toLowerCase()) ||
          p.planName.toLowerCase().includes(q.toLowerCase()),
      )
    : payments

  // Stat derived values
  const totalTx   = meta?.total ?? 0
  const pageRevenue = payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0)
  const failedCount = payments.filter((p) => p.status === "failed").length

  return (
    <div className="space-y-6 max-w-6xl">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Payments</h1>
          {meta && (
            <p className="text-zinc-500 text-sm mt-0.5">
              {meta.total.toLocaleString()} total transactions
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
              placeholder="Search user or plan…"
              className="bg-zinc-800/80 border border-zinc-700 rounded-xl pl-8 pr-8 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500/50 w-56 transition"
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
              showFilters || statusFilter !== "All"
                ? "border-red-500/50 text-red-400 bg-red-500/10"
                : "border-zinc-700 text-zinc-400 hover:text-zinc-200 bg-zinc-800/60 hover:border-zinc-500"
            }`}
          >
            <ChevronDown size={14} className={`transition-transform duration-200 ${showFilters ? "rotate-180" : ""}`} />
            Filters
            {statusFilter !== "All" && <span className="w-1.5 h-1.5 rounded-full bg-red-400 ml-0.5" />}
          </button>
        </form>
      </div>

      {/* ── Stat bar ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: CreditCard,   label: "Total Transactions", value: totalTx.toLocaleString(),        color: "text-violet-400", bg: "bg-violet-500/10" },
          { icon: IndianRupee,  label: "Revenue (this page)",value: rupees(pageRevenue),             color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { icon: XCircle,      label: "Failed (this page)", value: failedCount.toLocaleString(),    color: "text-red-400",    bg: "bg-red-500/10" },
        ].map(({ icon: Icon, label, value, color, bg }) => (
          <div key={label} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800">
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
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Status</p>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((s) => (
              <FilterChip
                key={s}
                label={s === "All" ? "All" : STATUS_META[s]?.label ?? s}
                active={statusFilter === s}
                onClick={() => { setStatus(s); setPage(1) }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/80">
                <th className="text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-5 py-3">User</th>
                <th className="text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Amount</th>
                <th className="text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Status</th>
                <th className="text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Plan</th>
                <th className="text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Payment ID</th>
                <th className="text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Date</th>
              </tr>
            </thead>

            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                : filtered.map((p) => {
                    const sm = STATUS_META[p.status] ?? { cls: "bg-zinc-700/60 text-zinc-400 ring-zinc-600/30", icon: null, label: p.status }
                    const cycleCls = CYCLE_META[p.billingCycle?.toLowerCase()] ?? "bg-zinc-700/60 text-zinc-400 ring-zinc-600/30"

                    return (
                      <tr key={p.id} className="border-b border-zinc-800/40 hover:bg-zinc-800/25 transition-colors group/row">
                        {/* User */}
                        <td className="px-5 py-3.5">
                          <Link
                            to={`/admin/users/${p.user.id}`}
                            className="group/link block"
                          >
                            <div className="text-zinc-200 text-sm font-medium group-hover/link:text-red-400 transition-colors truncate max-w-[160px]">
                              {p.user.name}
                            </div>
                            <div className="text-zinc-500 text-xs truncate max-w-[160px]">{p.user.email}</div>
                          </Link>
                        </td>

                        {/* Amount */}
                        <td className="px-4 py-3.5">
                          <span className="text-white font-semibold tabular-nums">{rupees(p.amount)}</span>
                          <div className="mt-0.5">
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ring-1 ${cycleCls}`}>
                              {p.billingCycle}
                            </span>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${sm.cls}`}>
                            {sm.icon}
                            {sm.label}
                          </span>
                        </td>

                        {/* Plan */}
                        <td className="px-4 py-3.5 text-zinc-300 text-xs font-medium">{p.planName}</td>

                        {/* Payment ID */}
                        <td className="px-4 py-3.5">
                          {p.cashfreePaymentId ? (
                            <div className="flex items-center gap-0.5 text-zinc-500 text-xs font-mono">
                              <span>{p.cashfreePaymentId.slice(0, 16)}…</span>
                              <CopyButton value={p.cashfreePaymentId} />
                            </div>
                          ) : (
                            <span className="text-zinc-700 text-xs">—</span>
                          )}
                        </td>

                        {/* Date */}
                        <td className="px-4 py-3.5 text-zinc-500 text-xs whitespace-nowrap">
                          {new Date(p.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    )
                  })}

              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center">
                        <CreditCard size={22} className="text-zinc-600" />
                      </div>
                      <p className="text-zinc-400 font-medium">No payments found</p>
                      <p className="text-zinc-600 text-sm">
                        {q ? `No results for "${q}".` : "No payments match the active filters."}
                      </p>
                      {(q || statusFilter !== "All") && (
                        <button
                          type="button"
                          onClick={() => { clearSearch(); setStatus("All") }}
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
