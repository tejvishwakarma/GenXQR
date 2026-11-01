import { useState } from "react"
import { useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Helmet } from "react-helmet-async"
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"
import { Loader2, Printer } from "lucide-react"
import { ApiError, getClientReport } from "@/lib/api"
import { cn } from "@/lib/utils"

/**
 * An agency's share report for one client (/l/report/<token>, backend
 * agency.service.ts getClientReport). Carries the AGENCY's brand and never
 * GenXQR's: no GenXQR name, logo, analytics or Clarity (lib/site.ts
 * isWhiteLabelPage). Light, print-friendly — "Save as PDF" is the browser's.
 */

const PERIODS = [7, 30, 90] as const
const n = (v: number) => v.toLocaleString("en-US")
const fmtDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-900 tabular-nums">{value}</p>
    </div>
  )
}

function Ranked({ title, rows, empty }: { title: string; rows: Array<{ label: string; scans: number }>; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.scans))
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 break-inside-avoid">
      <h2 className="text-sm font-semibold text-zinc-900 mb-3">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.label} className="text-sm">
              <div className="flex justify-between gap-3">
                <span className="truncate text-zinc-700">{r.label}</span>
                <span className="tabular-nums text-zinc-900">{n(r.scans)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-zinc-100">
                <div className="h-full rounded-full bg-zinc-800" style={{ width: `${Math.round((r.scans / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function ClientReportPage() {
  const { token = "" } = useParams()
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30)
  const { data, isLoading, error } = useQuery({
    queryKey: ["client-report", token, days],
    queryFn: () => getClientReport(token, days),
    retry: false,
  })
  const r = data?.data

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 print:bg-white">
      <Helmet>
        <title>{r ? `${r.client.name} — QR code report` : "QR code report"}</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="referrer" content="no-referrer" />
      </Helmet>

      <div className="mx-auto max-w-4xl px-4 py-8 sm:py-12 space-y-6">
        {isLoading && <div className="flex items-center justify-center py-24 text-zinc-500"><Loader2 className="animate-spin mr-2" size={18} /> Loading report…</div>}

        {error && (
          <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center">
            <p className="font-semibold">This report isn&apos;t available</p>
            <p className="mt-1 text-sm text-zinc-500">
              {error instanceof ApiError && error.status === 404 ? "The link may have been turned off or replaced. Ask for a new one." : "Please try again in a moment."}
            </p>
          </div>
        )}

        {r && (
          <>
            <header className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {r.agency.logoUrl && <img src={r.agency.logoUrl} alt={r.agency.name} className="h-10 max-w-[160px] object-contain" />}
                <div>
                  <p className="text-xs uppercase tracking-wider text-zinc-500">Prepared by</p>
                  <p className="font-semibold">{r.agency.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 print:hidden">
                <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5" role="group" aria-label="Period">
                  {PERIODS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setDays(p)}
                      aria-pressed={days === p}
                      className={cn("px-3 py-1 text-sm rounded-md", days === p ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900")}
                    >
                      {p} days
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100">
                  <Printer size={14} /> Save as PDF
                </button>
              </div>
            </header>

            <div className="flex items-center gap-3 border-t border-zinc-200 pt-6">
              {r.client.logoUrl && <img src={r.client.logoUrl} alt="" className="h-9 max-w-[120px] object-contain" />}
              <div>
                <h1 className="text-xl sm:text-2xl font-bold">{r.client.name}</h1>
                <p className="text-sm text-zinc-500">QR code performance · last {r.days} days · as of {new Date(r.generatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label={`Scans (${r.days} days)`} value={n(r.totals.scans)} />
              <Stat label="Unique visitors (all time)" value={n(r.totals.uniqueScans)} />
              <Stat label="QR codes" value={n(r.totals.codes)} />
              <Stat label="Active codes" value={n(r.totals.activeCodes)} />
            </div>

            <section className="rounded-xl border border-zinc-200 bg-white p-4 break-inside-avoid">
              <h2 className="text-sm font-semibold mb-3">Scans per day</h2>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={r.timeline} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtDay} minTickGap={24} />
                    <YAxis tick={{ fill: "#71717a", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip
                      formatter={(v) => [n(Number(v ?? 0)), "Scans"]}
                      labelFormatter={(l) => fmtDay(String(l))}
                      contentStyle={{ borderRadius: 8, border: "1px solid #e4e4e7", fontSize: 12 }}
                    />
                    <Area type="monotone" dataKey="scans" stroke="#18181b" strokeWidth={2} fill="#18181b" fillOpacity={0.08} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            <div className="grid gap-4 sm:grid-cols-2">
              <Ranked title="Top QR codes (all time)" rows={r.topCodes.map((c) => ({ label: c.name, scans: c.scans }))} empty="No scans yet." />
              <Ranked title={`Countries (last ${r.days} days)`} rows={r.countries.map((c) => ({ label: c.country || "Unknown", scans: c.scans }))} empty="No location data yet." />
              <Ranked title={`Devices (last ${r.days} days)`} rows={r.devices.map((d) => ({ label: d.device.charAt(0) + d.device.slice(1).toLowerCase(), scans: d.scans }))} empty="No device data yet." />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
