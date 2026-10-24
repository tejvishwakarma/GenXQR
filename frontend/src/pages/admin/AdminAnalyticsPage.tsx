import { useState } from "react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts"
import { TrendingUp, Scan, QrCode, DollarSign, PieChart as PieIcon, Loader2, Megaphone, Globe2, MapPin } from "lucide-react"
import {
  fetchAdminSignups, fetchAdminScans, fetchAdminStaticQRStats,
  fetchAdminRevenueTrend, fetchAdminPlanBreakdown, fetchAdminSignupSources,
  fetchAdminUserCountries, fetchAdminSignupsByCountry,
} from "@/lib/api"
import { CountryLabel, countryName, UNKNOWN_COUNTRY } from "@/components/admin/CountryLabel"
import { GeoAttribution } from "@/components/GeoAttribution"

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

/**
 * Sign-ups by country: the five all-time biggest countries in fixed slots, so a
 * country keeps its colour when the range changes, and "Other" as a neutral.
 * Validated on this page's #18181b surface (dataviz validate_palette.js, dark):
 * the five pass every check (worst adjacent CVD ΔE 8.4, normal-vision 19.3, all
 * ≥ 3:1); the grey is separable from all of them (normal-vision ≥ 15.9).
 * "Unknown" is not drawn — a second grey could not be told apart — and is
 * stated in the card instead.
 */
