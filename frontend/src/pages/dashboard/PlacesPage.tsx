import { useState } from "react"
import { Link } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { BarChart3, Loader2, MapPin, Pencil, Plus, QrCode, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ApiError, createPlace, deletePlace, getPlaces, updatePlace, type PlaceWithStats } from "@/lib/api"
import { useWorkspace } from "@/hooks/useWorkspace"
import { PlaceForm, mapLink } from "@/components/places/PlaceForm"
import { PlaceModal } from "@/components/places/PlacePicker"

/**
 * Places (backend place.service.ts): where the workspace's codes are printed,
 * with each place's scans. A place is counted through its own code(s) — one
 * printed image can't tell its copies apart — so the page leads with that.
 */

const n = (v: number) => v.toLocaleString("en-US")

export default function PlacesPage() {
  const qc = useQueryClient()
  const { can } = useWorkspace()
  const [days, setDays] = useState(30)
  const [editing, setEditing] = useState<PlaceWithStats | "new" | null>(null)
  const [deleting, setDeleting] = useState<PlaceWithStats | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["places", days],
    queryFn: () => getPlaces(days),
    staleTime: 30_000,
  })
  const places = data?.data ?? []
  const refresh = () => qc.invalidateQueries({ queryKey: ["places"] })

  async function confirmDelete(p: PlaceWithStats) {
    setBusy(true)
    setError(null)
    try {
      await deletePlace(p.id)
      await refresh()
      void qc.invalidateQueries({ queryKey: ["qr-codes"] })
      setDeleting(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete the place.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white">Places</h1>
          <p className="text-zinc-500 text-sm mt-0.5 max-w-2xl">
            The spots where your codes are printed — a store, a metro station, a stand. Give each place its own code
            (pick the place when you create it, or use <span className="text-zinc-700 dark:text-zinc-300">Copy to other places</span> on a code) and see how many scans each place gets.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-[130px] h-9 text-xs" aria-label="Period"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 3 months</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
          {can("qr:create") && (
            <Button size="sm" className="gap-1.5" onClick={() => setEditing("new")}>
              <Plus size={14} /> Add place
            </Button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-violet-500" /></div>
      )}
      {isError && (
        <div className="text-center py-16 text-red-400">
          <p>Failed to load places.</p>
          <button onClick={() => void refetch()} className="mt-2 text-sm underline">Retry</button>
        </div>
      )}

      {!isLoading && !isError && places.length === 0 && (
        <Card>
          <CardContent className="py-14 text-center">
            <MapPin className="mx-auto text-violet-400" size={28} />
            <p className="mt-3 font-semibold text-zinc-900 dark:text-white">No places yet</p>
            <p className="mt-1 text-sm text-zinc-500 max-w-md mx-auto">
              Add the places you print at, then pick one when you create a code. Bulk upload can also set places from a
              <span className="font-mono"> place</span> column.
            </p>
            {can("qr:create") && (
              <Button size="sm" className="mt-5 gap-1.5" onClick={() => setEditing("new")}><Plus size={14} /> Add place</Button>
            )}
          </CardContent>
        </Card>
      )}

      {places.length > 0 && (
        <Card>
          <CardContent className="p-0">
            {/* relative: the header's sr-only label is absolutely positioned and would
                otherwise escape this scroller and widen the page on phones. */}
            <div className="relative overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-600 text-xs">
                    <th className="text-left font-medium px-5 py-2.5">Place</th>
                    <th className="text-right font-medium px-3 py-2.5">Codes</th>
                    <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap">Scans ({days === 365 ? "year" : `${days}d`})</th>
                    <th className="hidden sm:table-cell text-right font-medium px-3 py-2.5">All time</th>
                    <th className="px-5 py-2.5"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {places.map((p) => {
                    const map = mapLink(p)
                    return (
                      <tr key={p.id} className="border-b last:border-0 border-zinc-200 dark:border-zinc-800/60 hover:bg-zinc-100/50 dark:hover:bg-zinc-800/30">
                        <td className="px-5 py-3 min-w-[200px]">
                          <Link to={`/app/analytics?place=${p.id}`} className="font-medium text-zinc-900 dark:text-white hover:text-violet-500">{p.name}</Link>
                          <div className="text-xs text-zinc-500 mt-0.5 flex flex-wrap gap-x-2">
                            {p.code && <span className="font-mono">{p.code}</span>}
                            {[p.address, p.city].filter(Boolean).length > 0 && <span>{[p.address, p.city].filter(Boolean).join(", ")}</span>}
                            {map && <a href={map} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-violet-400 hover:text-violet-300"><MapPin size={11} />Map</a>}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {p.codeCount > 0
                            ? <Link to={`/app/qr-codes?place=${p.id}`} className="text-zinc-700 dark:text-zinc-300 hover:text-violet-500">{n(p.codeCount)}</Link>
                            : <span className="text-zinc-400">0</span>}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums font-semibold text-zinc-900 dark:text-white">{n(p.scansInRange)}</td>
                        <td className="hidden sm:table-cell px-3 py-3 text-right tabular-nums text-zinc-500">{n(p.totalScans)}</td>
                        <td className="px-5 py-3">
                          <div className="flex justify-end gap-1">
                            <Link to={`/app/analytics?place=${p.id}`} title="Analytics" aria-label={`Analytics for ${p.name}`}
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-violet-400 hover:bg-violet-500/10">
                              <BarChart3 size={14} />
                            </Link>
                            <Link to={`/app/qr-codes?place=${p.id}`} title="Codes at this place" aria-label={`Codes at ${p.name}`}
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-violet-400 hover:bg-violet-500/10">
                              <QrCode size={14} />
                            </Link>
                            {can("qr:edit") && (
                              <button type="button" onClick={() => setEditing(p)} title="Edit" aria-label={`Edit ${p.name}`}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-violet-400 hover:bg-violet-500/10">
                                <Pencil size={14} />
                              </button>
                            )}
                            {can("qr:delete") && (
                              <button type="button" onClick={() => { setError(null); setDeleting(p) }} title="Delete" aria-label={`Delete ${p.name}`}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-red-400 hover:bg-red-500/10">
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {editing && (
        <PlaceModal title={editing === "new" ? "Add place" : "Edit place"} onClose={() => setEditing(null)}>
          <PlaceForm
            initial={editing === "new" ? undefined : editing}
            submitLabel={editing === "new" ? "Add place" : "Save"}
            onCancel={() => setEditing(null)}
            onSubmit={async (body) => {
              if (editing === "new") await createPlace(body)
              else await updatePlace(editing.id, body)
              await refresh()
              void qc.invalidateQueries({ queryKey: ["qr-codes"] })
              setEditing(null)
            }}
          />
        </PlaceModal>
      )}

      {deleting && (
        <PlaceModal title="Delete place?" onClose={() => setDeleting(null)}>
          <div className="space-y-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              <span className="font-medium text-zinc-900 dark:text-white">{deleting.name}</span> will be removed.
              {deleting.codeCount > 0 && <> Its {deleting.codeCount === 1 ? "code keeps" : `${n(deleting.codeCount)} codes keep`} working, without a place.</>}
              {deleting.totalScans > 0 && <> Its {n(deleting.totalScans)} scans stay in each code&apos;s analytics but no longer count for any place.</>}
            </p>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDeleting(null)}>Cancel</Button>
              <Button variant="destructive" size="sm" disabled={busy} onClick={() => void confirmDelete(deleting)}>
                {busy && <Loader2 className="animate-spin" />} Delete place
              </Button>
            </div>
          </div>
        </PlaceModal>
      )}
    </div>
  )
}
