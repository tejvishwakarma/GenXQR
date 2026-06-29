import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import {
  Loader2, Send, CheckSquare, Square, X,
  AlertCircle, CheckCircle2, Clock, ChevronDown,
  CreditCard, Users, CalendarClock,
} from "lucide-react"
import AdminPagination from "@/components/admin/AdminPagination"
import { fetchAdminSubscriptions, sendRenewalReminders, type AdminSubscription } from "@/lib/api"

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
  ACTIVE:    { cls: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30", icon: <CheckCircle2 size={10} />, label: "Active"    },
  TRIALING:  { cls: "bg-blue-500/15 text-blue-400 ring-blue-500/30",         icon: <Clock        size={10} />, label: "Trialing"  },
  PAST_DUE:  { cls: "bg-amber-500/15 text-amber-400 ring-amber-500/30",      icon: <AlertCircle  size={10} />, label: "Past Due"  },
  CANCELLED: { cls: "bg-zinc-700/60 text-zinc-400 ring-zinc-600/30",         icon: <X            size={10} />, label: "Cancelled" },
  PAUSED:    { cls: "bg-orange-500/15 text-orange-400 ring-orange-500/30",   icon: <Clock        size={10} />, label: "Paused"   },
}

const PLAN_META: Record<string, string> = {
  FREE:       "bg-zinc-700/60 text-zinc-400 ring-zinc-600/30",
  STARTER:    "bg-blue-500/15 text-blue-400 ring-blue-500/30",
  PRO:        "bg-violet-500/15 text-violet-400 ring-violet-500/30",
  BUSINESS:   "bg-amber-500/15 text-amber-400 ring-amber-500/30",
  ENTERPRISE: "bg-red-500/15 text-red-400 ring-red-500/30",
}

const REMINDER_LABELS: Record<string, string> = {
  "7_days": "7d warning", "3_days": "3d warning",
  "1_day":  "1d warning", "expired": "Expired", "manual": "Manual",
}

const STATUS_FILTERS = ["All", "ACTIVE", "TRIALING", "PAST_DUE", "CANCELLED", "PAUSED"] as const
const PLAN_FILTERS   = ["All", "FREE", "STARTER", "PRO", "BUSINESS", "ENTERPRISE"] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

function ExpiryBadge({ sub }: { sub: AdminSubscription }) {
  if (sub.status === "CANCELLED" || sub.status === "PAUSED" || sub.plan.name === "FREE") return null
  const days = daysUntil(sub.currentPeriodEnd)
  if (days < 0)  return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 ring-1 ring-red-500/30">Expired</span>
  if (days <= 1) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 ring-1 ring-red-500/30">1d left</span>
  if (days <= 3) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30">{days}d left</span>
  if (days <= 7) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 ring-1 ring-yellow-500/30">{days}d left</span>
  return null
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-zinc-800/40">
      <td className="px-4 py-4"><div className="w-4 h-4 rounded bg-zinc-800 animate-pulse" /></td>
      {[36, 22, 18, 24, 20, 16].map((w, i) => (
        <td key={i} className="px-4 py-4">
          <div className="h-3 rounded-full bg-zinc-800 animate-pulse" style={{ width: `${w * 3.5}px` }} />
          {i === 0 && <div className="h-2.5 rounded-full bg-zinc-800/60 animate-pulse mt-1.5 w-28" />}
        </td>
      ))}
    </tr>
  )
}

// ─── Filter chip ──────────────────────────────────────────────────────────────

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

interface SendResult { sent: number; skipped: number; failed: number }

