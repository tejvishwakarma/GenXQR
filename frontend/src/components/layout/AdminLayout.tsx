import { Outlet, Link, useLocation, useNavigate } from "react-router-dom"
import {
  QrCode, LayoutDashboard, Users, BarChart3, DollarSign,
  HardDrive, ScrollText, LogOut, Shield, Menu, X,
  CreditCard, AlertOctagon, Mail, Send, Settings, HeadphonesIcon, Receipt, Briefcase, Ticket } from "lucide-react"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { cn } from "@/lib/utils"
import { fetchUnresolvedAbuseCount, fetchOpenSupportTicketCount, fetchNewApplicationCount } from "@/lib/api"

const navItems = [
  { label: "Dashboard",     href: "/admin",               icon: <LayoutDashboard size={18} /> },
  { label: "Users",         href: "/admin/users",         icon: <Users size={18} /> },
  { label: "QR Codes",      href: "/admin/qr-codes",      icon: <QrCode size={18} /> },
  { label: "Subscriptions", href: "/admin/subscriptions", icon: <CreditCard size={18} /> },
  { label: "Payments",      href: "/admin/payments",      icon: <Receipt size={18} /> },
  { label: "Analytics",     href: "/admin/analytics",     icon: <BarChart3 size={18} /> },
  { label: "Revenue",       href: "/admin/revenue",       icon: <DollarSign size={18} /> },
  { label: "Coupons",       href: "/admin/coupons",       icon: <Ticket size={18} /> },
  { label: "Storage",       href: "/admin/storage",       icon: <HardDrive size={18} /> },
  { label: "Abuse",         href: "/admin/abuse",         icon: <AlertOctagon size={18} /> },
  { label: "Email Logs",    href: "/admin/email",         icon: <Mail size={18} /> },
  { label: "Broadcast",     href: "/admin/broadcast",     icon: <Send size={18} /> },
  { label: "Settings",      href: "/admin/settings",      icon: <Settings size={18} /> },
  { label: "Changelog",     href: "/admin/changelog",     icon: <ScrollText size={18} /> },
  { label: "Careers",       href: "/admin/careers",       icon: <Briefcase size={18} /> },
  { label: "Audit Log",     href: "/admin/audit",         icon: <ScrollText size={18} /> },
  { label: "Support",       href: "/admin/support",       icon: <HeadphonesIcon size={18} /> },
]

export function AdminLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const { data: abuseCount = 0 } = useQuery({
    queryKey: ["admin", "abuse-unresolved-count"],
    queryFn: fetchUnresolvedAbuseCount,
    staleTime: 60_000,
    refetchInterval: 120_000,
  })

  const { data: openTicketCount = 0 } = useQuery({
    queryKey: ["admin", "support-ticket-count"],
    queryFn: fetchOpenSupportTicketCount,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const { data: newApplicationCount = 0 } = useQuery({
    queryKey: ["admin", "careers-application-count"],
    queryFn: fetchNewApplicationCount,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const isActive = (href: string) =>
    href === "/admin" ? location.pathname === "/admin" : location.pathname.startsWith(href)

  function handleLogout() {
    localStorage.removeItem("access_token")
    localStorage.removeItem("user")
    navigate("/admin/login", { replace: true })
  }

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="p-5 border-b border-zinc-800">
        <Link to="/admin" className="flex items-center gap-2.5" onClick={() => setSidebarOpen(false)}>
          <div className="w-8 h-8 rounded-xl bg-red-600 flex items-center justify-center shadow-[0_0_15px_rgba(220,38,38,0.4)]">
            <Shield size={18} className="text-white" />
          </div>
          <div>
            <div className="text-white font-bold text-lg leading-none">GenXQR</div>
            <div className="text-red-400 text-[10px] font-semibold uppercase tracking-widest">Admin</div>
          </div>
        </Link>
      </div>

      {/* Nav items */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            onClick={() => setSidebarOpen(false)}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
              isActive(item.href)
                ? "bg-red-500/15 text-red-400 border border-red-500/20"
                : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800",
            )}
          >
            {item.icon}
            <span className="flex-1">{item.label}</span>
            {item.href === "/admin/abuse" && abuseCount > 0 && (
              <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center">
                {abuseCount > 99 ? "99+" : abuseCount}
              </span>
            )}
            {item.href === "/admin/support" && openTicketCount > 0 && (
              <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-violet-500 text-white text-[11px] font-bold flex items-center justify-center">
                {openTicketCount > 99 ? "99+" : openTicketCount}
              </span>
            )}
            {item.href === "/admin/careers" && newApplicationCount > 0 && (
              <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[11px] font-bold flex items-center justify-center">
                {newApplicationCount > 99 ? "99+" : newApplicationCount}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-zinc-800">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-zinc-950 flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-56 flex-col bg-zinc-900 border-r border-zinc-800 fixed inset-y-0 left-0 z-30">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <aside className="relative flex flex-col w-56 bg-zinc-900 border-r border-zinc-800">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 lg:ml-56 flex flex-col min-h-screen">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center gap-3 p-4 bg-zinc-900 border-b border-zinc-800 sticky top-0 z-20">
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-red-400" />
            <span className="text-white font-semibold text-sm">Admin Panel</span>
          </div>
        </header>

        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
