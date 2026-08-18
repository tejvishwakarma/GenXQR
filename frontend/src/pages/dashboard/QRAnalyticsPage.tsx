import { useState, useMemo } from "react"
import { Link, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowLeft, TrendingUp, TrendingDown, Scan, Globe, Smartphone,
  Monitor, Tablet, RefreshCw, Download, Minus, Zap, Clock,
} from "lucide-react"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getQRAnalytics, getQR, downloadScanCSV } from "@/lib/api"
import type { ScanTimelinePoint, DeviceBreakdown } from "@/lib/api"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string, short = false) {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, short
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "2-digit" })
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const COUNTRY_FLAGS: Record<string, string> = {
  IN: "🇮🇳", US: "🇺🇸", GB: "🇬🇧", AE: "🇦🇪", SG: "🇸🇬",
  AU: "🇦🇺", CA: "🇨🇦", DE: "🇩🇪", FR: "🇫🇷", JP: "🇯🇵",
  BR: "🇧🇷", MX: "🇲🇽", ZA: "🇿🇦", NG: "🇳🇬", PK: "🇵🇰",
  ID: "🇮🇩", TR: "🇹🇷", SA: "🇸🇦", PH: "🇵🇭", MY: "🇲🇾",
}

const DEVICE_COLORS = ["#7c3aed", "#3b82f6", "#f59e0b"]
const OS_COLORS = ["#7c3aed", "#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe"]
const BROWSER_COLORS = ["#10b981", "#34d399", "#6ee7b7", "#059669", "#047857", "#065f46"]

// ─── Trend indicator helpers ──────────────────────────────────────────────────

function computeTrend(timeline: ScanTimelinePoint[]) {
  if (timeline.length < 2) return null
  const half = Math.ceil(timeline.length / 2)
  const recent = timeline.slice(-half).reduce((s, p) => s + p.count, 0)
  const prior  = timeline.slice(0, half).reduce((s, p) => s + p.count, 0)
  if (prior === 0) return recent > 0 ? 100 : null
  return Math.round(((recent - prior) / prior) * 100)
}

function peakDay(timeline: ScanTimelinePoint[]) {
  return timeline.reduce(
    (best, pt) => (pt.count > best.count ? pt : best),
    { date: "", count: 0 },
  )
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-zinc-600 dark:text-zinc-400 text-xs mb-1">{label ? fmtDate(label) : ""}</p>
      <p className="text-zinc-900 dark:text-white font-semibold text-sm">{(payload[0]?.value ?? 0).toLocaleString()} scans</p>
    </div>
  )
}

// ─── Donut center label ───────────────────────────────────────────────────────