export default function AdminSubscriptionsPage() {
  const queryClient = useQueryClient()

  const [page, setPage]               = useState(1)
  const [statusFilter, setStatus]     = useState<typeof STATUS_FILTERS[number]>("All")
  const [planFilter, setPlan]         = useState<typeof PLAN_FILTERS[number]>("All")
  const [showFilters, setShowFilters] = useState(false)
  const [selected, setSelected]       = useState<Set<string>>(new Set())
  const [sendResult, setSendResult]   = useState<SendResult | null>(null)
  const [sendError, setSendError]     = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "subscriptions", page, statusFilter, planFilter],
    queryFn: () =>
      fetchAdminSubscriptions(
        page, 20,
        statusFilter === "All" ? "" : statusFilter,
        planFilter   === "All" ? "" : planFilter,
      ),
  })

  const subs: AdminSubscription[] = data?.data ?? []
  const meta = data?.meta

  // ── Selection helpers ──────────────────────────────────────────────────────
  const allPageIds  = subs.map((s) => s.id)
  const allSelected = allPageIds.length > 0 && allPageIds.every((id) => selected.has(id))
  const someSelected = selected.size > 0

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) allPageIds.forEach((id) => next.delete(id))
      else allPageIds.forEach((id) => next.add(id))
      return next
    })
  }
  function toggleOne(id: string) {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }
  function clearSelection() {
    setSelected(new Set()); setSendResult(null); setSendError(null)
  }

  // ── Send mutation ──────────────────────────────────────────────────────────
  const { mutate: sendReminders, isPending: isSending } = useMutation({
    mutationFn: () => sendRenewalReminders([...selected]),
    onSuccess: (result) => {
      setSendResult({ sent: result.sent, skipped: result.skipped, failed: result.failed })
      setSendError(null)
      setSelected(new Set())
      void queryClient.invalidateQueries({ queryKey: ["admin", "subscriptions"] })
    },
    onError: (err) => setSendError(err instanceof Error ? err.message : "Failed to send reminders"),
  })

  // ── Stat bar derived values ────────────────────────────────────────────────
  const totalSubs    = meta?.total ?? 0
  const activeCount  = subs.filter((s) => s.status === "ACTIVE").length
  const expiringSoon = subs.filter((s) => {
    if (s.status === "CANCELLED" || s.status === "PAUSED" || s.plan.name === "FREE") return false
    const d = Math.ceil((new Date(s.currentPeriodEnd).getTime() - Date.now()) / 86_400_000)
    return d >= 0 && d <= 7
  }).length

  const hasFilter = statusFilter !== "All" || planFilter !== "All"

  return (
    <div className="space-y-6 max-w-6xl">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Subscriptions</h1>
          {meta && <p className="text-zinc-500 text-sm mt-0.5">{meta.total.toLocaleString()} total subscriptions</p>}
        </div>

        <button
          type="button"
          onClick={() => setShowFilters((p) => !p)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border transition ${
            showFilters || hasFilter
              ? "border-red-500/50 text-red-400 bg-red-500/10"
              : "border-zinc-700 text-zinc-400 hover:text-zinc-200 bg-zinc-800/60 hover:border-zinc-500"
          }`}
        >
          <ChevronDown size={14} className={`transition-transform duration-200 ${showFilters ? "rotate-180" : ""}`} />
          Filters
          {hasFilter && <span className="w-1.5 h-1.5 rounded-full bg-red-400 ml-0.5" />}
        </button>
      </div>

      {/* ── Result / error banners ─────────────────────────────────────────── */}
      {sendResult && (
        <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <p className="text-emerald-300 text-sm flex-1">
            Reminders sent: <strong>{sendResult.sent}</strong> sent ·{" "}
            <strong>{sendResult.skipped}</strong> skipped · <strong>{sendResult.failed}</strong> failed
          </p>
          <button onClick={() => setSendResult(null)} className="text-zinc-500 hover:text-zinc-300 transition"><X size={14} /></button>
        </div>
      )}
      {sendError && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="text-red-400 shrink-0" />
          <p className="text-red-300 text-sm flex-1">{sendError}</p>
          <button onClick={() => setSendError(null)} className="text-zinc-500 hover:text-zinc-300 transition"><X size={14} /></button>
        </div>
      )}

      {/* ── Stat bar ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: Users,         label: "Total Subscriptions",  value: totalSubs.toLocaleString(),           color: "text-violet-400",  bg: "bg-violet-500/10" },
          { icon: CheckCircle2,  label: "Active (this page)",   value: `${activeCount} / ${subs.length}`,   color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { icon: CalendarClock, label: "Expiring Soon (≤7d)",  value: expiringSoon > 0 ? String(expiringSoon) : "None", color: expiringSoon > 0 ? "text-amber-400" : "text-zinc-500", bg: expiringSoon > 0 ? "bg-amber-500/10" : "bg-zinc-800" },
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
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Status</p>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_FILTERS.map((s) => (
                <FilterChip
                  key={s}
                  label={s === "All" ? "All" : (STATUS_META[s]?.label ?? s)}
                  active={statusFilter === s}
                  onClick={() => { setStatus(s); setPage(1) }}
                />
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Plan</p>
            <div className="flex flex-wrap gap-1.5">
              {PLAN_FILTERS.map((p) => (
                <FilterChip
                  key={p}
                  label={p === "All" ? "All" : p.charAt(0) + p.slice(1).toLowerCase()}
                  active={planFilter === p}
                  onClick={() => { setPlan(p); setPage(1) }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk action bar ────────────────────────────────────────────────── */}
      {someSelected && (
        <div className="flex items-center gap-3 bg-zinc-800/80 border border-zinc-700 rounded-xl px-4 py-2.5">
          <span className="text-zinc-400 text-sm">
            <span className="text-white font-semibold">{selected.size}</span> selected
          </span>
          <div className="flex-1" />
          <button
            onClick={() => sendReminders()}
            disabled={isSending}
            className="flex items-center gap-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 px-3 py-1.5 rounded-lg transition"
          >
            {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Send Reminder
          </button>
          <button
            onClick={clearSelection}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/80">
                <th className="px-4 py-3 w-10">
                  <button
                    onClick={toggleAll}
                    className="text-zinc-500 hover:text-zinc-300 transition"
                    title={allSelected ? "Deselect all" : "Select all"}
                  >
                    {allSelected
                      ? <CheckSquare size={15} className="text-indigo-400" />
                      : <Square      size={15} />}
                  </button>
                </th>
                <th className="text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">User</th>
                <th className="text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Plan</th>
                <th className="text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Status</th>
                <th className="text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Expires</th>
                <th className="text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Last Reminder</th>
                <th className="text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Since</th>
              </tr>
            </thead>

            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                : subs.map((sub) => {
                    const isChecked = selected.has(sub.id)
                    const sm = STATUS_META[sub.status] ?? { cls: "bg-zinc-700/60 text-zinc-400 ring-zinc-600/30", icon: null, label: sub.status }
                    const planCls = PLAN_META[sub.plan.name] ?? "bg-zinc-700/60 text-zinc-400 ring-zinc-600/30"

                    return (
                      <tr
                        key={sub.id}
                        className={`border-b border-zinc-800/40 transition-colors ${
                          isChecked ? "bg-indigo-500/5" : "hover:bg-zinc-800/25"
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="px-4 py-3.5">
                          <button
                            onClick={() => toggleOne(sub.id)}
                            className="text-zinc-500 hover:text-zinc-300 transition"
                          >
                            {isChecked
                              ? <CheckSquare size={15} className="text-indigo-400" />
                              : <Square      size={15} />}
                          </button>
                        </td>

                        {/* User */}
                        <td className="px-4 py-3.5">
                          <Link to={`/admin/users/${sub.user.id}`} className="group/link block">
                            <div className="text-zinc-200 text-sm font-medium group-hover/link:text-red-400 transition-colors truncate max-w-[160px]">
                              {sub.user.name}
                            </div>
                            <div className="text-zinc-500 text-xs truncate max-w-[160px]">{sub.user.email}</div>
                          </Link>
                        </td>

                        {/* Plan */}
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${planCls}`}>
                            {sub.plan.displayName}
                          </span>
                          <div className="text-zinc-600 text-[11px] mt-0.5">₹{sub.plan.priceMonthlyINR}/mo</div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${sm.cls}`}>
                            {sm.icon}{sm.label}
                          </span>
                          {sub.cancelAtPeriodEnd && (
                            <div className="text-amber-500 text-[11px] mt-0.5">cancels at period end</div>
                          )}
                        </td>

                        {/* Expires */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-zinc-400 text-xs">{new Date(sub.currentPeriodEnd).toLocaleDateString()}</span>
                            <ExpiryBadge sub={sub} />
                          </div>
                          <div className="text-zinc-600 text-[11px] mt-0.5">
                            from {new Date(sub.currentPeriodStart).toLocaleDateString()}
                          </div>
                        </td>

                        {/* Last reminder */}
                        <td className="px-4 py-3.5">
                          {sub.lastReminder ? (
                            <div>
                              <div className="flex items-center gap-1.5">
                                {sub.lastReminder.status === "sent"
                                  ? <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                                  : <AlertCircle  size={12} className="text-red-400 shrink-0" />}
                                <span className="text-xs text-zinc-300">
                                  {REMINDER_LABELS[sub.lastReminder.reminderType] ?? sub.lastReminder.reminderType}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 text-zinc-500 text-[11px] mt-0.5 ml-0.5">
                                <Clock size={10} />
                                {new Date(sub.lastReminder.sentAt).toLocaleDateString()}
                              </div>
                            </div>
                          ) : (
                            <span className="text-zinc-600 text-xs">—</span>
                          )}
                        </td>

                        {/* Since */}
                        <td className="px-4 py-3.5 text-zinc-500 text-xs whitespace-nowrap">
                          {new Date(sub.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    )
                  })}

              {!isLoading && subs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center">
                        <CreditCard size={22} className="text-zinc-600" />
                      </div>
                      <p className="text-zinc-400 font-medium">No subscriptions found</p>
                      <p className="text-zinc-600 text-sm">No subscriptions match the active filters.</p>
                      {hasFilter && (
                        <button
                          type="button"
                          onClick={() => { setStatus("All"); setPlan("All") }}
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
