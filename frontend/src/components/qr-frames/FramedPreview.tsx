import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import type { Options as QRStylingOptions } from "qr-code-styling"
import { cn } from "@/lib/utils"
import { composeFrameSvg, getFrame, type FrameFields } from "@/lib/frames/compose"

/**
 * A library frame with the code in it, exactly as it will download: the
 * composed SVG is shown through an <img>, which also keeps each frame's
 * embedded @font-face rules out of the page.
 */
export function FramedPreview({
  frameId,
  color,
  fields,
  qr,
  background,
  className,
}: {
  frameId: string
  color?: string | null
  fields?: FrameFields | null
  qr: Partial<QRStylingOptions>
  background?: string | null
  className?: string
}) {
  const entry = getFrame(frameId)
  const [src, setSrc] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [failed, setFailed] = useState(false)
  const urlRef = useRef<string | null>(null)

  // Recompose when anything that affects the artwork changes. Serialised so a
  // new-but-equal options object from the parent's render does not trigger it.
  const key = JSON.stringify({ frameId, color, fields, qr, background })

  useEffect(() => {
    if (!entry) return
    let cancelled = false
    setBusy(true)
    // Typing in a text field fires per keystroke; wait for a pause.
    const timer = setTimeout(async () => {
      try {
        const svg = await composeFrameSvg({ entry, qr, color, fields, background })
        if (cancelled) return
        const next = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }))
        if (urlRef.current) URL.revokeObjectURL(urlRef.current)
        urlRef.current = next
        setSrc(next)
        setFailed(false)
      } catch {
        if (!cancelled) setFailed(true)
      } finally {
        if (!cancelled) setBusy(false)
      }
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    },
    [],
  )

  if (!entry) return null

  return (
    <div
      className={cn("relative mx-auto", className)}
      style={{ aspectRatio: `${entry.width} / ${entry.height}` }}
    >
      {src && (
        <img
          src={src}
          alt={`QR code in the ${entry.title} frame`}
          className={cn("h-full w-full transition-opacity", busy && "opacity-70")}
          draggable={false}
        />
      )}
      {busy && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 size={20} className="animate-spin text-violet-500" />
        </div>
      )}
      {failed && !src && (
        <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-zinc-500">
          This frame could not be loaded. Check your connection and try again.
        </p>
      )}
    </div>
  )
}
