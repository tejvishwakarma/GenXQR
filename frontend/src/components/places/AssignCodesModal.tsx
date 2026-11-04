import { useEffect, useState } from "react"
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ApiError, listQRs, setPlaceCodes, type Place } from "@/lib/api"
import { PlaceModal } from "./PlacePicker"

/**
 * "Assign codes" on the Places page: tick the workspace's existing codes that
 * are printed at this place (backend place.service setPlaceCodes). A code has
 * one place, so ticking one that is somewhere else moves it here.
 */

const PAGE_SIZE = 50

export function AssignCodesModal({ place, onClose }: { place: Pick<Place, "id" | "name">; onClose: () => void }) {
  const qc = useQueryClient()
  const [typed, setTyped] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  // Codes whose box was changed: id → { checked now, was at this place before }.
  const [changes, setChanges] = useState<Map<string, { checked: boolean; wasHere: boolean }>>(new Map())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => { setSearch(typed.trim()); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [typed])

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ["qr-codes", "assign-place", search, page],
    queryFn: () => listQRs({ page, limit: PAGE_SIZE, search: search || undefined }),
    placeholderData: keepPreviousData,
  })
  const codes = data?.data ?? []
  const pg = data?.pagination

  const toggle = (id: string, wasHere: boolean) =>
    setChanges((m) => {
      const next = new Map(m)
      const checked = !(m.get(id)?.checked ?? wasHere)
      if (checked === wasHere) next.delete(id)
      else next.set(id, { checked, wasHere })
      return next
    })

  const add = [...changes].filter(([, c]) => c.checked).map(([id]) => id)
  const remove = [...changes].filter(([, c]) => !c.checked).map(([id]) => id)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await setPlaceCodes(place.id, { add, remove })
      void qc.invalidateQueries({ queryKey: ["places"] })
      void qc.invalidateQueries({ queryKey: ["qr-codes"] })
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the changes.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <PlaceModal title={`Codes at ${place.name}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Tick the codes printed at this place. Their scans from now on count for it, and a code that had no place brings its
          earlier scans too. A code has one place: ticking one that is at another place moves it here.
        </p>

        <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search codes" leftIcon={<Search size={15} />} aria-label="Search codes" />

        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-violet-500" size={20} /></div>
        ) : isError ? (
          <p className="text-sm text-red-400 py-6 text-center">Couldn&apos;t load your codes.</p>
        ) : codes.length === 0 ? (
          <p className="text-sm text-zinc-500 py-6 text-center">{search ? "No codes match." : "No codes yet."}</p>
        ) : (
          <ul className={`border border-zinc-200 dark:border-zinc-800 rounded-xl divide-y divide-zinc-200 dark:divide-zinc-800 max-h-80 overflow-y-auto transition-opacity ${isFetching ? "opacity-60" : ""}`}>
            {codes.map((qr) => {
              const wasHere = qr.placeId === place.id
              const checked = changes.get(qr.id)?.checked ?? wasHere
              const elsewhere = qr.place && !wasHere ? qr.place.name : null
              return (
                <li key={qr.id}>
                  <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <input type="checkbox" checked={checked} onChange={() => toggle(qr.id, wasHere)} className="accent-violet-600 w-4 h-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm text-zinc-900 dark:text-white truncate">{qr.name}</span>
                      {elsewhere && (
                        <span className={`block text-xs truncate ${checked ? "text-amber-600 dark:text-amber-400" : "text-zinc-500"}`}>
                          {checked ? `Moves here from ${elsewhere}` : `At ${elsewhere}`}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}

        {pg && pg.totalPages > 1 && (
          <div className="flex items-center justify-end gap-1 text-xs text-zinc-500">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label="Previous page"
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30">
              <ChevronLeft size={15} />
            </button>
            <span className="tabular-nums px-1">Page {pg.page} of {pg.totalPages}</span>
            <button type="button" onClick={() => setPage((p) => Math.min(pg.totalPages, p + 1))} disabled={page >= pg.totalPages} aria-label="Next page"
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30">
              <ChevronRight size={15} />
            </button>
          </div>
        )}

        {error && <p className="text-red-400 text-xs">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-zinc-500">
            {add.length || remove.length
              ? [add.length && `${add.length} to add`, remove.length && `${remove.length} to take off`].filter(Boolean).join(" · ")
              : "No changes yet"}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={() => void save()} disabled={busy || (add.length === 0 && remove.length === 0)}>
              {busy && <Loader2 className="animate-spin" />} Save
            </Button>
          </div>
        </div>
      </div>
    </PlaceModal>
  )
}
