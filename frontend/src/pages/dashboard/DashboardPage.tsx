import { Link } from "react-router-dom"
import { useMemo, useState, useCallback, useEffect } from "react"
import { createPortal } from "react-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  QrCode, TrendingUp, Eye, Scan, ArrowUpRight, Plus,
  Edit, BarChart3, Trash2, Loader2, Download,
  Power, Copy, CheckSquare, Square, PowerOff, Clock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { listQRs, deleteQR, toggleQR, duplicateQR, getGlobalAnalytics, getQrBaseUrl, getBillingUsage, getSubscription, type QRCode } from "@/lib/api"
import { DownloadMenu } from "@/components/QRDownloadMenu"
import { QRTypeIcon } from "@/lib/qrTypeIcon"

// â”€â”€â”€ Label / icon maps â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const TYPE_LABEL: Record<string, string> = {
  URL: "URL", PDF: "PDF", VIDEO: "Video", LINKS: "Multi-Link",
  SOCIAL_MEDIA: "Social", VCARD: "vCard", IMAGE_GALLERY: "Gallery",
  BUSINESS: "Business", APP: "App", MP3: "Audio", MENU: "Menu",
  WIFI: "WiFi", WHATSAPP: "WhatsApp", INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook", COUPON: "Coupon",
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}


