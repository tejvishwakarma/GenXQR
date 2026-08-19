import { useEffect, useRef, useState, type ReactNode, type ReactElement, type ComponentType } from "react"
import { Link } from "react-router-dom"
import { cn } from "@/lib/utils"

// Scoped to the redesigned marketing homepage (v2) — deliberately separate from
// the shared `@/components/ui/*` kit used by the dashboard/admin, and from the
// CVA-based `Button` used app-wide, to avoid touching either.

// ── Container ────────────────────────────────────────────────────────────────
export function MktContainer({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-container px-6 md:px-8", className)}>{children}</div>
}

// ── Finder glyph — the QR corner "eye", recurring structural marker ──────────
export function FinderGlyph({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="2.2" y="2.2" width="19.6" height="19.6" rx="6" stroke="currentColor" strokeWidth="2.6" />
      <rect x="8" y="8" width="8" height="8" rx="2.4" fill="currentColor" />
    </svg>
  )
}

// ── Eyebrow label ─────────────────────────────────────────────────────────────
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint", className)}>
      <FinderGlyph size={13} className="text-accent" />
      {children}
    </span>
  )
}

// ── Scroll reveal — fades + rises content in once as it enters the viewport ──
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          io.disconnect()
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={cn(
        "transition-all duration-700 ease-out",
        shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6",
        className,
      )}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  )
}

// ── Section heading block ─────────────────────────────────────────────────────
export function SectionHead({
  eyebrow,
  title,
  intro,
  align = "left",
  onDark = false,
  className = "",
}: {
  eyebrow: string
  title: ReactNode
  intro?: ReactNode
  align?: "left" | "center"
  onDark?: boolean
  className?: string
}) {
  return (
    <Reveal className={cn(align === "center" ? "text-center mx-auto max-w-2xl" : "max-w-2xl", className)}>
      <Eyebrow className={onDark ? "text-band-fg/60" : ""}>{eyebrow}</Eyebrow>
      <h2 className={cn("mt-4 text-3xl md:text-[2.6rem] leading-[1.05] font-bold font-display tracking-tightest", onDark ? "text-band-fg" : "text-ink")}>
        {title}
      </h2>
      {intro && (
        <p className={cn("mt-4 text-[17px] leading-relaxed", onDark ? "text-band-fg/70" : "text-ink-soft")}>{intro}</p>
      )}
    </Reveal>
  )
}

// ── Button — route-aware: "#anchor" hrefs stay plain <a>, real paths use <Link> ─
type MktButtonProps = {
  children: ReactNode
  href?: string
  variant?: "accent" | "ink" | "outline" | "outlineOnDark" | "ghost"
  size?: "md" | "lg"
  className?: string
  onClick?: () => void
  /**
   * Renders a real <button> instead of a link. Without this the component always
   * produced an <a href="#">, so using it inside a form gave a control that could
   * never submit — which is exactly how the contact form ended up inert.
   */
  type?: "button" | "submit"
  disabled?: boolean
}
export function MktButton({ children, href = "#", variant = "accent", size = "md", className = "", onClick, type, disabled }: MktButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 font-medium rounded-full transition-all duration-200 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
  const sizes = { md: "h-11 px-5 text-sm", lg: "h-[52px] px-7 text-[15px]" }
  const variants = {
    accent: "bg-accent text-white hover:bg-accent-ink shadow-[0_12px_34px_-12px_rgba(91,75,255,0.65)]",
    ink: "bg-ink text-paper hover:bg-ink/90",
    outline: "border border-line bg-paper-pure text-ink hover:border-ink/30 hover:shadow-card",
    outlineOnDark: "border border-white/20 bg-transparent text-band-fg hover:border-white/40 hover:bg-white/5",
    ghost: "text-ink hover:bg-ink/[0.05]",
  }
  const classes = cn(base, sizes[size], variants[variant], className)

  // A form control has to be a button, and must come before the href fallback:
  // href defaults to "#", so an unset href would otherwise win.
  if (type) {
    return (
      <button type={type} onClick={onClick} disabled={disabled} className={cn(classes, "disabled:opacity-60 disabled:cursor-not-allowed")}>
        {children}
      </button>
    )
  }

  if (href.startsWith("#")) {
    return (
      <a href={href} onClick={onClick} className={classes}>
        {children}
      </a>
    )
  }
  return (
    <Link to={href} onClick={onClick} className={classes}>
      {children}
    </Link>
  )
}

