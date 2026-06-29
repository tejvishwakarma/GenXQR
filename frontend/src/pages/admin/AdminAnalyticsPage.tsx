import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts"
import { TrendingUp, Scan, QrCode, DollarSign, PieChart as PieIcon, Loader2 } from "lucide-react"
import {
  fetchAdminSignups, fetchAdminScans, fetchAdminStaticQRStats,
  fetchAdminRevenueTrend, fetchAdminPlanBreakdown,
} from "@/lib/api"

const RANGE_OPTIONS = [7, 30, 90] as const
type Range = typeof RANGE_OPTIONS[number]

const QR_TYPE_COLORS: Record<string, string> = {
  url:       "#6366f1",
  wifi:      "#22d3ee",
  whatsapp:  "#22c55e",
  instagram: "#ec4899",
  other:     "#a1a1aa",
}

const PLAN_PIE_COLORS = ["#6366f1", "#3b82f6", "#22c55e", "#f59e0b", "#ec4899"]

function ChartCard({ title, sub, icon, children }: {
  title: string; sub?: string; icon: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center">
          {icon}
        </div>
        <div>
          <p className="text-white font-semibold text-sm">{title}</p>
          {sub && <p className="text-zinc-500 text-xs">{sub}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}

export default function AdminAnalyticsPage() {
  const [range, setRange] = useState<Range>(30)

  const { data: signupsData, isLoading: loadSignups } = useQuery({
    queryKey: ["admin", "analytics", "signups", range],
    queryFn: () => fetchAdminSignups(range),
  })
  const { data: scansData, isLoading: loadScans } = useQuery({
    queryKey: ["admin", "analytics", "scans", range],
    queryFn: () => fetchAdminScans(range),
  })
  const { data: staticQRData, isLoading: loadStatic } = useQuery({
    queryKey: ["admin", "analytics", "static-qr", range],
    queryFn: () => fetchAdminStaticQRStats(range),
  })
  const { data: revenueData, isLoading: loadRevenue } = useQuery({
    queryKey: ["admin", "analytics", "revenue-trend", range],
    queryFn: () => fetchAdminRevenueTrend(range),
  })
  const { data: planData, isLoading: loadPlan } = useQuery({
    queryKey: ["admin", "analytics", "plan-breakdown"],
    queryFn: fetchAdminPlanBreakdown,
  })

  const signups = signupsData?.data ?? []
  const scans   = scansData?.data ?? []
  const staticQR = staticQRData?.data?.series ?? []
  const revenue  = revenueData?.data ?? []
  const plans    = planData?.data ?? []

  const gradientDef = (id: string, color: string) => (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%"  stopColor={color} stopOpacity={0.3} />
        <stop offset="95%" stopColor={color} stopOpacity={0} />
      </linearGradient>
    </defs>
  )

  const tooltipStyle = {
    contentStyle: { background: "#18181b", border: "1px solid #3f3f46", borderRadius: 10, color: "#f4f4f5" },
    labelStyle:   { color: "#a1a1aa", fontSize: 12 },
  }

  const axisProps = {
    xAxis: { tick: { fill: "#52525b", fontSize: 11 }, tickLine: false, axisLine: false },
    yAxis: { tick: { fill: "#52525b", fontSize: 11 }, tickLine: false, axisLine: false, allowDecimals: false },
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-zinc-500 text-sm">Platform-wide metrics and trends</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-zinc-500 text-sm">Range:</span>
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 text-xs rounded-xl font-medium transition ${
                range === r
                  ? "bg-violet-600 text-white"
                  : "bg-zinc-900 border border-zinc-700 text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      {/* Row 1: Signups + Scans */}
      <div className="grid lg:grid-cols-2 gap-6">
        <ChartCard title="User Signups" sub={`Last ${range} days`} icon={<TrendingUp size={16} className="text-blue-400" />}>
          {loadSignups ? (
            <div className="h-48 flex items-center justify-center"><Loader2 className="animate-spin text-zinc-600" /></div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={signups} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                {gradientDef("g1", "#3b82f6")}
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="date" {...axisProps.xAxis} tickFormatter={(v) => v.slice(5)} />
                <YAxis {...axisProps.yAxis} />
                <Tooltip {...tooltipStyle} />
                <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} fill="url(#g1)" name="Signups" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="QR Scans" sub={`Last ${range} days`} icon={<Scan size={16} className="text-violet-400" />}>
          {loadScans ? (
            <div className="h-48 flex items-center justify-center"><Loader2 className="animate-spin text-zinc-600" /></div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={scans} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                {gradientDef("g2", "#8b5cf6")}
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="date" {...axisProps.xAxis} tickFormatter={(v) => v.slice(5)} />
                <YAxis {...axisProps.yAxis} />
                <Tooltip {...tooltipStyle} />
                <Area type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={2} fill="url(#g2)" name="Scans" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Row 2: Revenue + Static QR */}
      <div className="grid lg:grid-cols-2 gap-6">
        <ChartCard title="Revenue Trend" sub={`Daily revenue (₹) — last ${range} days`} icon={<DollarSign size={16} className="text-emerald-400" />}>
          {loadRevenue ? (
            <div className="h-48 flex items-center justify-center"><Loader2 className="animate-spin text-zinc-600" /></div>
          ) : revenue.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-zinc-600 text-sm">No revenue data</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={revenue} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                {gradientDef("g3", "#22c55e")}
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="date" {...axisProps.xAxis} tickFormatter={(v) => v.slice(5)} />
                <YAxis {...axisProps.yAxis} tickFormatter={(v) => `₹${v}`} width={55} />
                <Tooltip {...tooltipStyle} formatter={(v) => [`₹${v}`, "Revenue"]} />
                <Area type="monotone" dataKey="amount" stroke="#22c55e" strokeWidth={2} fill="url(#g3)" name="Revenue" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Static QR Popularity" sub={`By type — last ${range} days · ${staticQRData?.data?.total ?? 0} total`} icon={<QrCode size={16} className="text-cyan-400" />}>
          {loadStatic ? (
            <div className="h-48 flex items-center justify-center"><Loader2 className="animate-spin text-zinc-600" /></div>
          ) : staticQR.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-zinc-600 text-sm">No static QR data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={staticQR} layout="vertical" margin={{ top: 5, right: 5, left: 30, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                <XAxis type="number" {...axisProps.xAxis} />
                <YAxis type="category" dataKey="type" {...axisProps.yAxis} width={70} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="count" name="Generations" radius={[0, 4, 4, 0]}>
                  {staticQR.map((entry) => (
                    <Cell key={entry.type} fill={QR_TYPE_COLORS[entry.type] ?? QR_TYPE_COLORS.other} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Row 3: Plan Breakdown */}
      <div className="grid lg:grid-cols-2 gap-6">
        <ChartCard title="Plan Distribution" sub="Active subscriptions by plan" icon={<PieIcon size={16} className="text-amber-400" />}>
          {loadPlan ? (
            <div className="h-48 flex items-center justify-center"><Loader2 className="animate-spin text-zinc-600" /></div>
          ) : plans.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-zinc-600 text-sm">No subscription data</div>
          ) : (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie data={plans} dataKey="count" nameKey="displayName" cx="50%" cy="50%"
                    innerRadius={50} outerRadius={80} paddingAngle={3}>
                    {plans.map((_, i) => (
                      <Cell key={i} fill={PLAN_PIE_COLORS[i % PLAN_PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 10, color: "#f4f4f5" }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {plans.map((p, i) => (
                  <div key={p.planName} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PLAN_PIE_COLORS[i % PLAN_PIE_COLORS.length] }} />
                    <span className="text-zinc-300 text-sm flex-1">{p.displayName}</span>
                    <span className="text-zinc-400 text-sm font-medium tabular-nums">{p.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ChartCard>

        {/* Static QR Breakdown Table */}
        <ChartCard title="Static QR Details" sub="Full breakdown by type" icon={<QrCode size={16} className="text-indigo-400" />}>
          {loadStatic ? (
            <div className="h-48 flex items-center justify-center"><Loader2 className="animate-spin text-zinc-600" /></div>
          ) : (
            <div className="space-y-3 mt-2">
              {staticQR.length === 0 ? (
                <p className="text-zinc-600 text-sm text-center py-8">No data yet — generate some static QRs!</p>
              ) : (
                staticQR.map((row) => {
                  const pct = staticQRData?.data?.total
                    ? Math.round((row.count / staticQRData.data.total) * 100)
                    : 0
                  return (
                    <div key={row.type}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-zinc-300 text-sm capitalize">{row.type}</span>
                        <span className="text-zinc-400 text-sm font-medium tabular-nums">{row.count} ({pct}%)</span>
                      </div>
                      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, background: QR_TYPE_COLORS[row.type] ?? QR_TYPE_COLORS.other }}
                        />
                      </div>
                    </div>
                  )
                })
              )}
              {staticQRData?.data?.total ? (
                <p className="text-zinc-600 text-xs text-right pt-2">
                  {staticQRData.data.total.toLocaleString()} total in last {range} days
                </p>
              ) : null}
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  )
}
