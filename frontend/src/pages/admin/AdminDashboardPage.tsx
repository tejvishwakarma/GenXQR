import { useState } from "react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts"
import {
  Users, QrCode, Scan, DollarSign, HardDrive, TrendingUp, RefreshCw,
  ArrowUpRight, Crown, Activity, Clock,
  Database, Server, Layers, HeartPulse, CheckCircle2, AlertTriangle, XCircle,
} from "lucide-react"
import {
  fetchAdminDashboard, fetchAdminSignups, fetchAdminScans, fetchAdminSystemHealth,
} from "@/lib/api"

const PLAN_COLORS: Record<string, string> = {
  FREE:       "bg-zinc-700 text-zinc-300",
  STARTER:    "bg-blue-500/20 text-blue-300 border-blue-500/30",
  PRO:        "bg-violet-500/20 text-violet-300 border-violet-500/30",
  BUSINESS:   "bg-amber-500/20 text-amber-300 border-amber-500/30",
  ENTERPRISE: "bg-red-500/20 text-red-300 border-red-500/30",
}

function formatINR(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  if (n >= 1000)   return `₹${(n / 1000).toFixed(1)}K`
  return `₹${n}`
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)   return "just now"
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

interface KPICardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
  gradient: string
  iconBg: string
  href?: string
}

