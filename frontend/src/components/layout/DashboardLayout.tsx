import { Outlet, Link, useLocation, useNavigate } from "react-router-dom"
import type { ReactElement } from "react"
import {
  QrCode, LayoutDashboard, BarChart3, Settings, CreditCard, PlusCircle,
  Users, Key, Layers, LogOut, ChevronDown, Bell, Search, Menu, X, Sun, Moon, Webhook, ShieldCheck, UserCheck, Flag, Clock,
} from "lucide-react"
import { useState, useMemo, useEffect, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { UserAvatar } from "@/components/ui/UserAvatar"
import {
  apiFetch, clearClientSession, exchangeOAuthCode, getBillingUsage, getCurrentUser,
  getSubscription, isImpersonatingSessionActive, stopImpersonationSession,
  getNotifications, getUnreadNotificationCount,
  markNotificationRead, markAllNotificationsRead,
  deleteNotification, clearAllNotifications,
  type AppNotification,
} from "@/lib/api"
import type { AuthUser } from "@/lib/api"
import { useTheme } from "@/hooks/useTheme"
import { SupportModal } from "@/components/SupportModal"

const navItems: { label: string; href: string; icon: ReactElement; badge?: string }[] = [
  { label: "Dashboard", href: "/app/dashboard", icon: <LayoutDashboard size={18} /> },
  { label: "My QR Codes", href: "/app/qr-codes", icon: <QrCode size={18} /> },
  { label: "Create QR", href: "/app/create", icon: <PlusCircle size={18} /> },
  { label: "Analytics", href: "/app/analytics", icon: <BarChart3 size={18} /> },
  { label: "Bulk Generate", href: "/app/bulk-generate", icon: <Layers size={18} /> },
  { label: "Team", href: "/app/team", icon: <Users size={18} /> },
  { label: "API Keys", href: "/app/api-keys", icon: <Key size={18} /> },
  { label: "Webhooks", href: "/app/webhooks", icon: <Webhook size={18} /> },
  { label: "Report / Abuse", href: "/app/report", icon: <Flag size={18} /> },
]

const bottomItems = [
  { label: "Billing", href: "/app/billing", icon: <CreditCard size={18} /> },
  { label: "Settings", href: "/app/settings", icon: <Settings size={18} /> },
]

export function DashboardLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [isImpersonating, setIsImpersonating] = useState(() => isImpersonatingSessionActive())
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const isActive = (href: string) => location.pathname === href
  const { theme, toggleTheme } = useTheme()

  // ─── Real-time global QR search ─────────────────────────────────────────────
  // Mirror the box from the URL query so this box and the QR page's own search
  // stay in sync, and the box clears when navigating away from a search context.
  useEffect(() => {
    const q = new URLSearchParams(location.search).get("q") ?? ""
    setSearchQuery((cur) => (cur === q ? cur : q))
  }, [location.search])

  // Search as you type: debounce, then drive the URL query on the QR list page.
  // Off the list page we only navigate once there's a query (don't yank the user
  // away on an empty box); on the page we replace history to avoid per-keystroke spam.
  useEffect(() => {
    const onQrPage = location.pathname === "/app/qr-codes"
    const q = searchQuery.trim()
    const currentQ = new URLSearchParams(location.search).get("q") ?? ""
    if (q === currentQ) return
    if (!q && !onQrPage) return
    const t = setTimeout(() => {
      navigate(q ? `/app/qr-codes?q=${encodeURIComponent(q)}` : "/app/qr-codes", { replace: onQrPage })
    }, 250)
    return () => clearTimeout(t)
  }, [searchQuery, location.pathname, location.search, navigate])

  // True while we're mid-exchange of a Google OAuth one-time code.
  // Prevents the auth guard and TanStack queries from firing before the token is stored.
  const [exchangingOAuth, setExchangingOAuth] = useState(() => {
    return new URLSearchParams(window.location.search).has("oauth_code")
  })

  // Ref guard: ensures the one-time code is only exchanged once even in React 18
  // Strict Mode, which mounts → unmounts → remounts in development causing effects
  // to run twice. The Redis key is single-use, so a second exchange would 400.
  const oauthExchangeAttempted = useRef(false)
  const notificationRef = useRef<HTMLDivElement>(null)

  // Guard: handle Google OAuth code exchange first, then enforce auth
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const oauthCode = params.get("oauth_code")

    if (oauthCode) {
      // Already attempted (Strict Mode double-invoke) — skip to avoid 400
      if (oauthExchangeAttempted.current) return
      oauthExchangeAttempted.current = true

      // Exchange the one-time code for an access token, then strip it from the URL
      exchangeOAuthCode(oauthCode)
        .then((accessToken) => {
          localStorage.setItem("access_token", accessToken)
          // Remove oauth_code from URL without adding a history entry
          params.delete("oauth_code")
          const cleanSearch = params.toString()
          const cleanUrl = location.pathname + (cleanSearch ? `?${cleanSearch}` : "")
          navigate(cleanUrl, { replace: true })
        })
        .catch(() => {
          // Exchange failed — fall back to silent refresh via cookie; if that
          // also has no session, the standard auth guard below will redirect to login.
          setExchangingOAuth(false)
          if (!localStorage.getItem("access_token")) {
            navigate("/login?error=oauth_failed", { replace: true })
          }
        })
        .finally(() => {
          setExchangingOAuth(false)
        })
      return
    }

    // No OAuth code — standard auth guard
    if (!localStorage.getItem("access_token")) {
      navigate("/login", { replace: true })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate])

  const user = useMemo<AuthUser | null>(() => {
    try {
      const raw = localStorage.getItem("user")
      return raw ? (JSON.parse(raw) as AuthUser) : null
    } catch {
      return null
    }
  }, [])

  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN"
  const displayName = user?.name ?? "User"
  const displayEmail = user?.email ?? ""

  const { data: sessionUserData } = useQuery({
    queryKey: ["session-user"],
    queryFn: getCurrentUser,
    enabled: !exchangingOAuth && !!localStorage.getItem("access_token"),
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  })

  const displayAvatarUrl = sessionUserData?.data?.avatarUrl ?? user?.avatarUrl ?? null

  useEffect(() => {
    if (sessionUserData?.data) {
      localStorage.setItem("user", JSON.stringify(sessionUserData.data))
    }
  }, [sessionUserData])

  const { data: subscriptionData } = useQuery({
    queryKey: ["subscription", "sidebar"],
    queryFn: getSubscription,
    enabled: !exchangingOAuth && !isAdmin,
    staleTime: 0,
  })

  const { data: usageData } = useQuery({
    queryKey: ["billing-usage", "sidebar"],
    queryFn: getBillingUsage,
    enabled: !exchangingOAuth && !isAdmin,
    staleTime: 0,
  })

  const planDisplayName = subscriptionData?.data.subscription.planDisplayName ?? "Free"
  const qrUsed = usageData?.data.qrCodes.used ?? 0
  const qrLimit = usageData?.data.qrCodes.limit ?? 0
  // qrLimit=0 means post-trial FREE — show "—" rather than "0"
  const qrLimitLabel = qrLimit === 0 ? "—" : qrLimit >= 999999 ? "∞" : String(qrLimit)
  const qrProgressPct = qrLimit > 0
    ? Math.min(100, Math.round((qrUsed / qrLimit) * 100))
    : 0

  const isTrialing = subscriptionData?.data.isTrialing ?? false
  const sidebarPlanName = subscriptionData?.data.planName ?? null
  const trialEndsAt = subscriptionData?.data.subscription?.trialEndsAt
  const trialDaysRemaining = useMemo(() => {
    if (!isTrialing || !trialEndsAt) return null
    const diff = new Date(trialEndsAt).getTime() - Date.now()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  }, [isTrialing, trialEndsAt])
  // True when on FREE plan without an active trial — still show something in sidebar
  const isPlainFree = !isTrialing && sidebarPlanName === "FREE"

  const isLoggedIn = !exchangingOAuth && !!localStorage.getItem("access_token")

  // Lightweight unread-count poll — drives the bell badge (60 s interval)
  const { data: unreadData } = useQuery({
    queryKey: ["notifications-unread-count"],
    queryFn:  getUnreadNotificationCount,
    enabled:  isLoggedIn,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  // Full notification list — fetched (and always re-fetched) when dropdown opens
  const { data: notificationsData, isLoading: notificationsLoading } = useQuery({
    queryKey: ["notifications-list"],
    queryFn:  () => getNotifications(20, 0),
    enabled:  isLoggedIn && notificationsOpen,
    staleTime: 0,
    refetchOnMount: "always",
  })

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] })
      void queryClient.invalidateQueries({ queryKey: ["notifications-list"] })
    },
  })

  const markAllReadMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] })
      void queryClient.invalidateQueries({ queryKey: ["notifications-list"] })
    },
  })

  const dismissMutation = useMutation({
    mutationFn: (id: string) => deleteNotification(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] })
      void queryClient.invalidateQueries({ queryKey: ["notifications-list"] })
    },
  })

  const clearAllMutation = useMutation({
    mutationFn: clearAllNotifications,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] })
      void queryClient.invalidateQueries({ queryKey: ["notifications-list"] })
    },
  })

  const notifications: AppNotification[] = notificationsData?.data.items ?? []
  const unreadCount = Math.min(99, unreadData?.data.count ?? 0)

  useEffect(() => {
    setNotificationsOpen(false)
  }, [location.pathname])

  // Close notification panel when clicking anywhere outside of it
  useEffect(() => {
    if (!notificationsOpen) return
    function handleOutsideClick(e: MouseEvent) {
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleOutsideClick)
    return () => document.removeEventListener("mousedown", handleOutsideClick)
  }, [notificationsOpen])

  async function handleLogout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" })
    } catch {
      // Ignore errors — clear client state regardless
    }
    clearClientSession()
    navigate("/login", { replace: true })
  }

  function handleStopImpersonation() {
    const restored = stopImpersonationSession()
    if (!restored) {
      clearClientSession()
      navigate("/login", { replace: true })
      return
    }
    setIsImpersonating(false)
    navigate("/admin/users", { replace: true })
  }

  const SidebarContent = () => {
    const [profileMenuOpen, setProfileMenuOpen] = useState(false)
    const profileMenuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
      if (!profileMenuOpen) return
      function handleOutsideClick(e: MouseEvent) {
        if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
          setProfileMenuOpen(false)
        }
      }
      document.addEventListener("mousedown", handleOutsideClick)
      return () => document.removeEventListener("mousedown", handleOutsideClick)
    }, [profileMenuOpen])

    return (
      <>
        {/* Logo */}
        <div className="p-5 border-b border-zinc-200 dark:border-zinc-800">
        <Link to="/" className="flex items-center gap-2.5" onClick={() => setSidebarOpen(false)}>
          <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center shadow-[0_0_15px_rgba(124,58,237,0.4)]">
            <QrCode size={18} className="text-white" />
          </div>
          <span className="text-zinc-900 dark:text-white font-bold text-lg">GenX<span className="gradient-text">QR</span></span>
        </Link>
      </div>

      {/* Plan Badge — hidden for admins (they have unrestricted access) */}
      {!isAdmin && (
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-zinc-700 dark:text-zinc-300 text-xs font-medium">{planDisplayName} Plan</span>
            </div>
            <Link to="/app/billing" onClick={() => setSidebarOpen(false)}>
              <Badge variant="warning" className="text-xs cursor-pointer hover:opacity-80">Upgrade</Badge>
            </Link>
          </div>
          <div className="mt-2">
            {qrLimit === 0 ? (
              // Post-trial FREE: show locked state instead of "0 / —"
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-zinc-500">QR codes</span>
                <span className="text-red-400 font-medium">Locked</span>
              </div>
            ) : (
              <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                <span>QR codes</span>
                <span>{qrUsed} / {qrLimitLabel}</span>
              </div>
            )}
            <div className="h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={qrLimit === 0 ? "h-full bg-red-500/40 rounded-full" : "h-full bg-violet-600 rounded-full"}
                style={{ width: qrLimit === 0 ? "100%" : `${qrProgressPct}%` }}
              />
            </div>
          </div>
          {trialDaysRemaining !== null ? (
            <div className={cn(
              "mt-2 flex items-center gap-1.5 text-xs font-medium",
              trialDaysRemaining === 0
                ? "text-red-400"
                : trialDaysRemaining <= 3
                ? "text-red-400"
                : trialDaysRemaining <= 7
                ? "text-amber-400"
                : "text-emerald-500"
            )}>
              <Clock size={11} />
              {trialDaysRemaining === 0
                ? "Trial expired — upgrade now"
                : `${trialDaysRemaining}d trial remaining`
              }
            </div>
          ) : isPlainFree ? (
            <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-400">
              <Clock size={11} />
              Trial ended · subscribe to create QRs
            </div>
          ) : null}
        </div>
      )}

      {/* Admin badge — shown only for admin roles */}
      {isAdmin && (
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-violet-400" />
            <span className="text-violet-400 text-xs font-semibold tracking-wide uppercase">
              {user?.role === "SUPER_ADMIN" ? "Super Admin" : "Admin"}
            </span>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <Link
            key={`${item.href}-${item.label}`}
            to={item.href}
            onClick={() => setSidebarOpen(false)}
            className={cn("sidebar-item", isActive(item.href) && "active")}
          >
            {item.icon}
            <span className="flex-1">{item.label}</span>
            {item.badge && (
              <Badge variant="secondary" className="text-xs">{item.badge}</Badge>
            )}
          </Link>
        ))}
      </nav>

      {/* User & Bottom Nav */}
      <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 relative" ref={profileMenuRef}>
        
        {/* Admin Panel shortcut — only for admins */}
        {isAdmin && (
          <Link
            to="/admin"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-3 w-full px-3 py-2 mb-3 rounded-lg text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition text-sm font-medium"
          >
            <ShieldCheck size={16} />
            <span>Admin Panel</span>
          </Link>
        )}

        {profileMenuOpen && (
          <div className="absolute bottom-full left-4 right-4 mb-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg overflow-hidden z-50 animate-fade-in py-1">
            {bottomItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => {
                  setSidebarOpen(false)
                  setProfileMenuOpen(false)
                }}
                className={cn("flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition", isActive(item.href) && "bg-zinc-50 dark:bg-zinc-800 text-violet-600 dark:text-violet-400 font-medium")}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ))}
            <div className="h-px bg-zinc-200 dark:bg-zinc-800 my-1" />
            <button
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition font-medium"
              onClick={handleLogout}
            >
              <LogOut size={16} />
              <span>Sign out</span>
            </button>
          </div>
        )}

        <button 
          onClick={() => setProfileMenuOpen(!profileMenuOpen)}
          className="w-full flex items-center gap-3 p-2 -m-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
        >
          <UserAvatar src={displayAvatarUrl} name={displayName} className="w-8 h-8 text-sm" />
          <div className="flex-1 min-w-0 text-left">
            <div className="text-zinc-900 dark:text-white text-sm font-medium truncate">{displayName}</div>
            <div className="text-zinc-500 text-xs truncate">{displayEmail}</div>
          </div>
          <ChevronDown size={14} className={cn("text-zinc-500 shrink-0 transition-transform", profileMenuOpen && "rotate-180")} />
        </button>
      </div>
    </>
  )
}

  // Block render while OAuth code exchange is in progress — prevents the auth
  // guard from redirecting to /login before the token reaches localStorage.
  if (exchangingOAuth) {
    return (
      <div className={cn("min-h-screen flex items-center justify-center", theme === "dark" ? "dark bg-zinc-950" : "bg-zinc-50")}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center shadow-[0_0_20px_rgba(124,58,237,0.5)] animate-pulse">
            <QrCode size={20} className="text-white" />
          </div>
          <p className="text-zinc-500 text-sm">Signing you in…</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("min-h-screen flex", theme === "dark" ? "dark bg-zinc-950" : "bg-zinc-50")}>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 border-r border-zinc-200 dark:border-zinc-800 flex-col fixed left-0 top-0 bottom-0 z-30 bg-zinc-50 dark:bg-zinc-950">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 dark:bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar Drawer */}
      <aside
        className={cn(
          "fixed left-0 top-0 bottom-0 z-50 w-72 bg-zinc-50 dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 flex flex-col transition-transform duration-300 ease-out md:hidden",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Close button */}
        <button
          onClick={() => setSidebarOpen(false)}
          className="absolute top-4 right-4 w-8 h-8 rounded-xl bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors z-10"
        >
          <X size={16} />
        </button>
        <SidebarContent />
      </aside>

      {/* Main Content */}
      <div className="flex-1 md:pl-64">
        {/* Top Header */}
        <header className="sticky top-0 z-20 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/90 dark:bg-zinc-950/90 backdrop-blur-xl px-4 md:px-8 py-4">
          <div className="flex items-center gap-3 justify-between">
            {/* Mobile hamburger */}
            <button
              className="md:hidden w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={18} />
            </button>

            <div className="flex-1 max-w-64">
              <Input
                placeholder="Search QR codes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onClear={() => setSearchQuery("")}
                leftIcon={<Search size={16} />}
                className="bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus-visible:border-violet-500 focus-visible:ring-0"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={toggleTheme}
                className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              >
                {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <div className="relative" ref={notificationRef}>
                <button
                  onClick={() => setNotificationsOpen((prev) => !prev)}
                  className="relative w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                  aria-label="Open notifications"
                >
                  <Bell size={16} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-violet-600 rounded-full text-[10px] leading-none flex items-center justify-center text-white font-semibold">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] max-w-80 z-20 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden">
                      {/* Header */}
                      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-white shrink-0">
                          Notifications
                          {unreadCount > 0 && (
                            <span className="ml-2 text-xs font-normal text-violet-400">{unreadCount} new</span>
                          )}
                        </p>
                        <div className="flex items-center gap-3">
                          {unreadCount > 0 && (
                            <button
                              onClick={() => markAllReadMutation.mutate()}
                              disabled={markAllReadMutation.isPending}
                              className="text-xs text-violet-500 hover:text-violet-400 transition disabled:opacity-50 whitespace-nowrap"
                            >
                              Mark all read
                            </button>
                          )}
                          {notifications.length > 0 && (
                            <button
                              onClick={() => clearAllMutation.mutate()}
                              disabled={clearAllMutation.isPending}
                              className="text-xs text-zinc-500 hover:text-red-400 transition disabled:opacity-50 whitespace-nowrap"
                              title="Clear all notifications"
                            >
                              {clearAllMutation.isPending ? "Clearing…" : "Clear all"}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* List */}
                      <div className="max-h-[340px] overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800">
                        {notificationsLoading ? (
                          <div className="py-8 flex items-center justify-center">
                            <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                          </div>
                        ) : notifications.length === 0 ? (
                          <div className="py-10 flex flex-col items-center gap-2 text-zinc-400">
                            <Bell size={24} className="opacity-30" />
                            <p className="text-sm">You're all caught up</p>
                          </div>
                        ) : (
                          notifications.map((n) => (
                            <div
                              key={n.id}
                              className={cn(
                                "relative group flex items-start gap-3 px-4 py-3 transition",
                                n.isRead
                                  ? "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                                  : "bg-violet-50 dark:bg-violet-500/5 hover:bg-violet-100/70 dark:hover:bg-violet-500/10",
                              )}
                            >
                              {/* Unread dot */}
                              <div className="mt-2 shrink-0 w-2">
                                {!n.isRead && (
                                  <div className="w-2 h-2 rounded-full bg-violet-500" />
                                )}
                              </div>

                              {/* Content — clickable area */}
                              <button
                                type="button"
                                className="flex-1 min-w-0 text-left"
                                onClick={() => {
                                  if (!n.isRead) markReadMutation.mutate(n.id)
                                  if (n.actionUrl) {
                                    setNotificationsOpen(false)
                                    if (n.actionUrl.startsWith("http")) {
                                      window.open(n.actionUrl, "_blank", "noopener")
                                    } else {
                                      navigate(n.actionUrl)
                                    }
                                  }
                                }}
                              >
                                <p className={cn(
                                  "text-sm leading-snug pr-6",
                                  n.isRead
                                    ? "text-zinc-700 dark:text-zinc-300 font-normal"
                                    : "text-zinc-900 dark:text-zinc-100 font-medium",
                                )}>
                                  {n.title}
                                </p>
                                <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2 leading-relaxed pr-6">
                                  {n.body}
                                </p>
                                <p className="text-[10px] text-zinc-400 mt-1.5">
                                  {new Date(n.createdAt).toLocaleDateString(undefined, {
                                    month: "short", day: "numeric",
                                    hour: "2-digit", minute: "2-digit",
                                  })}
                                </p>
                              </button>

                              {/* Dismiss button — revealed on hover */}
                              <button
                                type="button"
                                aria-label="Dismiss notification"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  dismissMutation.mutate(n.id)
                                }}
                                disabled={dismissMutation.isPending}
                                className={cn(
                                  "absolute top-3 right-3 w-5 h-5 rounded-md flex items-center justify-center",
                                  "text-zinc-400 hover:text-zinc-900 dark:hover:text-white",
                                  "hover:bg-zinc-200 dark:hover:bg-zinc-700 transition",
                                  "opacity-0 group-hover:opacity-100 focus:opacity-100",
                                  "disabled:opacity-30",
                                )}
                              >
                                <X size={11} strokeWidth={2.5} />
                              </button>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Footer */}
                      <div className="p-3 border-t border-zinc-200 dark:border-zinc-800">
                        <button
                          onClick={() => {
                            setNotificationsOpen(false)
                            navigate("/app/settings", { replace: false })
                          }}
                          className="w-full text-sm px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
                        >
                          Notification preferences
                        </button>
                      </div>
                    </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 md:p-8">
          {isImpersonating && (
            <div className="mb-5 bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-amber-300 text-sm">
                <UserCheck size={16} className="shrink-0" />
                <span>You are impersonating this user account.</span>
              </div>
              <button
                onClick={handleStopImpersonation}
                className="px-3 py-1.5 rounded-xl text-xs font-medium border border-amber-400/40 text-amber-200 hover:bg-amber-500/20 transition"
              >
                Stop impersonation
              </button>
            </div>
          )}
          <Outlet />
        </main>
      </div>

      {/* Floating support button — only for non-admin users */}
      {!isAdmin && <SupportModal />}
    </div>
  )
}
