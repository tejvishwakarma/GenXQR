import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, Loader2, Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ApiError, copyQRToPlaces, createPlace, getPlaces, type QRCode } from "@/lib/api"
import { PlaceForm } from "./PlaceForm"
import { PlaceModal } from "./PlacePicker"

/**
 * "Copy to other places" on a code: one active copy per chosen place, same
 * content and design, each a code of its own so its scans count for its place
 * (backend qr.service copyQRToPlaces).
 */
export function CopyToPlacesModal({ qr, onClose }: { qr: QRCode; onClose: () => void }) {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ["places"], queryFn: () => getPlaces(), staleTime: 60_000 })
  const places = (data?.data ?? []).filter((p) => p.id !== qr.placeId)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState("")
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Awaited<ReturnType<typeof copyQRToPlaces>>["data"] | null>(null)

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return f ? places.filter((p) => [p.name, p.code, p.city].some((v) => v?.toLowerCase().includes(f))) : places
  }, [places, filter])

  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  async function copy() {
    setBusy(true)
    setError(null)
    try {
      const res = await copyQRToPlaces(qr.id, [...picked])
      setResult(res.data)
      void qc.invalidateQueries({ queryKey: ["qr-codes"] })
      void qc.invalidateQueries({ queryKey: ["places"] })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not copy the code.")
    } finally {
      setBusy(false)
    }
  }

  if (adding) {
    return (
      <PlaceModal title="New place" onClose={() => setAdding(false)}>
        <PlaceForm
          submitLabel="Add place"
          onCancel={() => setAdding(false)}
          onSubmit={async (body) => {
            const res = await createPlace(body)
            await qc.invalidateQueries({ queryKey: ["places"] })
            setPicked((s) => new Set(s).add(res.data.id))
            setAdding(false)
          }}
        />
      </PlaceModal>
    )
  }

  return (
    <PlaceModal title="Copy to other places" onClose={onClose}>
      {result ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="text-emerald-500 shrink-0 mt-0.5" size={20} />
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              {result.created.length === 1 ? "1 code" : `${result.created.length} codes`} created and switched on — print each one at its place.
            </p>
          </div>
          {result.created.length > 0 && (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl max-h-60 overflow-y-auto">
              {result.created.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="truncate text-zinc-800 dark:text-zinc-200">{c.name}</span>
                  <Link to={`/app/qr/${c.id}`} onClick={onClose} className="text-violet-400 hover:text-violet-300 text-xs shrink-0">Open &amp; download</Link>
                </li>
              ))}
            </ul>
          )}
          {result.failed.length > 0 && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Not copied to {result.failed.map((f) => f.placeName).join(", ")}: your plan&apos;s QR code limit is reached.{" "}
              <Link to="/app/billing" className="underline">Upgrade</Link>
            </p>
          )}
          <div className="flex justify-end"><Button size="sm" onClick={onClose}>Done</Button></div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Each place gets its own copy of <span className="font-medium text-zinc-900 dark:text-white">{qr.name}</span> — same content and design —
            so you can see how many scans each place gets. Each copy counts as a QR code on your plan.
          </p>

          {places.length > 6 && (
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search places" leftIcon={<Search size={15} />} />
          )}

          {places.length === 0 ? (
            <p className="text-sm text-zinc-500">No other places yet. Add the places where you&apos;ll print it.</p>
          ) : (
            <ul className="border border-zinc-200 dark:border-zinc-800 rounded-xl divide-y divide-zinc-200 dark:divide-zinc-800 max-h-72 overflow-y-auto">
              {shown.map((p) => (
                <li key={p.id}>
                  <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} className="accent-violet-600 w-4 h-4" />
                    <span className="min-w-0">
                      <span className="block text-sm text-zinc-900 dark:text-white truncate">{p.name}</span>
                      {(p.code || p.city) && <span className="block text-xs text-zinc-500 truncate">{[p.code, p.city].filter(Boolean).join(" · ")}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 text-sm text-violet-500 hover:text-violet-400">
                <Plus size={14} /> New place
              </button>
              {shown.length > 1 && (
                <button
                  type="button"
                  onClick={() => setPicked(picked.size === shown.length ? new Set() : new Set(shown.map((p) => p.id)))}
                  className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                >
                  {picked.size === shown.length ? "Clear" : "Select all"}
                </button>
              )}
            </div>
            <Button size="sm" onClick={() => void copy()} disabled={busy || picked.size === 0}>
              {busy && <Loader2 className="animate-spin" />}
              {picked.size > 1 ? `Make ${picked.size} copies` : "Make copy"}
            </Button>
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>
      )}
    </PlaceModal>
  )
}
