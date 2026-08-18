import { cn } from "@/lib/utils"

/**
 * The GenXQR brand mark.
 *
 * Two files, because the artwork is not theme-neutral: the tagline
 * ("GENERATE · CONNECT · DELIVER") is near-black in one and near-white in the
 * other, so each is illegible on the opposite background.
 *
 *   /logo_full.png       light backgrounds (marketing paper)
 *   /logo_full_dark.png  dark backgrounds (dark mode, dashboard + admin chrome)
 *
 * logo_full_dark.png is DERIVED from the supplied logo_full_Dark_BG.png, which
 * ships with an opaque #211E1F background baked in. Our dark surfaces are
 * #0B0A11 (marketing) and #09090B (zinc-950 sidebars), so that background
 * rendered as a visibly lighter grey card around the logo. The derived file is
 * the same artwork with the background keyed out to transparency. Re-derive it
 * if the source art changes — do not point this component at the _Dark_BG file.
 *
 * The two are toggled with `dark:` classes rather than by swapping `src` from
 * JS, so CSS picks the correct one on first paint — no flash of the wrong mark
 * while theme state hydrates.
 *
 * width/height are explicit (the art is 513x100) so a header reserves its space
 * before the image decodes, instead of shifting once it loads.
 */

const ASPECT = 513 / 100

export function BrandLogo({
  height = 32,
  className,
  alt = "GenXQR",
}: {
  height?: number
  className?: string
  alt?: string
}) {
  const width = Math.round(height * ASPECT)
  const shared = cn("w-auto select-none", className)

  return (
    <>
      <img
        src="/logo_full.png"
        alt={alt}
        width={width}
        height={height}
        style={{ height }}
        className={cn(shared, "block dark:hidden")}
      />
      {/* Same mark, so it is decorative here — the light one above already
          carries the accessible name for both. */}
      <img
        src="/logo_full_dark.png"
        alt=""
        aria-hidden="true"
        width={width}
        height={height}
        style={{ height }}
        className={cn(shared, "hidden dark:block")}
      />
    </>
  )
}
