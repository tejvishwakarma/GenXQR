import { useState, useEffect } from "react"
import { Link, useLocation } from "react-router-dom"
import { QrCode, Menu, X, Sun, Moon, Zap } from "lucide-react"
import { MktButton } from "@/components/marketing/ui"
import { cn } from "@/lib/utils"

// Real, page-safe destinations only — this header wraps every marketing route,
// not just the redesigned homepage, so no in-page (#anchor) links here.
const LINKS = [
  { label: "Features", href: "/features" },
  { label: "Dynamic QR", href: "/dynamic-qr" },
  { label: "Use Cases", href: "/use-cases" },
  { label: "Pricing", href: "/pricing" },
  { label: "Docs", href: "/api-docs" },
]

const THEME_KEY = "marketing-theme"

export function Navbar() {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    setIsLoggedIn(!!localStorage.getItem("access_token"))
  }, [location])

  // Theme toggle scoped to marketing pages only, independent of the dashboard's
  // own `dashboard-theme` key — applied/cleaned up on mount/unmount so it never
  // leaks into the dashboard/admin, matching how the dashboard's own toggle works.
  const [dark, setDark] = useState(() => localStorage.getItem(THEME_KEY) === "dark")
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
    localStorage.setItem(THEME_KEY, dark ? "dark" : "light")
  }, [dark])

  // Lock background scroll while the full-screen mobile menu is open; Escape closes it.
  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const isActive = (href: string) => location.pathname === href

  return (
    <>
    <header className="sticky top-0 z-50 border-b border-line/70 bg-paper/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex h-16 items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2.5 group" aria-label="GenXQR home">
          <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center shadow-[0_0_15px_rgba(91,75,255,0.4)] group-hover:shadow-[0_0_20px_rgba(91,75,255,0.6)] transition-shadow">
            <QrCode className="text-white" size={18} />
          </div>
          <span className="font-display text-lg font-bold tracking-tightest text-ink">
            Gen<span className="text-accent">XQR</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {LINKS.map((l) => (
            <Link
              key={l.label}
              to={l.href}
              className={cn(
                "px-3 py-2 rounded-lg text-sm text-ink-soft hover:text-ink hover:bg-ink/5 transition-colors",
                isActive(l.href) && "text-ink bg-ink/5",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setDark((v) => !v)}
            aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
            className="grid place-items-center w-10 h-10 rounded-lg text-ink-soft hover:text-ink hover:bg-ink/5 transition-colors"
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <div className="hidden md:flex items-center gap-2">
            {isLoggedIn ? (
              <MktButton href="/app/dashboard" variant="accent" size="md">
                <Zap size={14} /> Dashboard
              </MktButton>
            ) : (
              <>
                <MktButton href="/login" variant="ghost" size="md">Sign in</MktButton>
                <MktButton href="/signup" variant="accent" size="md">Start free</MktButton>
              </>
            )}
          </div>

          <button
            className="md:hidden grid place-items-center w-10 h-10 rounded-lg text-ink hover:bg-ink/5"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-menu"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
    </header>

      {/* Mobile menu — full-screen overlay. Deliberately a SIBLING of <header>, not a
          child: the header's backdrop-blur (backdrop-filter) makes it a containing
          block for any `position: fixed` descendant, which would otherwise break this
          panel's viewport-relative positioning and squash it into the header's own box. */}
      <div
        id="mobile-menu"
        className={cn(
          "fixed inset-x-0 top-16 bottom-0 z-40 bg-paper md:hidden",
          "transition-all duration-300 ease-out",
          open ? "opacity-100 visible" : "opacity-0 invisible",
        )}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex h-full flex-col justify-between py-8">
          <nav className="flex flex-col">
            {LINKS.map((l, i) => (
              <Link
                key={l.label}
                to={l.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "border-b border-line py-4 font-display text-4xl font-bold tracking-tightest text-ink transition-all duration-300",
                  open ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
                )}
                style={{ transitionDelay: open ? `${i * 40}ms` : "0ms" }}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex flex-col gap-3">
            {isLoggedIn ? (
              <MktButton href="/app/dashboard" variant="accent" size="lg" onClick={() => setOpen(false)} className="w-full">
                <Zap size={16} /> Dashboard
              </MktButton>
            ) : (
              <>
                <MktButton href="/login" variant="outline" size="lg" onClick={() => setOpen(false)} className="w-full">Sign in</MktButton>
                <MktButton href="/signup" variant="accent" size="lg" onClick={() => setOpen(false)} className="w-full">Start free</MktButton>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
