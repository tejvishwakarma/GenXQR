import { useState, useEffect } from "react"
import { Link, useParams } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Save, Loader2, Calendar, Lock, BarChart3, Globe, FlaskConical, GitBranch } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getQR, updateQR, getSubscription } from "@/lib/api"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toLocalDateTimeInput(iso: string | null): string {
  if (!iso) return ""
  return iso.slice(0, 16) // "YYYY-MM-DDTHH:mm"
}

function fromLocalDateTimeInput(val: string): string | null {
  if (!val) return null
  return new Date(val).toISOString()
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function QRSettingsPage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()

  const { data: qrData, isLoading } = useQuery({ queryKey: ["qr", id], queryFn: () => getQR(id!), enabled: !!id })
  const qr = qrData?.data

  const { data: subData } = useQuery({ queryKey: ["subscription"], queryFn: getSubscription, staleTime: 5 * 60 * 1000 })
  const subInfo = subData?.data

  // ── Form state ──
  const [activeFrom, setActiveFrom] = useState("")
  const [activeUntil, setActiveUntil] = useState("")
  const [scanLimit, setScanLimit] = useState("")
  const [fallbackUrl, setFallbackUrl] = useState("")
  const [password, setPassword] = useState("")
  const [fbPixelId, setFbPixelId] = useState("")
  const [gaId, setGaId] = useState("")
  const [gtmId, setGtmId] = useState("")
  const [successMsg, setSuccessMsg] = useState("")
  const [errorMsg, setErrorMsg] = useState("")

  // Populate when QR loads
  useEffect(() => {
    if (!qr) return
    setActiveFrom(toLocalDateTimeInput(qr.activeFrom))
    setActiveUntil(toLocalDateTimeInput(qr.activeUntil))
    setScanLimit(qr.scanLimit != null ? String(qr.scanLimit) : "")
    setFallbackUrl(qr.fallbackUrl ?? "")
    setFbPixelId(qr.fbPixelId ?? "")
    setGaId(qr.gaId ?? "")
    setGtmId(qr.gtmId ?? "")
  }, [qr])

  const saveMut = useMutation({
    mutationFn: () =>
      updateQR(id!, {
        settings: {
          activeFrom: fromLocalDateTimeInput(activeFrom),
          activeUntil: fromLocalDateTimeInput(activeUntil),
          scanLimit: scanLimit.trim() !== "" ? Number(scanLimit) : null,
          fallbackUrl: fallbackUrl || null,
          password: password || undefined,
          fbPixelId: fbPixelId || null,
          gaId: gaId || null,
          gtmId: gtmId || null,
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["qr", id] })
      setPassword("")
      setSuccessMsg("Settings saved!")
      setErrorMsg("")
      setTimeout(() => setSuccessMsg(""), 3000)
    },
    onError: (err: Error) => {
      setErrorMsg(err.message)
      setSuccessMsg("")
    },
  })

  const handleSave = () => {
    if (scanLimit.trim() !== "" && Number(scanLimit) < 1) {
      setErrorMsg("Scan limit must be at least 1")
      setSuccessMsg("")
      return
    }
    saveMut.mutate()
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 size={24} className="animate-spin text-zinc-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Link to={`/app/qr/${id}`}>
            <button className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
              <ArrowLeft size={16} />
            </button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-white">QR Settings</h1>
            <p className="text-zinc-500 text-sm">{qr?.name ?? "..."}</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saveMut.isPending} size="sm">
          {saveMut.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Save size={14} className="mr-1.5" />}
          Save Settings
        </Button>
      </div>

      {successMsg && <p className="text-emerald-400 text-sm">{successMsg}</p>}
      {errorMsg && <p className="text-red-400 text-sm">{errorMsg}</p>}

      {/* Scheduling */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Calendar size={15} className="text-violet-400" />Schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {subInfo?.limits.qrExpiry ? (
            <>
              <p className="text-zinc-500 text-xs">Leave blank to keep the QR active indefinitely.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Active From</label>
                  <Input type="datetime-local" value={activeFrom} onChange={e => setActiveFrom(e.target.value)} className="h-9 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">
                    Active Until
                    {subInfo.subscription.currentPeriodEnd && (
                      <span className="text-zinc-600 ml-1">(max {new Date(subInfo.subscription.currentPeriodEnd).toLocaleDateString()})</span>
                    )}
                  </label>
                  <Input
                    type="datetime-local"
                    value={activeUntil}
                    onChange={e => setActiveUntil(e.target.value)}
                    max={subInfo.subscription.currentPeriodEnd.slice(0, 16)}
                    className="h-9 text-sm"
                  />
                </div>
              </div>
            </>
          ) : (
            <p className="text-zinc-500 text-xs">
              Scheduling (active from / active until) is available on STARTER and above.{" "}
              <a href="/app/billing" className="text-violet-400 hover:underline">Upgrade your plan</a> to use this feature.
            </p>
          )}
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Scan Limit (leave blank for unlimited)</label>
            <Input type="number" min={1} placeholder="e.g. 1000" value={scanLimit} onChange={e => setScanLimit(e.target.value)} className="h-9 text-sm w-40" />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Fallback URL (redirect when expired)</label>
            <Input placeholder="https://example.com/fallback" value={fallbackUrl} onChange={e => setFallbackUrl(e.target.value)} className="h-9 text-sm" />
          </div>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Lock size={15} className="text-amber-400" />Password Protection</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-zinc-500 text-xs mb-3">
            {qr?.isPasswordProtected ? "This QR is currently password protected. Enter a new password to change it, or leave blank to keep the current one." : "Leave blank to keep QR public."}
          </p>
          <Input type="password" placeholder="New password (min 4 chars)" value={password} onChange={e => setPassword(e.target.value)} className="h-9 text-sm" autoComplete="new-password" />
        </CardContent>
      </Card>

      {/* Retargeting Pixels */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><BarChart3 size={15} className="text-blue-400" />Retargeting Pixels</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-zinc-500 text-xs">Fired via a trampoline page on each scan before redirecting.</p>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Facebook Pixel ID</label>
            <Input placeholder="e.g. 1234567890" value={fbPixelId} onChange={e => setFbPixelId(e.target.value)} className="h-9 text-sm" />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Google Analytics 4 Measurement ID</label>
            <Input placeholder="e.g. G-XXXXXXXXXX" value={gaId} onChange={e => setGaId(e.target.value)} className="h-9 text-sm" />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Google Tag Manager ID</label>
            <Input placeholder="e.g. GTM-XXXXXXX" value={gtmId} onChange={e => setGtmId(e.target.value)} className="h-9 text-sm" />
          </div>
        </CardContent>
      </Card>

      {/* Quick links */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Advanced Features</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link to={`/app/qr/${id}/smart-routing`}>
            <div className="flex items-center gap-3 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors cursor-pointer">
              <Globe size={18} className="text-violet-400 shrink-0" />
              <div>
                <div className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Smart Routing</div>
                <div className="text-xs text-zinc-500">Device, time, geo rules</div>
              </div>
            </div>
          </Link>
          <Link to={`/app/qr/${id}/ab-test`}>
            <div className="flex items-center gap-3 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors cursor-pointer">
              <FlaskConical size={18} className="text-emerald-400 shrink-0" />
              <div>
                <div className="text-sm font-medium text-zinc-700 dark:text-zinc-200">A/B Testing</div>
                <div className="text-xs text-zinc-500">Split traffic between URLs</div>
              </div>
            </div>
          </Link>
          <Link to={`/app/qr/${id}/analytics`}>
            <div className="flex items-center gap-3 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors cursor-pointer">
              <BarChart3 size={18} className="text-blue-400 shrink-0" />
              <div>
                <div className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Analytics</div>
                <div className="text-xs text-zinc-500">Scans, devices, geo stats</div>
              </div>
            </div>
          </Link>
          <Link to={`/app/qr/${id}`}>
            <div className="flex items-center gap-3 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors cursor-pointer">
              <GitBranch size={18} className="text-amber-400 shrink-0" />
              <div>
                <div className="text-sm font-medium text-zinc-700 dark:text-zinc-200">QR Detail</div>
                <div className="text-xs text-zinc-500">View & edit content</div>
              </div>
            </div>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
