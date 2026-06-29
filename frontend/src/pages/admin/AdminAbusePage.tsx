import { useState, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Loader2, CheckCircle,
  Plus, Trash2, Link2, User, QrCode, Calendar,
  ShieldCheck, AlertTriangle, ChevronDown, ChevronUp,
  MessageSquare, ExternalLink, Search, X,
} from "lucide-react"
import { Link, useLocation } from "react-router-dom"
import AdminPagination from "@/components/admin/AdminPagination"
import {
  fetchAbuseReports, resolveAbuseReport,
  fetchBlocklist, addToBlocklist, removeFromBlocklist,
  getTokenRole,
  type AbuseReport, type BlocklistEntry,
} from "@/lib/api"

const BLOCKLIST_TYPES = ["domain", "ip", "email", "user"]

const REASON_LABELS: Record<string, { label: string; color: string }> = {
  SPAM:          { label: "Spam",               color: "bg-orange-500/15 text-orange-400 border-orange-500/20" },
  PHISHING:      { label: "Phishing / Malware", color: "bg-red-500/15 text-red-400 border-red-500/20" },
  INAPPROPRIATE: { label: "Inappropriate",      color: "bg-pink-500/15 text-pink-400 border-pink-500/20" },
  COPYRIGHT:     { label: "Copyright",          color: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  ILLEGAL:       { label: "Illegal Content",    color: "bg-red-600/15 text-red-300 border-red-600/20" },
  OTHER:         { label: "Other",              color: "bg-zinc-700 text-zinc-300 border-zinc-600" },
}

// ─── Report card ──────────────────────────────────────────────────────────────

function ReportCard({
  r,
  onResolve,
  isPending,
}: {
  r: AbuseReport
  onResolve: (id: string, notes: string) => void
  isPending: boolean
}) {
  const [expanded, setExpanded]   = useState(false)
  const [notes, setNotes]         = useState("")
  const [showNotes, setShowNotes] = useState(false)

  const reasonMeta = REASON_LABELS[r.reason] ?? REASON_LABELS["OTHER"]!

  return (
    <div className={`bg-zinc-900 border rounded-2xl overflow-hidden transition-all ${r.isResolved ? "border-zinc-800" : "border-zinc-700"}`}>
      {/* Header row */}
      <div className="px-5 py-4 flex items-start gap-4">
        {/* QR info */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Reason badge */}
            <span className={`text-xs px-2 py-0.5 rounded-md border font-medium ${reasonMeta.color}`}>
              {reasonMeta.label}
            </span>
            {/* Status */}
            {r.isResolved ? (
              <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <CheckCircle size={10} /> Resolved
              </span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                <AlertTriangle size={10} /> Open
              </span>
            )}
            {!r.qrCode.isActive && (
              <span className="text-xs px-2 py-0.5 rounded-md bg-red-500/15 text-red-400 border border-red-500/20">
                QR deactivated
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap text-xs text-zinc-500">
            {/* QR Code */}
            <Link
              to={`/admin/qr-codes?q=${r.qrCode.slug}`}
              className="flex items-center gap-1.5 text-zinc-300 hover:text-red-400 transition-colors font-medium"
            >
              <QrCode size={13} />
              {r.qrCode.name}
              <span className="font-mono text-zinc-500">/{r.qrCode.slug}</span>
              <ExternalLink size={10} className="text-zinc-600" />
            </Link>
            <span className="flex items-center gap-1">
              <Calendar size={11} />
              {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          </div>
        </div>

        {/* Expand toggle + resolve */}
        <div className="flex items-center gap-2 shrink-0">
          {!r.isResolved && (
            <button
              onClick={() => setShowNotes((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded-lg transition border border-emerald-500/20"
            >
              <CheckCircle size={12} /> Resolve
            </button>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 transition"
            title={expanded ? "Collapse" : "Expand details"}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-zinc-800 px-5 py-4 grid sm:grid-cols-2 gap-4 text-sm">
          {/* Reporter */}
          <div className="space-y-1">
            <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Reported by</p>
            {r.reporter ? (
              <Link
                to={`/admin/users/${r.reporter.id}`}
                className="flex items-center gap-2 text-zinc-300 hover:text-red-400 transition-colors"
              >
                <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] font-semibold text-zinc-300 shrink-0">
                  {r.reporter.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-medium leading-none">{r.reporter.name}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{r.reporter.email}</div>
                </div>
              </Link>
            ) : (
              <div className="flex items-center gap-2 text-zinc-500">
                <User size={14} />
                <span className="text-xs italic">Anonymous</span>
              </div>
            )}
          </div>

          {/* QR Owner */}
          <div className="space-y-1">
            <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">QR owner</p>
            {r.qrOwner ? (
              <Link
                to={`/admin/users/${r.qrOwner.id}`}
                className="flex items-center gap-2 text-zinc-300 hover:text-red-400 transition-colors"
              >
                <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] font-semibold text-zinc-300 shrink-0">
                  {r.qrOwner.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-medium leading-none">{r.qrOwner.name}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{r.qrOwner.email}</div>
                </div>
              </Link>
            ) : (
              <span className="text-zinc-500 text-xs italic">Unknown owner</span>
            )}
          </div>

          {/* Additional details */}
          {r.url && (
            <div className="sm:col-span-2 space-y-1">
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide flex items-center gap-1.5">
                <MessageSquare size={11} /> Additional details
              </p>
              <p className="text-zinc-300 text-sm bg-zinc-800/60 rounded-xl px-3 py-2 border border-zinc-700/50 leading-relaxed">
                {r.url}
              </p>
            </div>
          )}

          {/* Admin notes (if resolved) */}
          {r.isResolved && (
            <div className="sm:col-span-2 space-y-1">
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide flex items-center gap-1.5">
                <ShieldCheck size={11} /> Resolution
              </p>
              <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl px-3 py-2.5 text-sm">
                {r.adminNotes ? (
                  <p className="text-zinc-300 leading-relaxed">{r.adminNotes}</p>
                ) : (
                  <p className="text-zinc-500 italic">No notes left.</p>
                )}
                <div className="mt-1.5 flex items-center gap-3 text-xs text-zinc-600">
                  {r.resolvedByUser && <span>by {r.resolvedByUser.name}</span>}
                  {r.resolvedAt && (
                    <span>{new Date(r.resolvedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Inline resolve form */}
      {showNotes && !r.isResolved && (
        <div className="border-t border-zinc-800 px-5 py-4 space-y-3">
          <p className="text-xs text-zinc-400 font-medium">Add admin notes (optional)</p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Describe the action taken or reason for resolving…"
            className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl px-3 py-2.5 placeholder-zinc-600 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => { onResolve(r.id, notes); setShowNotes(false) }}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition disabled:opacity-50"
            >
              {isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
              Confirm resolve
            </button>
            <button
              onClick={() => setShowNotes(false)}
              className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AdminAbusePage() {
  const isSuperAdmin = getTokenRole() === "SUPER_ADMIN"
  const location = useLocation()
  // Allow deep-linking to blocklist tab: /admin/abuse?tab=blocklist&type=email&q=user@example.com
  const urlParams  = new URLSearchParams(location.search)
  const defaultTab = (urlParams.get("tab") === "blocklist" ? "blocklist" : "reports") as "reports" | "blocklist"
  const defaultType = urlParams.get("type") ?? ""
  const defaultSearch = urlParams.get("q") ?? ""

  const [tab, setTab]             = useState<"reports" | "blocklist">(defaultTab)
  const [page, setPage]           = useState(1)
  const [resolved, setResolved]   = useState(false)
  const [blType, setBlType]       = useState(defaultType)
  const [blSearch, setBlSearch]   = useState(defaultSearch)
  const [newType, setNewType]     = useState("email")
  const [newValue, setNewValue]   = useState("")
  const [newReason, setNewReason] = useState("")
  const qc = useQueryClient()

  const { data: reportsData, isLoading: reportsLoading } = useQuery({
    queryKey: ["admin", "abuse-reports", page, resolved],
    queryFn:  () => fetchAbuseReports(page, 20, resolved),
    enabled:  tab === "reports",
  })

  const { data: blocklistData, isLoading: blocklistLoading } = useQuery({
    queryKey: ["admin", "blocklist", page, blType],
    queryFn:  () => fetchBlocklist(page, 20, blType),
    enabled:  tab === "blocklist",
  })

  const resolveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      resolveAbuseReport(id, notes || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "abuse-reports"] })
      qc.invalidateQueries({ queryKey: ["admin", "abuse-count"] })
    },
  })

  const addMutation = useMutation({
    mutationFn: () => addToBlocklist(newType, newValue, newReason || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "blocklist"] })
      setNewValue(""); setNewReason("")
    },
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeFromBlocklist(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "blocklist"] }),
  })

  const handleAddBlocklist = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!newValue.trim()) return
      addMutation.mutate()
    },
    [addMutation, newValue],
  )

  const reports: AbuseReport[] = reportsData?.data ?? []
  const allBlocklist: BlocklistEntry[] = blocklistData?.data ?? []
  // Client-side search filter on value field
  const blocklist = blSearch.trim()
    ? allBlocklist.filter((b) => b.value.toLowerCase().includes(blSearch.trim().toLowerCase()))
    : allBlocklist
  const meta = tab === "reports" ? reportsData?.meta : blocklistData?.meta
  const unresolvedTotal = !resolved ? (reportsData?.meta.total ?? 0) : 0

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Abuse &amp; Moderation</h1>
          {unresolvedTotal > 0 && (
            <p className="text-zinc-500 text-sm mt-0.5">{unresolvedTotal} open report{unresolvedTotal !== 1 ? "s" : ""} awaiting review</p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
        {(["reports", "blocklist"] as const).map((t) => (
          <button key={t} onClick={() => { setTab(t); setPage(1) }}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors capitalize flex items-center gap-2 ${tab === t ? "bg-red-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
            {t === "reports" ? "Abuse Reports" : "Blocklist"}
            {t === "reports" && unresolvedTotal > 0 && tab !== "reports" && (
              <span className="min-w-4 h-4 px-1 rounded-full bg-white/20 text-white text-[10px] leading-none flex items-center justify-center">
                {unresolvedTotal > 99 ? "99+" : unresolvedTotal}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "reports" && (
        <>
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
              <input type="checkbox" checked={!resolved} onChange={(e) => { setResolved(!e.target.checked); setPage(1) }}
                className="accent-red-500" />
              Show unresolved only
            </label>
            {meta && (
              <span className="text-xs text-zinc-600">{meta.total} report{meta.total !== 1 ? "s" : ""}</span>
            )}
          </div>

          {reportsLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-red-400 animate-spin" /></div>
          ) : reports.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-16 text-center text-zinc-500">
              No reports found.
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((r) => (
                <ReportCard
                  key={r.id}
                  r={r}
                  onResolve={(id, notes) => resolveMutation.mutate({ id, notes })}
                  isPending={resolveMutation.isPending}
                />
              ))}
            </div>
          )}
        </>
      )}

      {tab === "blocklist" && (
        <>
          {/* Add form */}
          <form onSubmit={handleAddBlocklist} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex gap-3 flex-wrap items-end">
            <div className="space-y-1">
              <label className="text-zinc-500 text-xs">Type</label>
              <select value={newType} onChange={(e) => setNewType(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/40">
                {BLOCKLIST_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1 flex-1 min-w-32">
              <label className="text-zinc-500 text-xs">Value</label>
              <input value={newValue} onChange={(e) => setNewValue(e.target.value)} required placeholder="e.g. spam.com"
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl px-3 py-2 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-red-500/40" />
            </div>
            <div className="space-y-1 flex-1 min-w-32">
              <label className="text-zinc-500 text-xs">Reason (optional)</label>
              <input value={newReason} onChange={(e) => setNewReason(e.target.value)} placeholder="Spam, phishing…"
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl px-3 py-2 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-red-500/40" />
            </div>
            <button type="submit" disabled={addMutation.isPending || !newValue.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded-xl transition disabled:opacity-50">
              <Plus size={15} /> Add
            </button>
          </form>

          {/* Filters row */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-48">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <input
                value={blSearch}
                onChange={(e) => { setBlSearch(e.target.value); setPage(1) }}
                placeholder="Search by email, domain, IP…"
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm rounded-xl pl-8 pr-8 py-2 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-red-500/40"
              />
              {blSearch && (
                <button
                  onClick={() => setBlSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Type pills */}
            <div className="flex gap-2 flex-wrap">
              {["", ...BLOCKLIST_TYPES].map((t) => (
                <button key={t} onClick={() => { setBlType(t); setPage(1) }}
                  className={`px-3 py-1.5 text-xs rounded-lg transition ${blType === t ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"}`}>
                  {t || "All"}
                </button>
              ))}
              {/* Convenience shortcut: show only admin-deleted accounts */}
              <button
                onClick={() => { setBlType("email"); setBlSearch(""); setPage(1) }}
                className="px-3 py-1.5 text-xs rounded-lg transition bg-zinc-800 text-violet-400 hover:bg-violet-500/10 border border-violet-500/20"
                title="Show only emails blocked due to account deletion"
              >
                Deleted accounts
              </button>
            </div>
          </div>

          {blocklistLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-red-400 animate-spin" /></div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left text-zinc-500 font-medium px-5 py-3">Type</th>
                    <th className="text-left text-zinc-500 font-medium px-4 py-3">Value</th>
                    <th className="text-left text-zinc-500 font-medium px-4 py-3">Reason</th>
                    <th className="text-left text-zinc-500 font-medium px-4 py-3">Blocks</th>
                    <th className="text-left text-zinc-500 font-medium px-4 py-3">Added</th>
                    <th className="text-right text-zinc-500 font-medium px-5 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {blocklist.map((b) => (
                    <tr key={b.id} className={`border-b border-zinc-800/50 transition-colors ${b.isPermanent ? "bg-red-500/5" : "hover:bg-zinc-800/30"}`}>
                      <td className="px-5 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-md bg-zinc-700 text-zinc-300 font-mono">{b.type}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-zinc-300">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link2 size={12} className="text-zinc-600 shrink-0" />
                          <span>{b.value}</span>
                          {b.isPermanent && (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                              Permanently Banned
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {b.reason === "account_deleted_by_admin"
                          ? <span className="px-2 py-0.5 rounded-md bg-red-500/15 text-red-400 border border-red-500/20">Deleted by admin</span>
                          : <span className="text-zinc-500">{b.reason ?? "—"}</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {[1, 2, 3].map((n) => (
                            <div
                              key={n}
                              className={`w-2 h-2 rounded-full ${
                                n <= (b.blockCount ?? 1)
                                  ? b.isPermanent ? "bg-red-500" : "bg-amber-400"
                                  : "bg-zinc-700"
                              }`}
                              title={`Block ${n}`}
                            />
                          ))}
                          <span className="text-zinc-500 text-xs ml-0.5">{b.blockCount ?? 1}/3</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-500 text-xs">{new Date(b.createdAt).toLocaleDateString()}</td>
                      <td className="px-5 py-3 text-right">
                        {b.isPermanent && !isSuperAdmin ? (
                          <span className="text-xs text-zinc-600 italic">Super admin only</span>
                        ) : (
                          <button
                            onClick={() => removeMutation.mutate(b.id)}
                            disabled={removeMutation.isPending}
                            title={b.isPermanent ? "Lift permanent ban (SUPER_ADMIN)" : "Unblock this email"}
                            className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg transition disabled:opacity-50 ${
                              b.isPermanent
                                ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
                                : "bg-zinc-800 text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
                            }`}
                          >
                            <Trash2 size={12} /> {b.isPermanent ? "Lift ban" : "Unblock"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {blocklist.length === 0 && (
                    <tr><td colSpan={5} className="px-5 py-12 text-center text-zinc-500">Blocklist is empty.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Shared pagination */}
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
  )
}
