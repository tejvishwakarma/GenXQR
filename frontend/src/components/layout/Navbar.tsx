import { Link, useLocation } from "react-router-dom"
import { QrCode, Menu, X, Zap, ScanLine } from "lucide-react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const navLinks: { label: string; href: string; highlight?: boolean }[] = [
  { label: "Static QR", href: "/generate" },
  { label: "Dynamic QR", href: "/dynamic-qr", highlight: true },
  { label: "QR Scanner", href: "/scanner" },
  { label: "Pricing", href: "/pricing" },
  { label: "Contact", href: "/contact" },
]

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setIsLoggedIn(!!localStorage.getItem("access_token"))
  }, [location])

  const isActive = (href: string) => location.pathname === href

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-800/60 backdrop-blur-xl bg-zinc-950/80">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center shadow-[0_0_15px_rgba(124,58,237,0.4)] group-hover:shadow-[0_0_20px_rgba(124,58,237,0.6)] transition-shadow">
              <QrCode className="w-4.5 h-4.5 text-white" size={18} />
            </div>
            <span className="text-white font-bold text-lg tracking-tight">
              Nexus<span className="gradient-text">QR</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) =>
              link.highlight ? (
                <Link
                  key={link.label}
                  to={link.href}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                    "border border-violet-500/40 text-violet-300 hover:text-white hover:border-violet-400 hover:bg-violet-500/10",
                    "shadow-[0_0_10px_rgba(124,58,237,0.15)] hover:shadow-[0_0_16px_rgba(124,58,237,0.3)]",
                    isActive(link.href) && "bg-violet-500/20 text-white border-violet-400"
                  )}
                >
                  <Zap size={14} />
                  {link.label}
                </Link>
              ) : (
                <Link
                  key={link.label}
                  to={link.href}
                  className={cn(
                    "nav-link px-3 py-2 rounded-lg hover:bg-zinc-800",
                    isActive(link.href) && "text-white bg-zinc-800"
                  )}
                >
                  {link.label}
                </Link>
              )
            )}
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            {isLoggedIn ? (
              <Link to="/app/dashboard">
                <Button size="sm" className="flex items-center gap-1.5">
                  <Zap size={14} />
                  Dashboard
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="outline" size="sm">Sign In</Button>
                </Link>
                <Link to="/signup">
                  <Button size="sm" className="flex items-center gap-1.5">
                    <Zap size={14} />
                    Get Started
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile Toggle */}
          <button
            className="md:hidden text-zinc-400 hover:text-white p-2 rounded-lg hover:bg-zinc-800 transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-zinc-800 bg-zinc-950 px-4 py-4 animate-fade-in">
          <div className="flex flex-col gap-2">
            <Link to="/generate" className="nav-link py-3 border-b border-zinc-800" onClick={() => setMobileOpen(false)}>Static QR</Link>
            <Link to="/dynamic-qr" className="nav-link py-3 border-b border-zinc-800" onClick={() => setMobileOpen(false)}>Dynamic QR</Link>
            <Link
              to="/scanner"
              className="flex items-center gap-2 py-3 border-b border-zinc-800 text-sm font-medium text-violet-300 hover:text-white transition-colors"
              onClick={() => setMobileOpen(false)}
            >
              <ScanLine size={15} />
              QR Scanner
            </Link>
            <Link to="/pricing" className="nav-link py-3 border-b border-zinc-800" onClick={() => setMobileOpen(false)}>Pricing</Link>
            <Link to="/contact" className="nav-link py-3 border-b border-zinc-800" onClick={() => setMobileOpen(false)}>Contact</Link>
            <div className="flex gap-3 pt-2">
              {isLoggedIn ? (
                <Link to="/app/dashboard" className="flex-1"><Button className="w-full">Dashboard</Button></Link>
              ) : (
                <>
                  <Link to="/login" className="flex-1"><Button variant="outline" className="w-full">Sign In</Button></Link>
                  <Link to="/signup" className="flex-1"><Button className="w-full">Get Started</Button></Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