function DonutLabel({ cx, cy, total }: { cx?: number; cy?: number; total: number }) {
  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
      <tspan x={cx} dy="-0.4em" className="fill-white text-lg font-bold" style={{ fontSize: 22, fontWeight: 700, fill: "white" }}>
        {total.toLocaleString()}
      </tspan>
      <tspan x={cx} dy="1.4em" style={{ fontSize: 11, fill: "#71717a" }}>
        total
      </tspan>
    </text>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon, trend, highlight,
}: {
  label: string
  value: string | number
  /** Secondary line, e.g. the unique-device count beneath a total. */
  sub?: string
  icon: React.ReactNode
  trend?: number | null
  highlight?: boolean
}) {
  return (
    <Card className={`p-5 ${highlight ? "ring-1 ring-violet-500/40" : ""}`}>
      <CardContent className="p-0">
        <div className="flex items-start justify-between mb-4">
          <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
            {icon}
          </div>
          {trend !== undefined && trend !== null && (
            <div className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
              trend > 0 ? "text-emerald-400 bg-emerald-500/10" :
              trend < 0 ? "text-red-400 bg-red-500/10" :
              "text-zinc-500 bg-zinc-100 dark:bg-zinc-800"
            }`}>
              {trend > 0 ? <TrendingUp size={11} /> : trend < 0 ? <TrendingDown size={11} /> : <Minus size={11} />}
              {trend !== 0 ? `${Math.abs(trend)}%` : "flat"}
            </div>
          )}
        </div>
        <div className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">
          {typeof value === "number" ? value.toLocaleString() : value}
        </div>
        <div className="text-zinc-500 text-xs mt-1">{label}</div>
        {sub && <div className="text-zinc-400 dark:text-zinc-500 text-[11px] mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  )
}

// ─── Device legend item ───────────────────────────────────────────────────────

function DeviceLegend({ data, total }: { data: DeviceBreakdown[]; total: number }) {
  const icons: Record<string, React.ReactNode> = {
    MOBILE:  <Smartphone size={14} />,
    TABLET:  <Tablet size={14} />,
    DESKTOP: <Monitor size={14} />,
    UNKNOWN: <Monitor size={14} />,
  }
  return (
    <div className="space-y-3 mt-4">
      {data.map((d, i) => {
        const pct = total > 0 ? Math.round((d.count / total) * 100) : 0
        return (
          <div key={d.deviceType} className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ background: DEVICE_COLORS[i % DEVICE_COLORS.length] }} />
            <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400 w-20 shrink-0 text-sm">
              {icons[d.deviceType.toUpperCase()] ?? <Monitor size={14} />}
              <span className="capitalize">{d.deviceType.toLowerCase()}</span>
            </div>
            <div className="flex-1 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: DEVICE_COLORS[i % DEVICE_COLORS.length] }} />
            </div>
            <span className="text-zinc-600 dark:text-zinc-400 text-sm font-medium w-9 text-right">{pct}%</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function QRAnalyticsPage() {
  const { id } = useParams<{ id: string }>()
  const [days, setDays] = useState(30)
  const [csvLoading, setCsvLoading] = useState(false)

  const { data: qrData } = useQuery({
    queryKey: ["qr", id],
    queryFn: () => getQR(id!),
    enabled: !!id,
  })

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["analytics", id, days],
    queryFn: () => getQRAnalytics(id!, days),
    enabled: !!id,
    staleTime: 60_000,
  })

  const qr = qrData?.data
  const analytics = data?.data

  const trendPct = useMemo(
    () => analytics ? computeTrend(analytics.timeline) : null,
    [analytics],
  )

  const peak = useMemo(
    () => analytics ? peakDay(analytics.timeline) : null,
    [analytics],
  )

  const deviceTotal = analytics?.byDevice.reduce((s, d) => s + d.count, 0) ?? 0
  const countryTotal = analytics?.byCountry.reduce((s, c) => s + c.count, 0) || 1
  const cityTotal = analytics?.byCity.reduce((s, c) => s + c.count, 0) || 1
  const osTotal = analytics?.byOS.reduce((s, o) => s + o.count, 0) || 1
  const browserTotal = analytics?.byBrowser.reduce((s, b) => s + b.count, 0) || 1

  // X-axis tick density: don't crowd ticks when showing 90/365 days
  const xTickInterval = days <= 7 ? 0 : days <= 30 ? 3 : days <= 90 ? 6 : 29

  async function handleCSVDownload() {
    if (!id || !qr) return
    setCsvLoading(true)
    try { await downloadScanCSV(id, qr.name) } catch { /* fail gracefully */ }
    finally { setCsvLoading(false) }
  }

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <Link to="/app/dashboard">
            <button className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
              <ArrowLeft size={16} />
            </button>
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-zinc-900 dark:text-white">{qr?.name ?? "QR Analytics"}</h1>
              {qr && (
                <Badge variant={qr.isActive ? "success" : "secondary"}>
                  {qr.isActive ? "Active" : "Inactive"}
                </Badge>
              )}
            </div>
            <p className="text-zinc-500 text-sm mt-0.5">Performance analytics · Last {days} days</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleCSVDownload()}
            disabled={csvLoading || !analytics}
            title="Export CSV"
            className="h-8 px-3 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white text-xs transition-colors disabled:opacity-40"
          >
            <Download size={13} className={csvLoading ? "animate-pulse" : ""} />
            Export
          </button>
          <button
            onClick={() => void refetch()}
            className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
          </button>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-[130px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 3 months</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Loading ─────────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
        </div>
      )}

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {isError && !isLoading && (
        <div className="text-center py-16 text-red-400">
          <p>Failed to load analytics.</p>
          <button onClick={() => void refetch()} className="mt-2 text-sm underline">Retry</button>
        </div>
      )}

      {analytics && (
        <>
          {/* ── Insight strip ───────────────────────────────────────────── */}
          {peak && peak.count > 0 && (
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 rounded-xl px-4 py-2.5">
                <Zap size={14} className="text-violet-400 shrink-0" />
                <span className="text-violet-300 text-sm">
                  Peak day: <span className="font-semibold text-zinc-900 dark:text-white">{fmtDate(peak.date, true)}</span>
                  <span className="text-violet-400 ml-1">({peak.count.toLocaleString()} scans)</span>
                </span>
              </div>
              {trendPct !== null && (
                <div className={`flex items-center gap-2 border rounded-xl px-4 py-2.5 ${
                  trendPct >= 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20"
                }`}>
                  {trendPct >= 0 ? <TrendingUp size={14} className="text-emerald-400 shrink-0" /> : <TrendingDown size={14} className="text-red-400 shrink-0" />}
                  <span className={`text-sm ${trendPct >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                    {trendPct >= 0 ? "Up" : "Down"}{" "}
                    <span className="font-semibold text-zinc-900 dark:text-white">{Math.abs(trendPct)}%</span>
                    <span className="opacity-70 ml-1">vs prior period</span>
                  </span>
                </div>
              )}
              {analytics.recentScans[0] && (
                <div className="flex items-center gap-2 bg-zinc-100/50 dark:bg-zinc-800/60 border border-zinc-300 dark:border-zinc-700/50 rounded-xl px-4 py-2.5">
                  <Clock size={14} className="text-zinc-600 dark:text-zinc-400 shrink-0" />
                  <span className="text-zinc-600 dark:text-zinc-400 text-sm">
                    Last scan: <span className="text-zinc-800 dark:text-zinc-200">{timeAgo(analytics.recentScans[0].scannedAt)}</span>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── Stat cards ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              label="Total Scans"
              value={analytics.totalScans}
              sub={`${analytics.uniqueScans.toLocaleString()} unique ${analytics.uniqueScans === 1 ? "device" : "devices"}`}
              icon={<Scan size={18} className="text-violet-400" />}
              trend={trendPct}
              highlight
            />
            <StatCard label="Today"        value={analytics.scansToday}     icon={<TrendingUp size={18} className="text-emerald-400" />} />
            <StatCard label="This Week"    value={analytics.scansThisWeek}  icon={<Globe size={18} className="text-blue-400" />} />
            <StatCard label="This Month"   value={analytics.scansThisMonth} icon={<Smartphone size={18} className="text-amber-400" />} />
          </div>

          {/* ── Area chart ──────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Scan Trend</CardTitle>
                {analytics.totalScans > 0 && (
                  <span className="text-zinc-500 text-xs">
                    {analytics.timeline.filter(p => p.count > 0).length} active days
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {analytics.timeline.some(p => p.count > 0) ? (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={analytics.timeline} margin={{ top: 10, right: 4, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="qrScanGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#7c3aed" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#71717a", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      interval={xTickInterval}
                      tickFormatter={(v: string) => fmtDate(v, true)}
                    />
                    <YAxis
                      tick={{ fill: "#71717a", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <ReTooltip content={<ChartTooltip />} cursor={{ stroke: "#7c3aed", strokeWidth: 1, strokeDasharray: "4 2" }} />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="#7c3aed"
                      strokeWidth={2}
                      fill="url(#qrScanGrad)"
                      dot={false}
                      activeDot={{ r: 4, fill: "#7c3aed", stroke: "#1a1a2e", strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-[220px] text-zinc-600">
                  <Scan size={32} className="mb-3 opacity-40" />
                  <p className="text-sm">No scan data yet for this period</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Devices + Countries ─────────────────────────────────────── */}
          <div className="grid lg:grid-cols-2 gap-6">

            {/* Device donut */}
            <Card>
              <CardHeader><CardTitle className="text-base">Device Breakdown</CardTitle></CardHeader>
              <CardContent>
                {analytics.byDevice.length > 0 && deviceTotal > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={analytics.byDevice}
                          cx="50%"
                          cy="50%"
                          innerRadius={62}
                          outerRadius={90}
                          paddingAngle={3}
                          dataKey="count"
                          nameKey="deviceType"
                          startAngle={90}
                          endAngle={-270}
                        >
                          {analytics.byDevice.map((_, i) => (
                            <Cell key={i} fill={DEVICE_COLORS[i % DEVICE_COLORS.length]} stroke="transparent" />
                          ))}
                        </Pie>
                        <DonutLabel cx={undefined} cy={undefined} total={deviceTotal} />
                        <ReTooltip
                          formatter={(v: any, name: any) => [
                            `${Number(v).toLocaleString()} scans (${Math.round(((v as number) / deviceTotal) * 100)}%)`,
                            name,
                          ]}
                          contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12 }}
                          labelStyle={{ color: "#a1a1aa" }}
                          itemStyle={{ color: "#fff" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <DeviceLegend data={analytics.byDevice} total={deviceTotal} />
                  </>
                ) : (
                  <div className="flex items-center justify-center h-48 text-zinc-600 text-sm">No device data yet</div>
                )}
              </CardContent>
            </Card>

            {/* Countries */}
            <Card>
              <CardHeader><CardTitle className="text-base">Top Countries</CardTitle></CardHeader>
              <CardContent>
                {analytics.byCountry.length > 0 ? (
                  <div className="space-y-3">
                    {analytics.byCountry.slice(0, 8).map((c, i) => {
                      const pct = Math.round((c.count / countryTotal) * 100)
                      const flag = c.countryCode ? (COUNTRY_FLAGS[c.countryCode] ?? "🌐") : "🌐"
                      return (
                        <div key={c.country} className="flex items-center gap-3">
                          <span className="text-zinc-600 text-xs font-mono w-4 shrink-0 text-right">{i + 1}</span>
                          <span className="text-lg w-6 text-center shrink-0">{flag}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-zinc-800 dark:text-zinc-200 text-sm truncate">{c.country}</span>
                              <div className="flex items-center gap-2 shrink-0 ml-2">
                                <span className="text-zinc-500 text-xs">{c.count.toLocaleString()}</span>
                                <span className="text-zinc-700 dark:text-zinc-700 text-xs bg-zinc-200 dark:bg-zinc-800 rounded px-1.5 py-0.5">{pct}%</span>
                              </div>
                            </div>
                            <div className="h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${pct}%`, background: i === 0 ? "#7c3aed" : i === 1 ? "#6366f1" : "#4f46e5" }}
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-48 text-zinc-600 text-sm">No geo data yet</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top Locations (city / region) */}
          <Card>
            <CardHeader><CardTitle className="text-base">Top Locations</CardTitle></CardHeader>
            <CardContent>
              {analytics.byCity.length > 0 ? (
                <div className="space-y-3">
                  {analytics.byCity.slice(0, 10).map((c, i) => {
                    const pct = Math.round((c.count / cityTotal) * 100)
                    const flag = c.countryCode ? (COUNTRY_FLAGS[c.countryCode] ?? "🌐") : "🌐"
                    const place = [c.city, c.region].filter(Boolean).join(", ")
                    return (
                      <div key={`${c.city}-${c.region}-${c.countryCode}-${i}`} className="flex items-center gap-3">
                        <span className="text-zinc-600 text-xs font-mono w-4 shrink-0 text-right">{i + 1}</span>
                        <span className="text-lg w-6 text-center shrink-0">{flag}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-zinc-800 dark:text-zinc-200 text-sm truncate">
                              {place || "Unknown"}
                              {c.country && <span className="text-zinc-500 dark:text-zinc-600 text-xs ml-1">{c.country}</span>}
                            </span>
                            <div className="flex items-center gap-2 shrink-0 ml-2">
                              <span className="text-zinc-500 text-xs">{c.count.toLocaleString()}</span>
                              <span className="text-zinc-700 dark:text-zinc-700 text-xs bg-zinc-200 dark:bg-zinc-800 rounded px-1.5 py-0.5">{pct}%</span>
                            </div>
                          </div>
                          <div className="h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, background: i === 0 ? "#7c3aed" : i === 1 ? "#6366f1" : "#4f46e5" }}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-center h-32 text-zinc-600 text-sm">No city-level data yet</div>
              )}
            </CardContent>
          </Card>

          {/* ── OS + Browser ────────────────────────────────────────────── */}
          <div className="grid lg:grid-cols-2 gap-6">

            <Card>
              <CardHeader><CardTitle className="text-base">Operating Systems</CardTitle></CardHeader>
              <CardContent>
                {analytics.byOS.length > 0 ? (
                  <div className="space-y-3">
                    {analytics.byOS.slice(0, 7).map((os, i) => {
                      const pct = Math.round((os.count / osTotal) * 100)
                      return (
                        <div key={os.os} className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: OS_COLORS[i % OS_COLORS.length] }} />
                          <span className="text-zinc-700 dark:text-zinc-300 text-sm w-24 truncate shrink-0">{os.os ?? "Unknown"}</span>
                          <div className="flex-1 h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${pct}%`, background: OS_COLORS[i % OS_COLORS.length] }}
                            />
                          </div>
                          <span className="text-zinc-500 text-xs w-9 text-right shrink-0">{os.count.toLocaleString()}</span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-32 text-zinc-600 text-sm">No OS data yet</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Browsers</CardTitle></CardHeader>
              <CardContent>
                {analytics.byBrowser.length > 0 ? (
                  <div className="space-y-3">
                    {analytics.byBrowser.slice(0, 7).map((br, i) => {
                      const pct = Math.round((br.count / browserTotal) * 100)
                      return (
                        <div key={br.browser} className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: BROWSER_COLORS[i % BROWSER_COLORS.length] }} />
                          <span className="text-zinc-700 dark:text-zinc-300 text-sm w-24 truncate shrink-0">{br.browser ?? "Unknown"}</span>
                          <div className="flex-1 h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${pct}%`, background: BROWSER_COLORS[i % BROWSER_COLORS.length] }}
                            />
                          </div>
                          <span className="text-zinc-500 text-xs w-9 text-right shrink-0">{br.count.toLocaleString()}</span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-32 text-zinc-600 text-sm">No browser data yet</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Recent Scans ─────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Recent Scans</CardTitle>
                <span className="text-zinc-600 text-xs">{analytics.recentScans.length} shown</span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {analytics.recentScans.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800">
                        <th className="text-left text-zinc-600 text-xs font-medium px-6 py-2.5">Location</th>
                        <th className="text-left text-zinc-600 text-xs font-medium px-3 py-2.5">Device</th>
                        <th className="hidden md:table-cell text-left text-zinc-600 text-xs font-medium px-3 py-2.5">OS</th>
                        <th className="hidden md:table-cell text-left text-zinc-600 text-xs font-medium px-3 py-2.5">Browser</th>
                        <th className="text-right text-zinc-600 text-xs font-medium px-6 py-2.5">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.recentScans.slice(0, 10).map((scan, i, arr) => (
                        <tr
                          key={scan.id}
                          className={`hover:bg-zinc-100/50 dark:hover:bg-zinc-800/40 transition-colors ${i < arr.length - 1 ? "border-b border-zinc-200 dark:border-zinc-800/60" : ""}`}
                        >
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-base">
                                {scan.countryCode ? (COUNTRY_FLAGS[scan.countryCode] ?? "🌐") : "🌐"}
                              </span>
                              <div className="min-w-0">
                                {(() => {
                                  const place = [scan.city, scan.region, scan.country].filter(Boolean)
                                  const primary = place[0] ?? "Unknown"
                                  const secondary = place.slice(1).join(", ")
                                  return (
                                    <>
                                      <span className="text-zinc-800 dark:text-zinc-200">{primary}</span>
                                      {secondary && <span className="text-zinc-500 dark:text-zinc-600 text-xs ml-1">{secondary}</span>}
                                    </>
                                  )
                                })()}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1.5 text-zinc-400">
                              {scan.deviceType === "MOBILE" ? <Smartphone size={13} className="text-violet-400" /> :
                               scan.deviceType === "TABLET" ? <Tablet size={13} className="text-amber-400" /> :
                               <Monitor size={13} className="text-blue-400" />}
                              <span className="capitalize text-xs">{scan.deviceType?.toLowerCase() ?? "—"}</span>
                            </div>
                          </td>
                          <td className="hidden md:table-cell px-3 py-3 text-zinc-400 text-xs">{scan.os ?? "—"}</td>
                          <td className="hidden md:table-cell px-3 py-3 text-zinc-400 text-xs">{scan.browser ?? "—"}</td>
                          <td className="px-6 py-3 text-right text-zinc-600 text-xs whitespace-nowrap">{timeAgo(scan.scannedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex items-center justify-center py-12 text-zinc-600 text-sm">No scans yet</div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