// â”€â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function DashboardPage() {
  const queryClient = useQueryClient()
  const [typeFilter, setTypeFilter] = useState("all")

  const { data, isLoading, isError } = useQuery({
    queryKey: ["qr-codes"],
    queryFn: () => listQRs({ limit: 50 }),
  })

  const { mutate: remove, isPending: isDeleting } = useMutation({
    mutationFn: (id: string) => deleteQR(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["qr-codes"] }),
  })

  const { mutate: toggle, isPending: isToggling } = useMutation({
    mutationFn: (id: string) => toggleQR(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["qr-codes"] }),
  })

  const { mutate: duplicate, isPending: isDuplicating } = useMutation({
    mutationFn: (id: string) => duplicateQR(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["qr-codes"] }),
  })

  // ─── Bulk selection ───────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkOp, setBulkOp] = useState<"delete" | "download" | "activate" | "deactivate" | null>(null)

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: ["global-analytics-dashboard", 7],
    queryFn: () => getGlobalAnalytics(7),
    staleTime: 5 * 60_000,
  })
  const globalStats = analyticsData?.data

  const { data: usageData, isLoading: usageLoading } = useQuery({
    queryKey: ["billing-usage-dashboard"],
    queryFn: getBillingUsage,
    staleTime: 2 * 60_000,
  })
  const usage = usageData?.data

  const { data: subscriptionData } = useQuery({
    queryKey: ["subscription-dashboard"],
    queryFn: getSubscription,
    staleTime: 2 * 60_000,
  })
  const isTrialing = subscriptionData?.data.isTrialing ?? false
  const planName = subscriptionData?.data.planName ?? null
  const trialEndsAt = subscriptionData?.data.subscription?.trialEndsAt
  // Days remaining while actively trialing (null = not in trial)
  const trialDaysRemaining = useMemo(() => {
    if (!isTrialing || !trialEndsAt) return null
    const diff = new Date(trialEndsAt).getTime() - Date.now()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  }, [isTrialing, trialEndsAt])
  // Days since trial expired — for recently-lapsed users (null = never had trial)
  const trialExpiredDaysAgo = useMemo(() => {
    if (isTrialing || !trialEndsAt) return null
    const diff = Date.now() - new Date(trialEndsAt).getTime()
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
  }, [isTrialing, trialEndsAt])
  // Show an upgrade nudge on Free plan (trialing, just expired, or plain free)
  const showUpgradeNudge = isTrialing || planName === "FREE"

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return "Good morning"
    if (hour < 18) return "Good afternoon"
    return "Good evening"
  }, [])

  const firstName = useMemo(() => {
    try {
      const raw = localStorage.getItem("user")
      if (!raw) return "there"
      const user = JSON.parse(raw) as { name?: string }
      return user.name?.split(" ")[0] ?? "there"
    } catch {
      return "there"
    }
  }, [])

  const allQRs: QRCode[] = data?.data ?? []
  const total = data?.pagination.total ?? 0
  const totalScans = allQRs.reduce((sum, qr) => sum + qr.scanCount, 0)
  const activeQRs = allQRs.filter((qr) => qr.isActive).length
  const inactiveQRs = total - activeQRs

  const stats = [
    { label: "Total QR Codes", value: total.toString(),              change: `${total} created`,              icon: <QrCode size={20} className="text-violet-400" />,  href: "/app/dashboard" },
    { label: "Total Scans",    value: totalScans.toLocaleString(),   change: "all time",                      icon: <Scan   size={20} className="text-emerald-400" />, href: "/app/analytics" },
    { label: "Active QRs",     value: activeQRs.toString(),          change: `${inactiveQRs} inactive`,       icon: <TrendingUp size={20} className="text-blue-400" />, href: "/app/dashboard" },
    { label: "Views Today",    value: analyticsLoading ? "–" : (globalStats?.scansToday ?? 0).toLocaleString(), change: globalStats ? `${globalStats.scansThisWeek.toLocaleString()} this week` : "loading…", icon: <Eye size={20} className="text-amber-400" />, href: "/app/analytics" },
  ]

  const filteredQRs = typeFilter === "all"
    ? allQRs
    : allQRs.filter((qr) => qr.type === typeFilter.toUpperCase())

  // These callbacks need filteredQRs — declared here, after filteredQRs
  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === filteredQRs.length ? new Set() : new Set(filteredQRs.map((q) => q.id))
    )
  }, [filteredQRs])

  const handleBulkDelete = useCallback(async () => {
    const ids = [...selectedIds]
    if (!ids.length) return
    if (!window.confirm(`Delete ${ids.length} QR code${ids.length > 1 ? "s" : ""}? This cannot be undone.`)) return
    setBulkOp("delete")
    for (const id of ids) { try { await deleteQR(id) } catch { /* skip */ } }
    setSelectedIds(new Set())
    setBulkOp(null)
    void queryClient.invalidateQueries({ queryKey: ["qr-codes"] })
  }, [selectedIds, queryClient])

  const handleBulkDownload = useCallback(async () => {
    const qrs = filteredQRs.filter((q) => selectedIds.has(q.id))
    if (!qrs.length) return
    setBulkOp("download")
    try {
      const [{ default: QRCodeStyling }, { default: JSZip }] = await Promise.all([
        import("qr-code-styling"),
        import("jszip"),
      ])
      const zip = new JSZip()

      await Promise.all(qrs.map(async (qr) => {
        try {
          const redirectUrl = `${getQrBaseUrl()}/r/${qr.slug}`
          const d = qr.design
          const instance = new QRCodeStyling({
            data: redirectUrl,
            width: 1024, height: 1024, type: "canvas", margin: 40,
            dotsOptions: { color: d?.primaryColor ?? "#7c3aed", type: (d?.dotStyle ?? "rounded") as import("qr-code-styling").DotType },
            cornersSquareOptions: { color: d?.primaryColor ?? "#7c3aed", type: (d?.cornerSquareStyle ?? "square") as import("qr-code-styling").CornerSquareType },
            cornersDotOptions: { color: d?.primaryColor ?? "#7c3aed" },
            backgroundOptions: { color: d?.backgroundColor ?? "#ffffff" },
            qrOptions: { errorCorrectionLevel: "H" as const },
          })
          const blob = await instance.getRawData("png")
          if (blob) {
            const filename = `${qr.name.replace(/[^a-z0-9_-]/gi, "_")}.png`
            zip.file(filename, blob)
          }
        } catch { /* skip individual failures */ }
      }))

      const zipBlob = await zip.generateAsync({ type: "blob" })
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement("a")
      a.href = url
      a.download = `GenXQR-${firstName}-${Date.now()}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } finally {
      setBulkOp(null)
    }
  }, [selectedIds, filteredQRs])

  const handleBulkToggle = useCallback(async (activate: boolean) => {
    const qrs = filteredQRs.filter((q) => selectedIds.has(q.id) && q.isActive !== activate)
    if (!qrs.length) { setSelectedIds(new Set()); return }
    setBulkOp(activate ? "activate" : "deactivate")
    for (const qr of qrs) { try { await toggleQR(qr.id) } catch { /* skip */ } }
    setSelectedIds(new Set())
    setBulkOp(null)
    void queryClient.invalidateQueries({ queryKey: ["qr-codes"] })
  }, [selectedIds, filteredQRs, queryClient])

  const handleDelete = (qr: QRCode) => {
    if (!window.confirm(`Delete "${qr.name}"? This cannot be undone.`)) return
    remove(qr.id)
  }

  // Clear selection whenever the filtered list changes (filter/type change)
  useEffect(() => { setSelectedIds(new Set()) }, [typeFilter])

  // Unique type list for the filter dropdown
  const uniqueTypes = [...new Set(allQRs.map((qr) => qr.type))]

  return (
    <>
      <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">{greeting}, {firstName} 👋</h1>
          <p className="text-zinc-500 text-sm mt-1">Here's how your QR codes are performing today.</p>
        </div>
        <Link to="/app/create" className="shrink-0">
          <Button className="w-full sm:w-auto">
            <Plus size={16} />
            Create QR Code
          </Button>
        </Link>
      </div>

      {/* Plan / Trial Banner — shown for trialing users, recently-expired trials, and plain FREE users */}
      {showUpgradeNudge && (() => {
        // Determine variant
        const isExpired = !isTrialing && trialExpiredDaysAgo !== null
        const isLowTrial = isTrialing && trialDaysRemaining !== null && trialDaysRemaining <= 3
        const isMidTrial = isTrialing && trialDaysRemaining !== null && trialDaysRemaining <= 7 && trialDaysRemaining > 3
        const isActiveTrial = isTrialing && trialDaysRemaining !== null && trialDaysRemaining > 7

        const bgClass = isLowTrial || isExpired
          ? "bg-red-500/10 border-red-500/20"
          : isMidTrial
          ? "bg-amber-500/10 border-amber-500/20"
          : "bg-violet-500/10 border-violet-500/20"

        const iconColor = isLowTrial || isExpired
          ? "text-red-400"
          : isMidTrial
          ? "text-amber-400"
          : "text-violet-400"

        const titleColor = isLowTrial || isExpired
          ? "text-red-300"
          : isMidTrial
          ? "text-amber-300"
          : "text-violet-300"

        const title = isExpired
          ? "Your free trial has ended"
          : isActiveTrial
          ? `${trialDaysRemaining} day${trialDaysRemaining === 1 ? "" : "s"} left in your free trial`
          : isMidTrial || isLowTrial
          ? `Only ${trialDaysRemaining} day${trialDaysRemaining === 1 ? "" : "s"} left in your trial!`
          : "You're on the Free plan"

        const body = isExpired
          ? `Your trial ended ${trialExpiredDaysAgo === 0 ? "today" : `${trialExpiredDaysAgo} day${trialExpiredDaysAgo === 1 ? "" : "s"} ago`}. Subscribe to a paid plan to start creating QR codes again.`
          : isTrialing
          ? "After your trial ends, you'll need a paid subscription to create QR codes. Upgrade now to keep full access."
          : "Your trial has ended. Subscribe to a paid plan to create QR codes and unlock analytics, custom branding, and more."

        const btnClass = isLowTrial || isExpired
          ? "bg-red-600 hover:bg-red-500 text-white border-0"
          : isMidTrial
          ? "bg-amber-500 hover:bg-amber-400 text-black border-0"
          : ""

        return (
          <div className={cn("rounded-2xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3", bgClass)}>
            <div className="flex items-start gap-3">
              <Clock size={16} className={cn("mt-0.5 shrink-0", iconColor)} />
              <div>
                <p className={cn("text-sm font-semibold", titleColor)}>{title}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{body}</p>
              </div>
            </div>
            <Link to="/app/billing" className="shrink-0 self-start sm:self-auto">
              <Button size="sm" className={btnClass}>Upgrade now</Button>
            </Link>
          </div>
        )
      })()}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Link key={stat.label} to={stat.href} className="group block">
            <Card className="p-5 transition hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow-md cursor-pointer">
              <CardContent className="p-0">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                    {stat.icon}
                  </div>
                  <ArrowUpRight size={16} className="text-zinc-400 group-hover:text-violet-400 transition" />
                </div>
                <div className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white mb-1">
                  {isLoading ? <span className="inline-block w-10 h-6 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" /> : stat.value}
                </div>
                <div className="text-zinc-500 text-xs">{stat.label}</div>
                <div className="text-emerald-400 text-xs mt-2 font-medium">{stat.change}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Plan Usage */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">
            Plan Usage
            {usage && (
              <span className="ml-2 text-xs font-normal text-zinc-500">
                {usage.planName} plan
              </span>
            )}
          </CardTitle>
          <Link to="/app/billing" className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1">
            Manage plan <ArrowUpRight size={12} />
          </Link>
        </CardHeader>
        <CardContent>
          {usageLoading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div key={i} className="space-y-1.5">
                  <div className="h-3 w-24 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
                  <div className="h-2 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full animate-pulse" />
                </div>
              ))}
            </div>
          ) : usage ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-5">
              {/* QR Codes */}
              {(() => {
                const { used, limit } = usage.qrCodes
                const isUnlimited = limit < 0
                const isBlocked = limit === 0  // post-trial FREE: subscribe required
                const pct = isUnlimited || isBlocked ? 0 : Math.min((used / Math.max(limit, 1)) * 100, 100)
                const remaining = isUnlimited || isBlocked ? null : Math.max(limit - used, 0)
                const critical = !isUnlimited && !isBlocked && pct >= 90
                return (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500 font-medium">QR Codes</span>
                      <span className={isBlocked ? "text-red-400 font-semibold" : critical ? "text-amber-400 font-semibold" : "text-zinc-400"}>
                        {isBlocked ? "Subscription required" : isUnlimited ? `${used} / ∞` : `${used} / ${limit}`}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isBlocked ? "bg-red-500/40" : critical ? "bg-amber-400" : "bg-violet-500"}`}
                        style={{ width: isBlocked ? "100%" : isUnlimited ? "0%" : `${pct}%` }}
                      />
                    </div>
                    <p className={`text-[10px] ${isBlocked ? "text-red-400" : "text-zinc-500"}`}>
                      {isBlocked ? "Subscribe to create QR codes" : isUnlimited ? "Unlimited" : `${remaining} remaining`}
                    </p>
                  </div>
                )
              })()}

              {/* Scans this month */}
              {usage.scans && (() => {
                const { used, limit } = usage.scans
                const isUnlimited = limit < 0
                const pct = isUnlimited ? 0 : Math.min((used / Math.max(limit, 1)) * 100, 100)
                const remaining = isUnlimited ? null : Math.max(limit - used, 0)
                const critical = !isUnlimited && pct >= 90
                return (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500 font-medium">Scans (this month)</span>
                      <span className={critical ? "text-amber-400 font-semibold" : "text-zinc-400"}>
                        {isUnlimited ? `${used} / ∞` : `${used} / ${limit}`}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${critical ? "bg-amber-400" : "bg-emerald-500"}`}
                        style={{ width: isUnlimited ? "0%" : `${pct}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-zinc-500">
                      {isUnlimited ? "Unlimited" : `${remaining} remaining`}
                    </p>
                  </div>
                )
              })()}

              {/* Storage — paid plans only */}
              {usage.planName !== "FREE" && (() => {
                const { used, limit } = usage.storageGB
                const isUnlimited = limit < 0
                const pct = isUnlimited ? 0 : Math.min((used / Math.max(limit, 1)) * 100, 100)
                const remaining = isUnlimited ? null : Math.max(limit - used, 0)
                const critical = !isUnlimited && pct >= 90
                return (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500 font-medium">Storage</span>
                      <span className={critical ? "text-amber-400 font-semibold" : "text-zinc-400"}>
                        {isUnlimited ? `${used} GB / ∞` : `${used} GB / ${limit} GB`}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${critical ? "bg-amber-400" : "bg-blue-500"}`}
                        style={{ width: isUnlimited ? "0%" : `${pct}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-zinc-500">
                      {isUnlimited ? "Unlimited" : `${remaining} GB remaining`}
                    </p>
                  </div>
                )
              })()}

              {/* API Calls — PRO+ only (limit > 0 means plan has API access) */}
              {usage.apiCalls.limit !== 0 && (() => {
                const { used, limit } = usage.apiCalls
                const isUnlimited = limit < 0
                const pct = isUnlimited ? 0 : Math.min((used / Math.max(limit, 1)) * 100, 100)
                const remaining = isUnlimited ? null : Math.max(limit - used, 0)
                const critical = !isUnlimited && pct >= 90
                return (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500 font-medium">API Calls (this month)</span>
                      <span className={critical ? "text-amber-400 font-semibold" : "text-zinc-400"}>
                        {isUnlimited ? `${used} / ∞` : `${used} / ${limit}`}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${critical ? "bg-amber-400" : "bg-amber-500"}`}
                        style={{ width: isUnlimited ? "0%" : `${pct}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-zinc-500">
                      {isUnlimited ? "Unlimited" : `${remaining} remaining`}
                    </p>
                  </div>
                )
              })()}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Mini Analytics: Scan Trend + Top QR Codes */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* 7-Day Scan Trend */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Scan Trend (Last 7 Days)</CardTitle>
            <Link to="/app/analytics" className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1">
              Full report <ArrowUpRight size={12} />
            </Link>
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <div className="h-20 rounded animate-pulse bg-zinc-100 dark:bg-zinc-800" />
            ) : globalStats && globalStats.timeline.some((p) => p.count > 0) ? (
              (() => {
                const maxCount = Math.max(...globalStats.timeline.map((p) => p.count), 1)
                return (
                  <div>
                    <div className="flex items-end gap-0.5 h-16 overflow-visible">
                      {globalStats.timeline.map((pt) => (
                        <div
                          key={pt.date}
                          className="relative flex-1 min-w-0 group cursor-pointer"
                          style={{ height: `${(pt.count / maxCount) * 100}%`, minHeight: pt.count > 0 ? "4px" : "0" }}
                        >
                          <div className="h-full w-full bg-violet-600/80 hover:bg-violet-500 transition-colors rounded-t" />
                          <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-zinc-800 dark:bg-zinc-800 text-white text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                            {pt.count}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-0.5 mt-1">
                      {globalStats.timeline.map((pt) => (
                        <span key={pt.date} className="flex-1 text-zinc-500 text-[9px] text-center truncate">
                          {new Date(pt.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })()
            ) : (
              <div className="h-20 flex items-center justify-center">
                <p className="text-zinc-500 text-xs">No scans in the last 7 days</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top QR Codes */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Top QR Codes</CardTitle>
            <Link to="/app/analytics" className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1">
              View all <ArrowUpRight size={12} />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {analyticsLoading ? (
              <div>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="px-6 py-3 flex items-center gap-3 border-b border-zinc-100 dark:border-zinc-800">
                    <div className="w-8 h-8 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse w-32" />
                      <div className="h-3 bg-zinc-100 dark:bg-zinc-800/60 rounded animate-pulse w-16" />
                    </div>
                    <div className="h-4 w-8 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            ) : globalStats && globalStats.topQRs.length > 0 ? (
              globalStats.topQRs.slice(0, 5).map((qr, i, arr) => (
                <Link to={`/app/qr/${qr.id}/analytics`} key={qr.id}>
                  <div className={`px-6 py-3 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors ${i < arr.length - 1 ? "border-b border-zinc-100 dark:border-zinc-800" : ""}`}>
                    <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-base">
                      <QRTypeIcon type={qr.type} size={16} className="text-violet-500 dark:text-violet-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-zinc-900 dark:text-zinc-200 text-sm font-medium truncate">{qr.name}</div>
                      <div className="text-zinc-500 text-xs">{TYPE_LABEL[qr.type] ?? qr.type}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Scan size={12} className="text-zinc-400" />
                      <span className="text-zinc-900 dark:text-white text-sm font-semibold">{qr.scanCount.toLocaleString()}</span>
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="px-6 py-8 text-center text-zinc-500 text-xs">
                No QR codes yet — <Link to="/app/create" className="text-violet-400 hover:underline">create one</Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* QR Codes Table */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4">
          <CardTitle>My QR Codes</CardTitle>
          <div className="flex items-center gap-3">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[120px] h-8 text-xs">
                <SelectValue placeholder="Filter types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {uniqueTypes.map((t) => (
                  <SelectItem key={t} value={t.toLowerCase()}>{TYPE_LABEL[t] ?? t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Link to="/app/create">
              <Button size="sm" variant="outline">
                <Plus size={14} /> New
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-16 text-zinc-500">
              <Loader2 size={20} className="animate-spin mr-2" />
              Loading QR codes…
            </div>
          )}

          {/* Error */}
          {isError && (
            <div className="text-center py-16 text-zinc-500">
              <p className="text-red-400 mb-2">Failed to load QR codes</p>
              <Button variant="secondary" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["qr-codes"] })}>
                Retry
              </Button>
            </div>
          )}

          {/* Empty */}
          {!isLoading && !isError && filteredQRs.length === 0 && (
            <div className="text-center py-16 text-zinc-500">
              <QrCode size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm mb-4">
                {typeFilter === "all" ? "No QR codes yet." : `No ${TYPE_LABEL[typeFilter.toUpperCase()] ?? typeFilter} QR codes.`}
              </p>
              <Link to="/app/create">
                <Button size="sm"><Plus size={14} /> Create your first</Button>
              </Link>
            </div>
          )}

          {/* Table */}
          {!isLoading && !isError && filteredQRs.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800">
                    {/* Select-all checkbox */}
                    <th className="px-4 py-3 w-8">
                      <button
                        onClick={toggleSelectAll}
                        className="text-zinc-400 hover:text-violet-400 transition-colors"
                        title={selectedIds.size === filteredQRs.length ? "Deselect all" : "Select all"}
                      >
                        {selectedIds.size > 0 && selectedIds.size === filteredQRs.length
                          ? <CheckSquare size={15} className="text-violet-400" />
                          : selectedIds.size > 0
                            ? <CheckSquare size={15} className="text-violet-300 opacity-60" />
                            : <Square size={15} />}
                      </button>
                    </th>
                    <th className="text-left text-xs text-zinc-500 font-medium px-6 py-3">Name</th>
                    <th className="text-left text-xs text-zinc-500 font-medium px-6 py-3 hidden sm:table-cell">Type</th>
                    <th className="text-left text-xs text-zinc-500 font-medium px-6 py-3">Status</th>
                    <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Scans</th>
                    <th className="text-left text-xs text-zinc-500 font-medium px-6 py-3 hidden md:table-cell">Created</th>
                    <th className="text-right text-xs text-zinc-500 font-medium px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQRs.map((qr) => (
                    <tr
                      key={qr.id}
                      className={`border-b border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors ${
                        selectedIds.has(qr.id) ? "bg-violet-500/5 dark:bg-violet-500/5" : ""
                      }`}
                    >
                      {/* Row checkbox */}
                      <td className="px-4 py-4 w-8">
                        <button
                          onClick={() => toggleSelect(qr.id)}
                          className="text-zinc-400 hover:text-violet-400 transition-colors"
                        >
                          {selectedIds.has(qr.id)
                            ? <CheckSquare size={15} className="text-violet-400" />
                            : <Square size={15} />}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-lg">
                            <QRTypeIcon type={qr.type} size={16} className="text-violet-500 dark:text-violet-400" />
                          </div>
                          <div>
                            <div className="text-zinc-900 dark:text-white text-sm font-medium">{qr.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 hidden sm:table-cell">
                        <Badge variant="secondary">{TYPE_LABEL[qr.type] ?? qr.type}</Badge>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={qr.isActive ? "success" : "secondary"}>
                          {qr.isActive ? "active" : "inactive"}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-zinc-900 dark:text-white text-sm">{qr.scanCount.toLocaleString()}</span>
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell">
                        <span className="text-zinc-500 text-sm">{formatDate(qr.createdAt)}</span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-1 sm:gap-2">
                          <Link to={`/app/qr/${qr.id}`}>
                            <button className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-violet-400 hover:bg-violet-500/10 transition-colors" title="View details">
                              <QrCode size={14} />
                            </button>
                          </Link>
                          <Link to={`/app/qr/${qr.id}/analytics`} className="hidden sm:block">
                            <button className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" title="Analytics">
                              <BarChart3 size={14} />
                            </button>
                          </Link>
                          <Link to={`/app/qr/${qr.id}/edit`}>
                            <button className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" title="Edit">
                              <Edit size={14} />
                            </button>
                          </Link>
                          <div className="hidden sm:block"><DownloadMenu qr={qr} /></div>
                          <button
                            onClick={() => duplicate(qr.id)}
                            disabled={isDuplicating}
                            className="hidden sm:flex w-8 h-8 rounded-lg items-center justify-center text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors disabled:opacity-40"
                            title="Duplicate"
                          >
                            <Copy size={14} />
                          </button>
                          <button
                            onClick={() => toggle(qr.id)}
                            disabled={isToggling}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 ${
                              qr.isActive
                                ? "text-emerald-400 hover:text-red-400 hover:bg-red-500/10"
                                : "text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                            }`}
                            title={qr.isActive ? "Deactivate" : "Activate"}
                          >
                            <Power size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(qr)}
                            disabled={isDeleting}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>

    {/* ── Bulk action floating toolbar ─────────────────────────────────────── */}
    {selectedIds.size > 0 && createPortal(
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] animate-fade-in w-[calc(100vw-2rem)] sm:w-auto max-w-[calc(100vw-2rem)]">
        <div className="flex items-center gap-1 sm:gap-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-2xl shadow-2xl px-3 sm:px-4 py-2.5 overflow-x-auto">
          {/* Selection count */}
          <span className="text-zinc-900 dark:text-white text-sm font-medium pr-2 sm:pr-3 border-r border-zinc-300 dark:border-zinc-700 shrink-0">
            {selectedIds.size} selected
          </span>

          {/* Download PNG */}
          <button
            onClick={() => void handleBulkDownload()}
            disabled={!!bulkOp}
            className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50 shrink-0"
            title="Download selected as PNG"
          >
            {bulkOp === "download"
              ? <Loader2 size={13} className="animate-spin" />
              : <Download size={13} />}
            <span className="hidden sm:inline">Download</span>
          </button>

          {/* Activate */}
          <button
            onClick={() => void handleBulkToggle(true)}
            disabled={!!bulkOp}
            className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-50 shrink-0"
            title="Activate selected"
          >
            {bulkOp === "activate"
              ? <Loader2 size={13} className="animate-spin" />
              : <Power size={13} />}
            <span className="hidden sm:inline">Activate</span>
          </button>

          {/* Deactivate */}
          <button
            onClick={() => void handleBulkToggle(false)}
            disabled={!!bulkOp}
            className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-50 shrink-0"
            title="Deactivate selected"
          >
            {bulkOp === "deactivate"
              ? <Loader2 size={13} className="animate-spin" />
              : <PowerOff size={13} />}
            <span className="hidden sm:inline">Deactivate</span>
          </button>

          {/* Divider */}
          <div className="w-px h-5 bg-zinc-300 dark:bg-zinc-700 mx-0.5 sm:mx-1 shrink-0" />

          {/* Bulk Delete */}
          <button
            onClick={() => void handleBulkDelete()}
            disabled={!!bulkOp}
            className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:text-white hover:bg-red-500/20 transition-colors disabled:opacity-50 shrink-0"
            title="Delete selected"
          >
            {bulkOp === "delete"
              ? <Loader2 size={13} className="animate-spin" />
              : <Trash2 size={13} />}
            <span className="hidden sm:inline">Delete</span>
          </button>

          {/* Clear selection */}
          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-0.5 sm:ml-1 w-6 h-6 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-xs shrink-0"
            title="Clear selection"
          >
            ✕
          </button>
        </div>
      </div>,
      document.body
    )}
  </>
  )
}
