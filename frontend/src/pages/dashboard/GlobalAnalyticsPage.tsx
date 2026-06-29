import { useState, useMemo } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  TrendingUp, TrendingDown, Scan, QrCode, Globe, Smartphone,
  Monitor, Tablet, RefreshCw, Minus, Zap, ArrowUpRight, Activity,
} from "lucide-react"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getGlobalAnalytics } from "@/lib/api"
import type { ScanTimelinePoint, DeviceBreakdown } from "@/lib/api"

// ─── Constants ────────────────────────────────────────────────────────────────

const COUNTRY_FLAGS: Record<string, string> = {
  IN: "🇮🇳", US: "🇺🇸", GB: "🇬🇧", AE: "🇦🇪", SG: "🇸🇬",
  AU: "🇦🇺", CA: "🇨🇦", DE: "🇩🇪", FR: "🇫🇷", JP: "🇯🇵",
  BR: "🇧🇷", MX: "🇲🇽", ZA: "🇿🇦", NG: "🇳🇬", PK: "🇵🇰",
  ID: "🇮🇩", TR: "🇹🇷", SA: "🇸🇦", PH: "🇵🇭", MY: "🇲🇾",
}

const TYPE_EMOJI: Record<string, string> = {
  URL: "🔗", PDF: "📄", VIDEO: "🎬", LINKS: "🔗",
  SOCIAL_MEDIA: "👥", VCARD: "👤", IMAGE_GALLERY: "🖼️",
  BUSINESS: "🏢", APP: "📱", MP3: "🎵", MENU: "🍽️",
  WIFI: "📶", WHATSAPP: "💬", INSTAGRAM: "📸",
  FACEBOOK: "📘", COUPON: "🏷️",
}

const TYPE_LABEL: Record<string, string> = {
  URL: "URL", PDF: "PDF", VIDEO: "Video", LINKS: "Multi-Link",
  SOCIAL_MEDIA: "Social", VCARD: "vCard", IMAGE_GALLERY: "Gallery",
  BUSINESS: "Business", APP: "App", MP3: "Audio", MENU: "Menu",
  WIFI: "WiFi", WHATSAPP: "WhatsApp", INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook", COUPON: "Coupon",
}

const DEVICE_COLORS = ["#7c3aed", "#3b82f6", "#f59e0b"]
const OS_COLORS    = ["#7c3aed", "#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe"]
const BROWSER_COLORS = ["#10b981", "#34d399", "#6ee7b7", "#059669", "#047857", "#065f46"]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string, short = false) {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, short
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "2-digit" })
}

function computeTrend(timeline: ScanTimelinePoint[]) {
  if (timeline.length < 2) return null
  const half   = Math.ceil(timeline.length / 2)
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

// ─── Custom chart tooltip ─────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-zinc-500 dark:text-zinc-400 text-xs mb-1">{label ? fmtDate(label) : ""}</p>
      <p className="text-zinc-900 dark:text-white font-semibold text-sm">{(payload[0]?.value ?? 0).toLocaleString()} scans</p>
    </div>
  )
}

// ─── Donut center label ───────────────────────────────────────────────────────

