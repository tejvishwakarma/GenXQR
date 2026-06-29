import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, Save, AlertTriangle, CheckCircle2 } from "lucide-react"
import { fetchPlatformSettings, updatePlatformSettings, getTokenRole } from "@/lib/api"

type Settings = Record<string, string>

const SETTING_META: Record<string, { label: string; description: string; type: "toggle" | "number" | "text" | "email" }> = {
  maintenance_mode:   { label: "Maintenance Mode",   description: "Disable all public endpoints and show maintenance page.", type: "toggle" },
  signup_enabled:     { label: "Signups Enabled",    description: "Allow new user registrations.", type: "toggle" },
  static_qr_enabled:  { label: "Static QR Enabled",  description: "Enable the free static QR generator for guests.", type: "toggle" },
  max_qr_per_user:    { label: "Max QRs per User",   description: "Maximum dynamic QR codes a user can create (FREE plan).", type: "number" },
  free_scan_limit:    { label: "Free Scan Limit",    description: "Monthly scan limit for FREE plan users.", type: "number" },
  support_email:      { label: "Support Email",      description: "Email address that receives support ticket notifications.", type: "email" },
}


export default function AdminSettingsPage() {
  const role = getTokenRole()
  const isSuperAdmin = role === "SUPER_ADMIN"
  const qc = useQueryClient()
  const [saved, setSaved] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: fetchPlatformSettings,
  })

  const settings: Settings = data?.data ?? {}
  const [dirty, setDirty] = useState<Settings>({})
  const merged: Settings = { ...settings, ...dirty }

  const mutation = useMutation({
    mutationFn: () => updatePlatformSettings(dirty),
    onSuccess: (res) => {
      qc.setQueryData(["admin", "settings"], res)
      setDirty({})
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  function set(key: string, value: string) {
    setDirty((d) => ({ ...d, [key]: value }))
  }

  const hasDirty = Object.keys(dirty).length > 0

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertTriangle className="text-amber-400" size={40} />
        <p className="text-zinc-400 text-lg">SUPER_ADMIN role required to manage settings.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Platform Settings</h1>
        <p className="text-zinc-500 text-sm">Runtime configuration for the GenXQR platform.</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-red-400 animate-spin" /></div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl divide-y divide-zinc-800">
          {Object.entries(SETTING_META).map(([key, meta]) => {
            const value = merged[key] ?? ""
            const isDirty = key in dirty

            return (
              <div key={key} className={`p-5 flex items-start justify-between gap-6 ${isDirty ? "bg-amber-500/5" : ""}`}>
                <div>
                  <div className="text-zinc-200 text-sm font-medium">{meta.label}</div>
                  <div className="text-zinc-500 text-xs mt-0.5">{meta.description}</div>
                  {isDirty && <span className="text-amber-400 text-xs mt-1 inline-block">unsaved</span>}
                </div>
                <div className="shrink-0">
                  {meta.type === "toggle" ? (
                    <button
                      onClick={() => set(key, value === "true" ? "false" : "true")}
                      className={`relative inline-flex w-11 h-6 rounded-full transition-colors focus:outline-none ${value === "true" ? "bg-red-600" : "bg-zinc-700"}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${value === "true" ? "translate-x-5" : "translate-x-0"}`} />
                    </button>
                  ) : meta.type === "email" || meta.type === "text" ? (
                    <input
                      type={meta.type}
                      value={value}
                      onChange={(e) => set(key, e.target.value)}
                      className="w-56 bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/40"
                    />
                  ) : (
                    <input
                      type="number"
                      value={value}
                      onChange={(e) => set(key, e.target.value)}
                      className="w-24 bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-red-500/40"
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {saved && (
        <div className="flex items-center gap-2 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <p className="text-emerald-300 text-sm">Settings saved successfully!</p>
        </div>
      )}

      {hasDirty && (
        <div className="flex items-center justify-between p-4 bg-zinc-900 border border-amber-500/30 rounded-xl">
          <p className="text-amber-300 text-sm">You have unsaved changes.</p>
          <div className="flex gap-3">
            <button onClick={() => setDirty({})} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition">
              Discard
            </button>
            <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded-xl transition disabled:opacity-50">
              {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Changes
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
