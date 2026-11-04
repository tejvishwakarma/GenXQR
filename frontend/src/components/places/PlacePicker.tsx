import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Link } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { MapPin, Plus, X } from "lucide-react"
import { createPlace, getPlaces } from "@/lib/api"
import { PlaceForm } from "./PlaceForm"

/**
 * A centred dialog in the dashboard's style (closes on Escape / backdrop).
 * Portalled to <body>: dashboard pages animate in with a transform, which makes
 * a `fixed` child position against the page instead of the viewport.
 */
export function PlaceModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-zinc-900 dark:text-white font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * "Where is this printed?" on the QR editor: one of the account's places, or a
 * new one added on the spot. "" = no place.
 */
export function PlacePicker({ value, onChange }: { value: string; onChange: (placeId: string) => void }) {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const { data } = useQuery({ queryKey: ["places"], queryFn: () => getPlaces(), staleTime: 60_000 })
  const places = data?.data ?? []

  return (
    <div>
      <label className="label-text" htmlFor="qr-place">Place <span className="text-zinc-500 font-normal">(optional)</span></label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <MapPin size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <select
            id="qr-place"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full h-10 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 pl-9 pr-3 text-sm text-zinc-900 dark:text-white"
          >
            <option value="">No place</option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.code ? ` · ${p.code}` : ""}{p.city ? ` · ${p.city}` : ""}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="h-10 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-700 dark:text-zinc-300 hover:border-violet-500 hover:text-violet-500 inline-flex items-center gap-1.5 shrink-0"
        >
          <Plus size={14} /> New place
        </button>
      </div>
      <p className="text-xs text-zinc-500 mt-1">
        Where this code is printed, e.g. a store or a metro station. Scans are counted per place in{" "}
        <Link to="/app/places" className="text-violet-400 hover:text-violet-300">Places</Link>. Printing at several places? Use one code per place.
      </p>

      {adding && (
        <PlaceModal title="New place" onClose={() => setAdding(false)}>
          <PlaceForm
            submitLabel="Add place"
            onCancel={() => setAdding(false)}
            onSubmit={async (body) => {
              const res = await createPlace(body)
              await qc.invalidateQueries({ queryKey: ["places"] })
              onChange(res.data.id)
              setAdding(false)
            }}
          />
        </PlaceModal>
      )}
    </div>
  )
}