function DonutLabel({ cx, cy, total }: { cx?: number; cy?: number; total: number }) {
  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
      <tspan x={cx} dy="-0.4em" style={{ fontSize: 22, fontWeight: 700, fill: "white" }}>
        {total.toLocaleString()}
      </tspan>
      <tspan x={cx} dy="1.4em" style={{ fontSize: 11, fill: "#71717a" }}>
        scans
      </tspan>
    </text>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon, trend, accentColor = "violet",
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ReactNode
  trend?: number | null
  accentColor?: "violet" | "emerald" | "blue" | "amber"
}) {
  const accent = {
    violet:  "bg-violet-500/10 text-violet-400",
    emerald: "bg-emerald-500/10 text-emerald-400",
    blue:    "bg-blue-500/10 text-blue-400",
    amber:   "bg-amber-500/10 text-amber-400",
  }[accentColor]

  return (
    <Card className="p-5 hover:ring-1 hover:ring-zinc-700 transition-all">
      <CardContent className="p-0">
        <div className="flex items-start justify-between mb-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${accent}`}>
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
        {sub && <div className="text-zinc-600 text-xs mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  )
}

// ─── Device legend ────────────────────────────────────────────────────────────

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
            <div className="flex items-center gap-1.5 text-zinc-400 w-20 shrink-0 text-sm">
              {icons[d.deviceType.toUpperCase()] ?? <Monitor size={14} />}
              <span className="capitalize">{d.deviceType.toLowerCase()}</span>
            </div>
            <div className="flex-1 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: DEVICE_COLORS[i % DEVICE_COLORS.length] }} />
            </div>
            <span className="text-zinc-400 text-sm font-medium w-9 text-right">{pct}%</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GlobalAnalyticsPage() {
  const navigate = useNavigate()
  const [days, setDays] = useState(30)

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["global-analytics", days],
    queryFn: () => getGlobalAnalytics(days),
    staleTime: 60_000,
  })

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
  const osTotal = analytics?.byOS.reduce((s, o) => s + o.count, 0) || 1
  const browserTotal = analytics?.byBrowser.reduce((s, b) => s + b.count, 0) || 1
  const avgScansPerQR = analytics && analytics.totalQRs > 0
    ? Math.round(analytics.totalScans / analytics.totalQRs) : 0

  const xTickInterval = days <= 7 ? 0 : days <= 30 ? 3 : days <= 90 ? 6 : 29

  // Build OS/Browser data for horizontal bar chart (Recharts BarChart)
  const osChartData = analytics?.byOS.slice(0, 7).map(o => ({
    name: o.os ?? "Unknown",
    count: o.count,
    pct: Math.round((o.count / osTotal) * 100),
  })) ?? []

  const browserChartData = analytics?.byBrowser.slice(0, 7).map(b => ({
    name: b.browser ?? "Unknown",
    count: b.count,
    pct: Math.round((b.count / browserTotal) * 100),
  })) ?? []

  return (
    <div className="space-y-8 animate-fade-in">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <Activity size={22} className="text-violet-400" />
            Analytics Overview
          </h1>
          <p className="text-zinc-500 text-sm mt-1">Aggregate performance across all your QR codes</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void refetch()}
            className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
          </button>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-[130px] h-9 text-xs">
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
        <div className="flex items-center justify-center py-24">
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
          {analytics.totalScans > 0 && (
            <div className="flex flex-wrap gap-3">
              {peak && peak.count > 0 && (
                <div className="flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 rounded-xl px-4 py-2.5">
                  <Zap size={14} className="text-violet-400 shrink-0" />
                  <span className="text-violet-300 text-sm">
                    Peak day: <span className="font-semibold text-violet-900 dark:text-white">{fmtDate(peak.date, true)}</span>
                    <span className="text-violet-400 ml-1">({peak.count.toLocaleString()} scans)</span>
                  </span>
                </div>
              )}
              {trendPct !== null && (
                <div className={`flex items-center gap-2 border rounded-xl px-4 py-2.5 ${
                  trendPct >= 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20"
                }`}>
                  {trendPct >= 0 ? <TrendingUp size={14} className="text-emerald-400 shrink-0" /> : <TrendingDown size={14} className="text-red-400 shrink-0" />}
                  <span className={`text-sm ${trendPct >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                    {trendPct >= 0 ? "Up" : "Down"}{" "}
                    <span className={`font-semibold ${trendPct >= 0 ? "text-emerald-800 dark:text-white" : "text-red-800 dark:text-white"}`}>{Math.abs(trendPct)}%</span>
                    <span className="opacity-70 ml-1">vs prior period</span>
                  </span>
                </div>
              )}
              {analytics.activeQRs > 0 && (
                <div className="flex items-center gap-2 bg-zinc-100/80 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/50 rounded-xl px-4 py-2.5">
                  <QrCode size={14} className="text-zinc-500 dark:text-zinc-400 shrink-0" />
                  <span className="text-zinc-500 dark:text-zinc-400 text-sm">
                    <span className="text-zinc-800 dark:text-zinc-200 font-medium">{analytics.activeQRs}</span> of{" "}
                    <span className="text-zinc-800 dark:text-zinc-200 font-medium">{analytics.totalQRs}</span> QR codes active
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── Stat cards ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Scans"
              value={analytics.totalScans}
              icon={<Scan size={18} />}
              trend={trendPct}
              accentColor="violet"
            />
            <StatCard
              label="Total QR Codes"
              value={analytics.totalQRs}
              sub={`${analytics.activeQRs} currently active`}
              icon={<QrCode size={18} />}
              accentColor="emerald"
            />
            <StatCard
              label="Scans This Month"
              value={analytics.scansThisMonth}
              sub={`${analytics.scansToday.toLocaleString()} today`}
              icon={<Globe size={18} />}
              accentColor="blue"
            />
            <StatCard
              label="Avg. Scans / QR"
              value={avgScansPerQR}
              sub="lifetime average"
              icon={<TrendingUp size={18} />}
              accentColor="amber"
            />
          </div>

          {/* ── Area chart ──────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Global Scan Trend</CardTitle>
                {analytics.totalScans > 0 && (
                  <span className="text-zinc-500 text-xs">
                    {analytics.timeline.filter(p => p.count > 0).length} active days
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {analytics.timeline.some(p => p.count > 0) ? (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={analytics.timeline} margin={{ top: 10, right: 4, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="globalScanGrad" x1="0" y1="0" x2="0" y2="1">
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
                    <ReTooltip
                      content={<ChartTooltip />}
                      cursor={{ stroke: "#7c3aed", strokeWidth: 1, strokeDasharray: "4 2" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="#7c3aed"
                      strokeWidth={2}
                      fill="url(#globalScanGrad)"
                      dot={false}
                      activeDot={{ r: 4, fill: "#7c3aed", stroke: "#1a1a2e", strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-[240px] text-zinc-600">
                  <Scan size={32} className="mb-3 opacity-40" />
                  <p className="text-sm">No scan data yet for this period</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Device donut + Countries ─────────────────────────────────── */}
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

            {/* Top countries */}
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
                                <span className="text-zinc-600 dark:text-zinc-400 text-xs bg-zinc-100 dark:bg-zinc-800 rounded px-1.5 py-0.5">{pct}%</span>
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

          {/* ── OS + Browser (horizontal bar charts) ────────────────────── */}
          <div className="grid lg:grid-cols-2 gap-6">

            <Card>
              <CardHeader><CardTitle className="text-base">Operating Systems</CardTitle></CardHeader>
              <CardContent>
                {osChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={osChartData.length * 38}>
                    <BarChart
                      data={osChartData}
                      layout="vertical"
                      margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={72}
                        tick={{ fill: "#a1a1aa", fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <ReTooltip
                        formatter={(v: any) => [`${Number(v).toLocaleString()} scans`, "Scans"]}
                        contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12 }}
                        itemStyle={{ color: "#fff" }}
                        cursor={{ fill: "rgba(255,255,255,0.03)" }}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={14}>
                        {osChartData.map((_, i) => (
                          <Cell key={i} fill={OS_COLORS[i % OS_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-32 text-zinc-600 text-sm">No OS data yet</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Browsers</CardTitle></CardHeader>
              <CardContent>
                {browserChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={browserChartData.length * 38}>
                    <BarChart
                      data={browserChartData}
                      layout="vertical"
                      margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={72}
                        tick={{ fill: "#a1a1aa", fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <ReTooltip
                        formatter={(v: any) => [`${Number(v).toLocaleString()} scans`, "Scans"]}
                        contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12 }}
                        itemStyle={{ color: "#fff" }}
                        cursor={{ fill: "rgba(255,255,255,0.03)" }}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={14}>
                        {browserChartData.map((_, i) => (
                          <Cell key={i} fill={BROWSER_COLORS[i % BROWSER_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-32 text-zinc-600 text-sm">No browser data yet</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Top Performing QR Codes (leaderboard) ───────────────────── */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Top Performing QR Codes</CardTitle>
                <Link to="/app/dashboard" className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1">
                  View all <ArrowUpRight size={12} />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {analytics.topQRs.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left text-zinc-600 text-xs font-medium px-6 py-2.5 w-8">#</th>
                        <th className="text-left text-zinc-600 text-xs font-medium px-3 py-2.5">QR Code</th>
                        <th className="hidden sm:table-cell text-left text-zinc-600 text-xs font-medium px-3 py-2.5">Type</th>
                        <th className="text-right text-zinc-600 text-xs font-medium px-6 py-2.5">Scans</th>
                        <th className="hidden sm:table-cell text-right text-zinc-600 text-xs font-medium px-6 py-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.topQRs.map((qr, i, arr) => (
                        <tr
                          key={qr.id}
                          onClick={() => navigate(`/app/qr/${qr.id}/analytics`)}
                          className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors cursor-pointer ${i < arr.length - 1 ? "border-b border-zinc-200 dark:border-zinc-800/60" : ""}`}
                        >
                          <td className="px-6 py-3.5 text-zinc-600 text-xs font-mono">{i + 1}</td>
                          <td className="px-3 py-3.5">
                            <div className="flex items-center gap-3">
                              <span className="text-xl">{TYPE_EMOJI[qr.type] ?? "🔲"}</span>
                              <span className="text-zinc-800 dark:text-zinc-200 font-medium truncate max-w-[200px]">{qr.name}</span>
                            </div>
                          </td>
                          <td className="hidden sm:table-cell px-3 py-3.5 text-zinc-500 text-xs">{TYPE_LABEL[qr.type] ?? qr.type}</td>
                          <td className="px-6 py-3.5 text-right">
                            <span className="text-zinc-900 dark:text-white font-semibold">{qr.scanCount.toLocaleString()}</span>
                          </td>
                          <td className="hidden sm:table-cell px-6 py-3.5 text-right">
                            <Badge variant={qr.isActive ? "success" : "secondary"} className="text-[10px]">
                              {qr.isActive ? "live" : "off"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex items-center justify-center py-12 text-zinc-600 text-sm">
                  No QR codes yet
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
