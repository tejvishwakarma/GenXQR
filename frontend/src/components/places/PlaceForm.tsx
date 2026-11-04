import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ApiError, type Place, type PlaceInput } from "@/lib/api"

/**
 * Add / edit a place (backend place.service.ts). The map pin is pasted — a
 * "lat, lng" pair or a Google Maps link — because the site's Permissions-Policy
 * turns browser geolocation off.
 */

/** "28.4595, 77.0727", or a Google Maps URL with @lat,lng / q=lat,lng / !3dlat!4dlng. */
export function parseMapPin(text: string): { lat: number; lng: number } | null {
  const t = text.trim()
  if (!t) return null
  const patterns = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i,
    /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/,
  ]
  for (const re of patterns) {
    const m = t.match(re)
    if (!m) continue
    const lat = Number(m[1])
    const lng = Number(m[2])
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng }
  }
  return null
}

export function mapLink(p: { lat: number | null; lng: number | null }) {
  return p.lat != null && p.lng != null ? `https://www.google.com/maps?q=${p.lat},${p.lng}` : null
}

export function PlaceForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Place
  submitLabel: string
  onSubmit: (body: PlaceInput) => Promise<unknown>
  onCancel?: () => void
}) {
  const [name, setName] = useState(initial?.name ?? "")
  const [code, setCode] = useState(initial?.code ?? "")
  const [city, setCity] = useState(initial?.city ?? "")
  const [address, setAddress] = useState(initial?.address ?? "")
  const [pin, setPin] = useState(initial?.lat != null && initial.lng != null ? `${initial.lat}, ${initial.lng}` : "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsedPin = parseMapPin(pin)
  const pinInvalid = pin.trim() !== "" && !parsedPin

  async function submit() {
    if (!name.trim()) return setError("Give the place a name.")
    if (pinInvalid) return setError("The map pin should be “latitude, longitude” or a Google Maps link.")
    setBusy(true)
    setError(null)
    try {
      await onSubmit({
        name: name.trim(),
        code: code.trim() || null,
        city: city.trim() || null,
        address: address.trim() || null,
        lat: parsedPin?.lat ?? null,
        lng: parsedPin?.lng ?? null,
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the place.")
    } finally {
      setBusy(false)
    }
  }

  return (
    // Not a <form>: this sits inside the QR editor's own form.
    <div
      className="space-y-3"
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
          e.preventDefault()
          void submit()
        }
      }}
    >
      <div>
        <label className="label-text" htmlFor="place-name">Place name</label>
        <Input id="place-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Millennium City Centre Metro" autoFocus />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label-text" htmlFor="place-code">Location ID <span className="text-zinc-500 font-normal">(optional)</span></label>
          <Input id="place-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={40} placeholder="e.g. DEL-MCC-01" />
        </div>
        <div>
          <label className="label-text" htmlFor="place-city">City <span className="text-zinc-500 font-normal">(optional)</span></label>
          <Input id="place-city" value={city} onChange={(e) => setCity(e.target.value)} maxLength={100} placeholder="e.g. Gurugram" />
        </div>
      </div>
      <div>
        <label className="label-text" htmlFor="place-address">Address <span className="text-zinc-500 font-normal">(optional)</span></label>
        <Input id="place-address" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} placeholder="e.g. Exit 2, Sector 29" />
      </div>
      <div>
        <label className="label-text" htmlFor="place-pin">Map pin <span className="text-zinc-500 font-normal">(optional)</span></label>
        <Input id="place-pin" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="28.4595, 77.0727 — or paste a Google Maps link" />
        <p className={pinInvalid ? "text-red-400 text-xs mt-1" : "text-zinc-500 text-xs mt-1"}>
          {pinInvalid
            ? "Couldn’t read that. Use “latitude, longitude” or a Google Maps link."
            : parsedPin
              ? <>Pinned at {parsedPin.lat.toFixed(5)}, {parsedPin.lng.toFixed(5)} · <a className="text-violet-400 hover:text-violet-300" href={mapLink(parsedPin)!} target="_blank" rel="noopener noreferrer">check on the map</a></>
              : "In Google Maps, right-click the spot and click the coordinates to copy them."}
        </p>
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        {onCancel && <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>}
        <Button type="button" size="sm" onClick={() => void submit()} disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} {submitLabel}
        </Button>
      </div>
    </div>
  )
}