function KPICard({ icon, label, value, sub, gradient, iconBg, href }: KPICardProps) {
  const inner = (
    <div className={`relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-5 ${href ? "transition hover:border-zinc-600 hover:shadow-lg cursor-pointer" : ""}`}>
      <div className={`absolute inset-0 opacity-5 ${gradient}`} />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide">{label}</p>
          <p className="text-white text-2xl font-bold mt-1">{value}</p>
          {sub && <p className="text-zinc-500 text-xs mt-1">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
          {icon}
        </div>
      </div>
      {href && (
        <div className="absolute bottom-3 right-4 flex items-center gap-1 text-zinc-600 text-[10px] font-medium group-hover:text-zinc-400 transition">
          View all <ArrowUpRight size={10} />
        </div>
      )}
    </div>
  )
  if (href) return <Link to={href} className="group block">{inner}</Link>
  return inner
}

/** Reads the current admin's role from the stored access token (client-side gate only). */
function currentRole(): string | null {
  try {
    const token = localStorage.getItem("access_token")
    if (!token) return null
    const payload = JSON.parse(atob(token.split(".")[1] ?? "")) as { role?: string }
    return payload.role ?? null
  } catch {
    return null
  }
}

function formatUptime(sec: number): string {
  const days = Math.floor(sec / 86400)
  const hrs = Math.floor((sec % 86400) / 3600)
  const mins = Math.floor((sec % 3600) / 60)
  const parts: string[] = []
  if (days) parts.push(`${days}d`)
  if (hrs) parts.push(`${hrs}h`)
  parts.push(`${mins}m`)
  return parts.join(" ")
}

const OVERALL_STYLES = {
  healthy:  { label: "All systems operational", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", Icon: CheckCircle2 },
  degraded: { label: "Degraded",                cls: "bg-amber-500/15 text-amber-300 border-amber-500/30",       Icon: AlertTriangle },
  down:     { label: "Outage",                  cls: "bg-red-500/15 text-red-300 border-red-500/30",             Icon: XCircle },
} as const

function ServiceRow({ icon, name, up, detail }: { icon: React.ReactNode; name: string; up: boolean; detail?: string }) {
  return (
    <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl">
      <div className="flex items-center gap-2.5">
        <span className="text-zinc-400">{icon}</span>
        <span className="text-white text-sm font-medium">{name}</span>
      </div>
      <div className="flex items-center gap-2">
        {detail && <span className="text-zinc-500 text-xs">{detail}</span>}
        <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${up ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : "bg-red-500/15 text-red-300 border-red-500/30"}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${up ? "bg-emerald-400" : "bg-red-400"}`} />
          {up ? "Up" : "Down"}
        </span>
      </div>
    </div>
  )
}

function HealthStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 bg-zinc-800/50 rounded-xl">
      <p className="text-zinc-500 text-[11px] uppercase tracking-wide">{label}</p>
      <p className="text-white text-sm font-semibold mt-0.5 truncate">{value}</p>
    </div>
  )
}

function SystemHealthPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "system-health"],
    queryFn: fetchAdminSystemHealth,
    refetchInterval: 15_000,
  })
  const h = data?.data
  if (isLoading && !h) {
    return <div className="h-56 bg-zinc-900 rounded-2xl border border-zinc-800 animate-pulse" />
  }
  if (!h) return null
  const overall = OVERALL_STYLES[h.overall]
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <HeartPulse size={18} className="text-rose-400" />
          <p className="text-white font-semibold">System Health</p>
        </div>
        <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${overall.cls}`}>
          <overall.Icon size={13} />
          {overall.label}
        </span>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <ServiceRow icon={<Database size={16} />} name="Database" up={h.database.status === "up"}
          detail={h.database.latencyMs != null ? `${h.database.latencyMs}ms` : undefined} />
        <ServiceRow icon={<Server size={16} />} name="Redis" up={h.redis.status === "up"}
          detail={h.redis.latencyMs != null ? `${h.redis.latencyMs}ms` : undefined} />
        <ServiceRow icon={<Layers size={16} />} name="Scan Queue" up={h.queue.status === "up"}
          detail={h.queue.status === "up" ? `${h.queue.waiting} queued` : undefined} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
        <HealthStat label="Uptime" value={formatUptime(h.process.uptimeSec)} />
        <HealthStat label="Memory (RSS)" value={`${h.process.memoryMB.rss} MB`} />
        <HealthStat label="Node" value={h.process.nodeVersion} />
        <HealthStat label="Environment" value={h.process.environment} />
      </div>

      {h.queue.status === "up" && (h.queue.active > 0 || h.queue.delayed > 0 || h.queue.failed > 0) && (
        <div className="flex flex-wrap items-center gap-2 mt-3 text-xs">
          <span className="text-zinc-500">Queue:</span>
          <span className="px-2 py-0.5 rounded-full border font-medium bg-blue-500/15 text-blue-300 border-blue-500/30">{h.queue.active} active</span>
          <span className="px-2 py-0.5 rounded-full border font-medium bg-amber-500/15 text-amber-300 border-amber-500/30">{h.queue.delayed} delayed</span>
          <span className="px-2 py-0.5 rounded-full border font-medium bg-red-500/15 text-red-300 border-red-500/30">{h.queue.failed} failed</span>
        </div>
      )}
    </div>
  )
}

export default function AdminDashboardPage() {
  const [range, setRange] = useState(30)
  const [lastRefresh, setLastRefresh] = useState(() => new Date())
  const isSuperAdmin = currentRole() === "SUPER_ADMIN"

  const { data: dash, isLoading, refetch } = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: fetchAdminDashboard,
    refetchInterval: 30_000,
  })

  const { data: signupsData } = useQuery({
    queryKey: ["admin", "signups", range],
    queryFn: () => fetchAdminSignups(range),
  })

  const { data: scansData } = useQuery({
    queryKey: ["admin", "scans", range],
    queryFn: () => fetchAdminScans(range),
  })

  const d = dash?.data
  const signups = signupsData?.data ?? []
  const scans   = scansData?.data ?? []

  function handleRefresh() {
    void refetch()
    setLastRefresh(new Date())
  }

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-zinc-900 rounded-2xl border border-zinc-800" />
          ))}
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-64 bg-zinc-900 rounded-2xl border border-zinc-800" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Platform overview · refreshes every 30s</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-zinc-600 text-xs flex items-center gap-1">
            <Clock size={12} />
            {lastRefresh.toLocaleTimeString()}
          </span>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-900 border border-zinc-700 text-zinc-300 text-sm rounded-xl hover:bg-zinc-800 transition"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Total Users"
          value={d?.totalUsers.toLocaleString() ?? "—"}
          sub="registered accounts"
          icon={<Users size={18} className="text-blue-400" />}
          gradient="bg-blue-500"
          iconBg="bg-blue-500/10 border border-blue-500/20"
          href="/admin/users"
        />
        <KPICard
          label="Active Subscriptions"
          value={d?.activeSubscriptions.toLocaleString() ?? "—"}
          sub="paid plans"
          icon={<Crown size={18} className="text-amber-400" />}
          gradient="bg-amber-500"
          iconBg="bg-amber-500/10 border border-amber-500/20"
          href="/admin/subscriptions"
        />
        <KPICard
          label="Monthly Revenue"
          value={d ? formatINR(d.mrr) : "—"}
          sub="MRR (est.)"
          icon={<DollarSign size={18} className="text-emerald-400" />}
          gradient="bg-emerald-500"
          iconBg="bg-emerald-500/10 border border-emerald-500/20"
          href="/admin/revenue"
        />
        <KPICard
          label="Scans Today"
          value={d?.scansToday.toLocaleString() ?? "—"}
          sub={`${d?.totalScans.toLocaleString() ?? "—"} total`}
          icon={<Scan size={18} className="text-violet-400" />}
          gradient="bg-violet-500"
          iconBg="bg-violet-500/10 border border-violet-500/20"
          href="/admin/analytics"
        />
      </div>

      {/* KPI Row 2 */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KPICard
          label="QR Codes"
          value={d?.totalQRCodes.toLocaleString() ?? "—"}
          sub="created on platform"
          icon={<QrCode size={18} className="text-indigo-400" />}
          gradient="bg-indigo-500"
          iconBg="bg-indigo-500/10 border border-indigo-500/20"
          href="/admin/qr-codes"
        />
        <KPICard
          label="Storage Used"
          value={d ? `${d.storageGB} GB` : "—"}
          sub="files on platform"
          icon={<HardDrive size={18} className="text-pink-400" />}
          gradient="bg-pink-500"
          iconBg="bg-pink-500/10 border border-pink-500/20"
          href="/admin/storage"
        />
        <KPICard
          label="ARR (est.)"
          value={d ? formatINR(d.mrr * 12) : "—"}
          sub="annual run rate"
          icon={<TrendingUp size={18} className="text-teal-400" />}
          gradient="bg-teal-500"
          iconBg="bg-teal-500/10 border border-teal-500/20"
          href="/admin/revenue"
        />
      </div>

      {/* System Health — SUPER_ADMIN only */}
      {isSuperAdmin && <SystemHealthPanel />}

      {/* Range selector */}
      <div className="flex items-center gap-2">
        <span className="text-zinc-500 text-sm">Trend window:</span>
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setRange(d)}
            className={`px-3 py-1 text-xs rounded-lg font-medium transition ${
              range === d
                ? "bg-violet-600 text-white"
                : "bg-zinc-900 border border-zinc-700 text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            {d}d
          </button>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Signups chart */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-white font-semibold">User Signups</p>
              <p className="text-zinc-500 text-xs">{range}-day trend</p>
            </div>
            <ArrowUpRight size={16} className="text-blue-400" />
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={signups} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="signupGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#52525b", fontSize: 11 }} tickLine={false} axisLine={false}
                tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fill: "#52525b", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 10, color: "#f4f4f5" }}
                labelStyle={{ color: "#a1a1aa", fontSize: 12 }}
              />
              <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2}
                fill="url(#signupGrad)" name="Signups" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Scans chart */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-white font-semibold">QR Scans</p>
              <p className="text-zinc-500 text-xs">{range}-day trend</p>
            </div>
            <Activity size={16} className="text-violet-400" />
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={scans} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="scanGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#52525b", fontSize: 11 }} tickLine={false} axisLine={false}
                tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fill: "#52525b", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 10, color: "#f4f4f5" }}
                labelStyle={{ color: "#a1a1aa", fontSize: 12 }}
              />
              <Area type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={2}
                fill="url(#scanGrad)" name="Scans" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Signups Feed */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-white font-semibold">Recent Signups</p>
          <Link to="/admin/users" className="text-zinc-500 text-xs hover:text-zinc-300 flex items-center gap-1 transition">
            View all users <ArrowUpRight size={11} />
          </Link>
        </div>
        <div className="space-y-3">
          {(d?.recentSignups ?? []).length === 0 ? (
            <p className="text-zinc-600 text-sm text-center py-6">No signups yet</p>
          ) : (
            (d?.recentSignups ?? []).map((u) => {
              const plan = u.subscription?.plan?.name ?? "FREE"
              return (
                <Link key={u.id} to={`/admin/users/${u.id}`} className="flex items-center gap-3 p-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition group">
                  <div className="w-8 h-8 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-400 text-sm font-bold shrink-0">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{u.name}</p>
                    <p className="text-zinc-500 text-xs truncate">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${PLAN_COLORS[plan] ?? PLAN_COLORS.FREE}`}>
                      {plan}
                    </span>
                    <span className="text-zinc-600 text-xs">{timeAgo(u.createdAt)}</span>
                    <ArrowUpRight size={13} className="text-zinc-700 group-hover:text-zinc-400 transition" />
                  </div>
                </Link>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