// ── Generic content card — feature/value/use-case grids across inner pages ──
export function MktCard({
  children,
  className = "",
  interactive = true,
}: {
  children: ReactNode
  className?: string
  interactive?: boolean
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-paper-pure p-6",
        interactive && "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift hover:border-ink/10",
        className,
      )}
    >
      {children}
    </div>
  )
}

// ── Coloured icon swatch — one of a curated tint palette, light/dark aware ───
const ICON_TINTS = {
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  red: "bg-red-500/10 text-red-600 dark:text-red-400",
  purple: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  cyan: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  pink: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  indigo: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  orange: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  teal: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
} as const
export type IconTint = keyof typeof ICON_TINTS

export function IconTile({
  icon: Icon,
  tint = "violet",
  size = "md",
  className = "",
}: {
  icon: ComponentType<{ size?: number; className?: string }>
  tint?: IconTint
  size?: "sm" | "md"
  className?: string
}) {
  const dim = size === "sm" ? "w-10 h-10" : "w-12 h-12"
  return (
    <span className={cn("inline-grid place-items-center shrink-0 rounded-xl border border-line", dim, ICON_TINTS[tint], className)}>
      <Icon size={size === "sm" ? 18 : 22} />
    </span>
  )
}

// ── Signature: editorial branded QR art ───────────────────────────────────────
export function QrArt({ className = "" }: { className?: string }) {
  const N = 25
  const cell = 8
  const pad = 5
  const dim = N * cell + pad * 2

  const inFinder = (x: number, y: number) =>
    (x < 7 && y < 7) || (x >= N - 7 && y < 7) || (x < 7 && y >= N - 7)
  const inCenter = (x: number, y: number) => x >= 9 && x <= 15 && y >= 9 && y <= 15

  const modules: ReactElement[] = []
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (inFinder(x, y) || inCenter(x, y)) continue
      const on = (x * 7 + y * 13 + x * y * 3) % 5 < 2
      if (!on) continue
      modules.push(
        <rect
          key={`${x}-${y}`}
          x={pad + x * cell + 0.9}
          y={pad + y * cell + 0.9}
          width={cell - 1.8}
          height={cell - 1.8}
          rx={2}
        />,
      )
    }
  }

  const eye = (cx: number, cy: number, key: string) => (
    <g key={key}>
      <rect
        x={pad + cx * cell + cell * 0.5}
        y={pad + cy * cell + cell * 0.5}
        width={cell * 6}
        height={cell * 6}
        rx={13}
        fill="none"
        stroke="url(#mktEyeGrad)"
        strokeWidth={cell}
      />
      <rect
        x={pad + (cx + 2) * cell}
        y={pad + (cy + 2) * cell}
        width={cell * 3}
        height={cell * 3}
        rx={6}
        fill="url(#mktEyeGrad)"
      />
    </g>
  )

  return (
    <svg viewBox={`0 0 ${dim} ${dim}`} className={className} role="img" aria-label="A branded GenXQR code">
      <defs>
        <linearGradient id="mktEyeGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6C5CFF" />
          <stop offset="100%" stopColor="#2E2596" />
        </linearGradient>
        <clipPath id="mktBoard">
          <rect x="0" y="0" width={dim} height={dim} rx="22" />
        </clipPath>
      </defs>

      <g clipPath="url(#mktBoard)">
        <rect x="0" y="0" width={dim} height={dim} fill="#FFFFFF" />
        <g fill="#14131A">{modules}</g>
        {eye(0, 0, "tl")}
        {eye(N - 7, 0, "tr")}
        {eye(0, N - 7, "bl")}

        <rect x={pad + 9 * cell - 3} y={pad + 9 * cell - 3} width={cell * 7 + 6} height={cell * 7 + 6} rx="14" fill="#FFFFFF" />
        <rect x={pad + 9.5 * cell} y={pad + 9.5 * cell} width={cell * 6} height={cell * 6} rx="12" fill="#14131A" />
        <g transform={`translate(${pad + 11 * cell}, ${pad + 11 * cell})`}>
          <FinderGlyph size={cell * 3} className="text-accent" />
        </g>

        <rect x={pad} y={-6} width={N * cell} height="4" fill="#5B4BFF" opacity="0.55" className="animate-scanline" />
      </g>
    </svg>
  )
}
