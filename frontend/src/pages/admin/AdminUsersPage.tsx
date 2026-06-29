import { useState, useCallback, useRef } from "react"
import { Link } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Search, Loader2, Trash2, Shield, ExternalLink,
  Users, UserCheck, QrCode, X, ChevronDown,
} from "lucide-react"
import AdminPagination from "@/components/admin/AdminPagination"
import { fetchAdminUsers, deleteAdminUser, type AdminUser } from "@/lib/api"

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_META: Record<string, { label: string; cls: string }> = {
  USER:        { label: "User",        cls: "bg-zinc-700/60 text-zinc-300 ring-zinc-600/40" },
  ADMIN:       { label: "Admin",       cls: "bg-amber-500/15 text-amber-400 ring-amber-500/30" },
  SUPER_ADMIN: { label: "Super Admin", cls: "bg-red-500/15 text-red-400 ring-red-500/30" },
}

const PLAN_META: Record<string, string> = {
  ACTIVE:    "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
  TRIALING:  "bg-blue-500/15 text-blue-400 ring-blue-500/30",
  CANCELLED: "bg-zinc-700/60 text-zinc-400 ring-zinc-600/40",
  PAST_DUE:  "bg-red-500/15 text-red-400 ring-red-500/30",
  PAUSED:    "bg-amber-500/15 text-amber-400 ring-amber-500/30",
}

const ROLE_FILTERS  = ["All Roles",  "USER", "ADMIN", "SUPER_ADMIN"] as const
const STATUS_FILTERS = ["All Plans", "FREE", "PRO", "ENTERPRISE", "STARTER", "BUSINESS"] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase()
}

function avatarColor(id: string) {
  const palette = [
    "from-violet-500 to-purple-700",
    "from-rose-500 to-pink-700",
    "from-amber-500 to-orange-700",
    "from-emerald-500 to-teal-700",
    "from-sky-500 to-blue-700",
    "from-fuchsia-500 to-violet-700",
  ]
  let hash = 0
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
  return palette[Math.abs(hash) % palette.length]
}

function relativeTime(iso: string | null) {
  if (!iso) return null
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  < 2)  return "just now"
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days  < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