const COUNTRY_SERIES_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"]
const OTHER_COLOR = "#a1a1aa"
/** Magnitude bars in the country table: one hue (the sequential default). */
const COUNTRY_BAR_COLOR = "#3987e5"

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
  const [sourceGroup, setSourceGroup] = useState<"source" | "campaign">("source")
  const [countryScope, setCountryScope] = useState<"range" | "all">("range")

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

  const { data: sourcesData, isLoading: loadSources } = useQuery({
    queryKey: ["admin", "analytics", "signup-sources", range, sourceGroup],
    queryFn: () => fetchAdminSignupSources(range, sourceGroup),
  })

  const { data: countriesData, isLoading: loadCountries } = useQuery({
    queryKey: ["admin", "analytics", "user-countries", countryScope === "all" ? "all" : range],
    queryFn: () => fetchAdminUserCountries(countryScope === "all" ? "all" : range),
  })
  const { data: countryTrendData, isLoading: loadCountryTrend } = useQuery({
    queryKey: ["admin", "analytics", "signups-by-country", range],
    queryFn: () => fetchAdminSignupsByCountry(range),
  })

  // Unknown last: it is a gap in the data, not a place.
  const countryRows = [...(countriesData?.data?.rows ?? [])].sort(
    (a, b) => Number(a.countryCode === UNKNOWN_COUNTRY) - Number(b.countryCode === UNKNOWN_COUNTRY),
  )
  const maxCountryUsers = Math.max(1, ...countryRows.map((r) => r.users))
  const cities = countriesData?.data?.cities ?? []
  const trendCountries = countryTrendData?.data?.countries ?? []
  const countryTrend = countryTrendData?.data?.series ?? []
  const unknownSignups = countryTrend.reduce((n, d) => n + Number(d[UNKNOWN_COUNTRY] ?? 0), 0)
  const trendSeries = [
    ...trendCountries.map((c, i) => ({ key: c.code, label: countryName(c.code, c.name), color: COUNTRY_SERIES_COLORS[i]! })),
    { key: "OTHER", label: "Other", color: OTHER_COLOR },
  ]

  const signups = signupsData?.data ?? []
  const sources = sourcesData?.data?.rows ?? []
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

      {/* Sign-ups by first-touch source */}
      <ChartCard
        title="Sign-ups by Source"
        sub={`First touch — accounts created in the last ${range} days. "Paid" = at least one paid invoice.`}
        icon={<Megaphone size={16} className="text-pink-400" />}
      >
        <div className="flex gap-2 mb-4">
          {(["source", "campaign"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setSourceGroup(g)}
              className={`px-3 py-1.5 text-xs rounded-xl font-medium transition capitalize ${
                sourceGroup === g
                  ? "bg-violet-600 text-white"
                  : "bg-zinc-900 border border-zinc-700 text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              By {g}
            </button>
          ))}
        </div>
        {loadSources ? (
          <div className="h-32 flex items-center justify-center"><Loader2 className="animate-spin text-zinc-600" /></div>
        ) : sources.length === 0 ? (
          <p className="text-zinc-600 text-sm text-center py-8">No sign-ups in this period</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-500 text-xs text-left border-b border-zinc-800">
                  <th className="py-2 pr-4 font-medium capitalize">{sourceGroup}</th>
                  <th className="py-2 px-4 font-medium text-right">Sign-ups</th>
                  <th className="py-2 px-4 font-medium text-right">Paid</th>
                  <th className="py-2 px-4 font-medium text-right">Conversion</th>
                  <th className="py-2 pl-4 font-medium text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((row) => (
                  <tr key={row.key} className="border-b border-zinc-800/60 last:border-0">
                    <td className="py-2 pr-4 text-zinc-300 break-all">{row.key}</td>
                    <td className="py-2 px-4 text-zinc-300 text-right tabular-nums">{row.signups}</td>
                    <td className="py-2 px-4 text-zinc-300 text-right tabular-nums">{row.paidUsers}</td>
                    <td className="py-2 px-4 text-zinc-400 text-right tabular-nums">
                      {Math.round((row.paidUsers / row.signups) * 100)}%
                    </td>
                    <td className="py-2 pl-4 text-zinc-300 text-right tabular-nums">₹{row.revenue.toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>

      {/* Where users come from */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ChartCard
            title="Users by Country"
            sub={`${countryScope === "all" ? "All accounts" : `Accounts created in the last ${range} days`}. Country = where they signed up, else where they last signed in. "Paid" = at least one paid invoice.`}
            icon={<Globe2 size={16} className="text-sky-400" />}
          >
            <div className="flex gap-2 mb-4">
              {([["range", `Last ${range} days`], ["all", "All users"]] as const).map(([scope, label]) => (
                <button
                  key={scope}
                  onClick={() => setCountryScope(scope)}
                  className={`px-3 py-1.5 text-xs rounded-xl font-medium transition ${
                    countryScope === scope
                      ? "bg-violet-600 text-white"
                      : "bg-zinc-900 border border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {loadCountries ? (
              <div className="h-32 flex items-center justify-center"><Loader2 className="animate-spin text-zinc-600" /></div>
            ) : countryRows.length === 0 ? (
              <p className="text-zinc-600 text-sm text-center py-8">No users in this period</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-zinc-500 text-xs text-left border-b border-zinc-800">
                      <th className="py-2 pr-4 font-medium">Country</th>
                      <th className="py-2 px-4 font-medium text-right">Users</th>
                      <th className="py-2 px-4 font-medium text-right">Trialing</th>
                      <th className="py-2 px-4 font-medium text-right">Paid</th>
                      <th className="py-2 px-4 font-medium text-right">Conversion</th>
                      <th className="py-2 pl-4 font-medium text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {countryRows.map((row) => (
                      <tr key={row.countryCode} className="border-b border-zinc-800/60 last:border-0">
                        <td className="py-2 pr-4 whitespace-nowrap">
                          <Link to={`/admin/users?country=${row.countryCode}`} className="hover:underline underline-offset-2" title="See these users">
                            <CountryLabel code={row.countryCode} name={row.country} />
                          </Link>
                        </td>
                        <td className="py-2 px-4">
                          <div className="flex items-center justify-end gap-2">
                            <div className="hidden sm:block w-24 h-1.5 rounded-full bg-zinc-800" aria-hidden="true">
                              <div className="h-1.5 rounded-full" style={{ width: `${(row.users / maxCountryUsers) * 100}%`, background: COUNTRY_BAR_COLOR }} />
                            </div>
                            <span className="text-zinc-300 tabular-nums w-10 text-right">{row.users}</span>
                          </div>
                        </td>
                        <td className="py-2 px-4 text-zinc-300 text-right tabular-nums">{row.trialing}</td>
                        <td className="py-2 px-4 text-zinc-300 text-right tabular-nums">{row.paidUsers}</td>
                        <td className="py-2 px-4 text-zinc-400 text-right tabular-nums">
                          {Math.round((row.paidUsers / row.users) * 100)}%
                        </td>
                        <td className="py-2 pl-4 text-zinc-300 text-right tabular-nums">₹{row.revenue.toLocaleString("en-IN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <GeoAttribution />
          </ChartCard>
        </div>

        <ChartCard
          title="Top Cities"
          sub={countryScope === "all" ? "All accounts" : `Accounts created in the last ${range} days`}
          icon={<MapPin size={16} className="text-sky-400" />}
        >
          {loadCountries ? (
            <div className="h-32 flex items-center justify-center"><Loader2 className="animate-spin text-zinc-600" /></div>
          ) : cities.length === 0 ? (
            <p className="text-zinc-600 text-sm text-center py-8">No located users in this period</p>
          ) : (
            <ol className="space-y-2 text-sm">
              {cities.map((c, i) => (
                <li key={`${c.countryCode}|${c.region}|${c.city}`} className="flex items-baseline gap-3">
                  <span className="text-zinc-600 text-xs tabular-nums w-5 text-right">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-zinc-200">{c.city}</span>
                    <span className="text-zinc-500 text-xs"> · {[c.region, countryName(c.countryCode, c.country)].filter(Boolean).join(", ")}</span>
                  </span>
                  <span className="text-zinc-300 tabular-nums">{c.users}</span>
                </li>
              ))}
            </ol>
          )}
        </ChartCard>
      </div>

      <ChartCard
        title="Sign-ups by Country"
        sub={`Daily — last ${range} days. Your five biggest countries overall; the rest as Other.`}
        icon={<Globe2 size={16} className="text-sky-400" />}
      >
        {loadCountryTrend ? (
          <div className="h-48 flex items-center justify-center"><Loader2 className="animate-spin text-zinc-600" /></div>
        ) : (
          <>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-xs text-zinc-400" aria-label="Legend">
              {trendSeries.map((sr) => (
                <li key={sr.key} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: sr.color }} aria-hidden="true" />
                  {sr.label}
                </li>
              ))}
            </ul>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={countryTrend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="date" {...axisProps.xAxis} tickFormatter={(v) => String(v).slice(5)} minTickGap={16} />
                <YAxis {...axisProps.yAxis} />
                <Tooltip {...tooltipStyle} cursor={{ fill: "#27272a" }} />
                {trendSeries.map((sr) => (
                  // The surface-coloured stroke is the 2px gap between stacked segments.
                  <Bar key={sr.key} dataKey={sr.key} name={sr.label} stackId="countries" fill={sr.color} stroke="#18181b" strokeWidth={1} maxBarSize={28} />
                ))}
              </BarChart>
            </ResponsiveContainer>
            <p className="mt-2 text-[11px] text-zinc-500">
              {unknownSignups > 0
                ? `${unknownSignups} sign-up${unknownSignups === 1 ? "" : "s"} in this period had no known location and ${unknownSignups === 1 ? "is" : "are"} not shown.`
                : "Every sign-up in this period has a known location."}
            </p>
            <GeoAttribution />
          </>
        )}
      </ChartCard>

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
