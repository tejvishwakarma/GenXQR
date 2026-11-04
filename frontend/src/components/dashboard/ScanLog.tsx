import { useState } from "react"
import { useQuery, keepPreviousData } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight, Loader2, MapPin, Monitor, Smartphone, Tablet } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getScanLog } from "@/lib/api"

/**
 * Every scan of one code with its exact date and time, in the viewer's own
 * timezone, page by page and optionally between two dates (backend
 * analytics.service listScans). The page used to show the last 10 scans as
 * "3h ago" only.
 */

const PAGE_SIZE = 25
const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

const fmtDate = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })
const fmtTime = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" })

/** "YYYY-MM-DD" from a date input → that local midnight as an ISO instant. */
function localDayStart(day: string, addDays = 0): string {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(y!, m! - 1, d! + addDays).toISOString()
}

function DeviceIcon({ type }: { type: string }) {
  if (type === "MOBILE") return <Smartphone size={13} className="text-violet-400" />
  if (type === "TABLET") return <Tablet size={13} className="text-amber-400" />
  return <Monitor size={13} className="text-blue-400" />
}

export function ScanLog({ qrId }: { qrId: string }) {
  const [page, setPage] = useState(1)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const badRange = !!from && !!to && from > to

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ["scan-log", qrId, page, from, to],
    queryFn: () => getScanLog(qrId, {
      page,
      limit: PAGE_SIZE,
      from: from ? localDayStart(from) : undefined,
      // Inclusive of the whole "to" day: up to the next local midnight.
      to: to ? localDayStart(to, 1) : undefined,
    }),
    enabled: !badRange,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
  const scans = data?.data ?? []
  const pg = data?.pagination
  const showPlace = scans.some((s) => s.placeName)

  const setRange = (f: string, t: string) => {
    setFrom(f)
    setTo(t)
    setPage(1)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <CardTitle className="text-base">Scan Log</CardTitle>
            <p className="text-zinc-500 text-xs mt-1">
              Every scan with its date and time · times in your timezone ({TIME_ZONE})
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2 text-xs">
            <label className="flex flex-col gap-1 text-zinc-500">
              From
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setRange(e.target.value, to)}
                className="h-8 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 text-zinc-900 dark:text-white"
              />
            </label>
            <label className="flex flex-col gap-1 text-zinc-500">
              To
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setRange(from, e.target.value)}
                className="h-8 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 text-zinc-900 dark:text-white"
              />
            </label>
            {(from || to) && (
              <button type="button" onClick={() => setRange("", "")} className="h-8 px-2 text-violet-400 hover:text-violet-300">
                Clear
              </button>
            )}
          </div>
        </div>
        {badRange && <p className="text-red-400 text-xs mt-2">“From” must be on or before “To”.</p>}
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-violet-500" size={20} /></div>
        ) : isError ? (
          <div className="py-12 text-center text-red-400 text-sm">Couldn&apos;t load the scans.</div>
        ) : scans.length === 0 ? (
          <div className="py-12 text-center text-zinc-600 text-sm">{from || to ? "No scans between these dates." : "No scans yet"}</div>
        ) : (
          <div className={`overflow-x-auto transition-opacity ${isFetching ? "opacity-60" : ""}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-600 text-xs">
                  <th className="text-left font-medium px-6 py-2.5">Date &amp; time</th>
                  <th className="text-left font-medium px-3 py-2.5">Location</th>
                  {showPlace && <th className="hidden lg:table-cell text-left font-medium px-3 py-2.5">Place</th>}
                  <th className="text-left font-medium px-3 py-2.5">Device</th>
                  <th className="hidden md:table-cell text-left font-medium px-3 py-2.5">OS</th>
                  <th className="hidden md:table-cell text-left font-medium px-6 py-2.5">Browser</th>
                </tr>
              </thead>
              <tbody>
                {scans.map((s) => {
                  const at = new Date(s.scannedAt)
                  const where = [s.city, s.region, s.country].filter(Boolean)
                  return (
                    <tr key={s.id} className="border-b last:border-0 border-zinc-200 dark:border-zinc-800/60 hover:bg-zinc-100/50 dark:hover:bg-zinc-800/40">
                      <td className="px-6 py-3 whitespace-nowrap">
                        <time dateTime={s.scannedAt} title={at.toString()}>
                          <span className="block text-zinc-800 dark:text-zinc-200">{fmtDate.format(at)}</span>
                          <span className="block text-zinc-500 text-xs tabular-nums">
                            {fmtTime.format(at)}
                            {!s.isUnique && <span className="ml-1.5 text-zinc-400" title="Same phone scanned this code within 4 hours">· repeat</span>}
                          </span>
                        </time>
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-zinc-800 dark:text-zinc-200">{where[0] ?? "Unknown"}</span>
                        {where.length > 1 && <span className="block text-zinc-500 text-xs">{where.slice(1).join(", ")}</span>}
                      </td>
                      {showPlace && (
                        <td className="hidden lg:table-cell px-3 py-3 text-xs text-zinc-600 dark:text-zinc-400">
                          {s.placeName && <span className="inline-flex items-center gap-1"><MapPin size={11} className="text-violet-400" />{s.placeName}</span>}
                        </td>
                      )}
                      <td className="px-3 py-3">
                        <span className="flex items-center gap-1.5 text-zinc-400 text-xs capitalize">
                          <DeviceIcon type={s.deviceType} />{s.deviceType?.toLowerCase() ?? "—"}
                        </span>
                      </td>
                      <td className="hidden md:table-cell px-3 py-3 text-zinc-400 text-xs">{s.os ?? "—"}</td>
                      <td className="hidden md:table-cell px-6 py-3 text-zinc-400 text-xs">{s.browser ?? "—"}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {pg && pg.total > 0 && (
          <div className="flex items-center justify-between gap-3 px-6 py-3 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500">
            <span>
              {((pg.page - 1) * pg.limit + 1).toLocaleString()}–{Math.min(pg.page * pg.limit, pg.total).toLocaleString()} of {pg.total.toLocaleString()} scans
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label="Newer scans"
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="tabular-nums px-1">Page {pg.page} of {pg.totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pg.totalPages, p + 1))}
                disabled={page >= pg.totalPages}
                aria-label="Older scans"
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
