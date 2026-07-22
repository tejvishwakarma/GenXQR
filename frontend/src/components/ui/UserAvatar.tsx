import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"

/**
 * Circular user avatar. Shows the uploaded image when one is set AND loads
 * successfully; otherwise falls back to the first initial of the name.
 * A broken/404/stale image URL gracefully degrades to the initial instead of
 * rendering a broken-image icon.
 */
export function UserAvatar({
  src,
  name,
  className,
}: {
  src?: string | null
  name?: string | null
  className?: string
}) {
  const [errored, setErrored] = useState(false)

  // Retry loading if the source changes (e.g. the user uploads a new avatar).
  useEffect(() => { setErrored(false) }, [src])

  const initial = (name?.trim().charAt(0) || "U").toUpperCase()
  const showImage = Boolean(src) && !errored

  return (
    <div
      className={cn(
        "rounded-full overflow-hidden bg-violet-500/20 border border-violet-500/30",
        "flex items-center justify-center text-violet-400 font-semibold shrink-0 select-none",
        className,
      )}
    >
      {showImage ? (
        <img
          src={src as string}
          alt={name ?? "User"}
          className="w-full h-full object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  )
}