// ─── Skeleton Row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-zinc-800/40">
      {[36, 24, 20, 12, 16].map((w, i) => (
        <td key={i} className="px-5 py-4">
          <div
            className="h-3 rounded-full bg-zinc-800 animate-pulse"
            style={{ width: `${w * 4}px`, maxWidth: "100%" }}
          />
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

interface ChipProps {
  label: string
  active: boolean
  onClick: () => void
}
function FilterChip({ label, active, onClick }: ChipProps) {
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

export default function AdminUsersPage() {
  const qc = useQueryClient()

  const [page, setPage]           = useState(1)
  const [search, setSearch]       = useState("")
  const [q, setQ]                 = useState("")
  const [roleFilter, setRole]     = useState("All Roles")
  const [statusFilter, setStatus] = useState("All Plans")
  const [showFilters, setShowFilters] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "users", page, q],
    queryFn: () => fetchAdminUsers(page, 20, q),
  })

  const deleteMut = useMutation({
    mutationFn: deleteAdminUser,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
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

  const rawUsers: AdminUser[] = data?.data ?? []
  const meta = data?.meta

  // Client-side filter by role / plan (server only supports text search)
  const users = rawUsers.filter((u) => {
    if (roleFilter !== "All Roles" && u.role !== roleFilter) return false
    if (statusFilter !== "All Plans") {
      const plan = u.subscription?.plan.name.toUpperCase() ?? "FREE"
      if (plan !== statusFilter) return false
    }
    return true
  })

  // Quick stats derived from current page data
  const totalUsers     = meta?.total ?? 0
  const verifiedCount  = rawUsers.filter((u) => u.emailVerified).length
  const qrTotal        = rawUsers.reduce((s, u) => s + u._count.qrCodes, 0)

  return (
    <div className="space-y-6 max-w-6xl">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Users</h1>
          {meta && (
            <p className="text-zinc-500 text-sm mt-0.5">
              {meta.total.toLocaleString()} registered accounts
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
              placeholder="Search by email or name…"
              className="bg-zinc-800/80 border border-zinc-700 rounded-xl pl-8 pr-8 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500/50 w-64 transition"
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
              showFilters || roleFilter !== "All Roles" || statusFilter !== "All Plans"
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
            {(roleFilter !== "All Roles" || statusFilter !== "All Plans") && (
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 ml-0.5" />
            )}
          </button>
        </form>
      </div>

      {/* ── Stat bar ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: Users,     label: "Total Users",     value: totalUsers.toLocaleString(),  color: "text-violet-400", bg: "bg-violet-500/10" },
          { icon: UserCheck, label: "Verified (page)",  value: `${verifiedCount} / ${rawUsers.length}`, color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { icon: QrCode,    label: "QRs (this page)",  value: qrTotal.toLocaleString(),    color: "text-sky-400",    bg: "bg-sky-500/10" },
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
        <div className="flex flex-wrap gap-4">
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider pl-0.5">Role</p>
            <div className="flex flex-wrap gap-1.5">
              {ROLE_FILTERS.map((r) => (
                <FilterChip
                  key={r}
                  label={r === "SUPER_ADMIN" ? "Super Admin" : r === "All Roles" ? "All" : r.charAt(0) + r.slice(1).toLowerCase()}
                  active={roleFilter === r}
                  onClick={() => { setRole(r); setPage(1) }}
                />
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider pl-0.5">Plan</p>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_FILTERS.map((s) => (
                <FilterChip
                  key={s}
                  label={s === "All Plans" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
                  active={statusFilter === s}
                  onClick={() => { setStatus(s); setPage(1) }}
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
                <th className="text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-5 py-3">User</th>
                <th className="text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Role</th>
                <th className="text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Plan</th>
                <th className="text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">QRs</th>
                <th className="text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Joined</th>
                <th className="text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Last Login</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>

            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                : users.map((u) => {
                    const roleMeta = ROLE_META[u.role] ?? ROLE_META["USER"]
                    const planCls  = u.subscription
                      ? (PLAN_META[u.subscription.status] ?? "bg-zinc-700/60 text-zinc-400 ring-zinc-600/40")
                      : "bg-zinc-700/60 text-zinc-500 ring-zinc-600/40"
                    const planLabel = u.subscription?.plan.name ?? "Free"
                    const lastLogin = relativeTime(u.lastLoginAt)

                    return (
                      <tr
                        key={u.id}
                        className="border-b border-zinc-800/40 hover:bg-zinc-800/25 transition-colors group"
                      >
                        {/* Avatar + name */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-8 h-8 rounded-full bg-gradient-to-br ${avatarColor(u.id)} flex items-center justify-center flex-shrink-0 text-white text-xs font-bold select-none`}
                            >
                              {initials(u.name || u.email)}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-white truncate max-w-[180px]">{u.name}</div>
                              <div className="text-zinc-500 text-xs truncate max-w-[180px]">{u.email}</div>
                            </div>
                          </div>
                        </td>

                        {/* Role */}
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${roleMeta.cls}`}>
                            {u.role === "SUPER_ADMIN" && <Shield size={10} />}
                            {roleMeta.label}
                          </span>
                        </td>

                        {/* Plan */}
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${planCls}`}>
                            {planLabel}
                          </span>
                        </td>

                        {/* QR count */}
                        <td className="px-4 py-3.5">
                          <span className="text-zinc-300 font-medium tabular-nums">{u._count.qrCodes}</span>
                        </td>

                        {/* Joined */}
                        <td className="px-4 py-3.5 text-zinc-500 text-xs whitespace-nowrap">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>

                        {/* Last login */}
                        <td className="px-4 py-3.5 text-zinc-500 text-xs whitespace-nowrap">
                          {lastLogin ?? <span className="text-zinc-700">—</span>}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            <Link
                              to={`/admin/users/${u.id}`}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition"
                              title="View detail"
                            >
                              <ExternalLink size={14} />
                            </Link>
                            <button
                              onClick={() => {
                                if (window.confirm(`Delete "${u.name}" (${u.email})? This is irreversible.`)) {
                                  deleteMut.mutate(u.id)
                                }
                              }}
                              disabled={deleteMut.isPending}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition disabled:opacity-40"
                              title="Delete user"
                            >
                              {deleteMut.isPending ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <Trash2 size={14} />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}

              {/* Empty state */}
              {!isLoading && users.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center">
                        <Users size={22} className="text-zinc-600" />
                      </div>
                      <p className="text-zinc-400 font-medium">No users found</p>
                      <p className="text-zinc-600 text-sm">
                        {q ? `No results for "${q}". Try adjusting your search or filters.` : "No users match the active filters."}
                      </p>
                      {(q || roleFilter !== "All Roles" || statusFilter !== "All Plans") && (
                        <button
                          type="button"
                          onClick={() => { clearSearch(); setRole("All Roles"); setStatus("All Plans") }}
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
