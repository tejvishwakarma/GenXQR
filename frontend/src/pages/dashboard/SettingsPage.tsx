import * as Switch from "@radix-ui/react-switch"
import { useMemo, useState, useEffect, useRef } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { HardDrive, Loader2, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  deleteAccount,
  getDriveStatus,
  getDriveAuthUrl,
  disconnectDrive,
  exportQRsToDrive,
  getNotificationPreferences,
  updateNotificationPreferences,
  getCurrentUser,
  uploadAvatar,
  removeAvatar,
  type NotificationPreferences,
  ApiError,
} from "@/lib/api"

const NOTIFICATION_ITEMS: Array<{ key: keyof NotificationPreferences; label: string; desc: string }> = [
  { key: "scanMilestoneAlerts", label: "Scan milestone alerts", desc: "Get notified when your QR reaches 100, 1K, 10K scans" },
  { key: "weeklyAnalyticsDigest", label: "Weekly analytics digest", desc: "A summary email every Monday morning" },
  { key: "billingReminders", label: "Billing reminders", desc: "7-day and 1-day notice before renewal" },
  { key: "productUpdates", label: "Product updates", desc: "New features and announcements" },
]

export default function SettingsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const qc = useQueryClient()
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletePassword, setDeletePassword] = useState("")
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [driveFlash, setDriveFlash] = useState<"connected" | "error" | null>(null)
  const [notificationFlash, setNotificationFlash] = useState<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [avatarUploadState, setAvatarUploadState] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null })

  // handle OAuth callback query params
  useEffect(() => {
    const drive = searchParams.get("drive")
    if (drive === "connected" || drive === "error") {
      setDriveFlash(drive)
      setSearchParams({}, { replace: true })
      void qc.invalidateQueries({ queryKey: ["drive-status"] })
      const t = setTimeout(() => setDriveFlash(null), 5000)
      return () => clearTimeout(t)
    }
  }, [searchParams, setSearchParams, qc])

  async function handleDeleteAccount() {
    setDeleteError(null)
    setDeleteLoading(true)
    try {
      await deleteAccount(deletePassword)
      localStorage.removeItem("access_token")
      localStorage.removeItem("user")
      navigate("/", { replace: true })
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
    } finally {
      setDeleteLoading(false)
    }
  }

  const { data: driveData, isLoading: driveLoading } = useQuery({
    queryKey: ["drive-status"],
    queryFn: getDriveStatus,
    retry: false,
  })
  const driveConnected = driveData?.data?.connected ?? false

  const { data: notificationData, isLoading: notificationLoading } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: getNotificationPreferences,
  })

  const notificationMut = useMutation({
    mutationFn: updateNotificationPreferences,
    onSuccess: (res) => {
      qc.setQueryData(["notification-preferences"], res)
      setNotificationFlash(res.message ?? "Notification preferences updated")
      window.setTimeout(() => setNotificationFlash(null), 3000)
    },
    onError: (err) => {
      setNotificationFlash(err instanceof Error ? err.message : "Failed to update notification preferences")
      window.setTimeout(() => setNotificationFlash(null), 3000)
    },
  })

  const connectDriveMut = useMutation({
    mutationFn: getDriveAuthUrl,
    onSuccess: (res) => { window.location.href = res.data.url },
  })

  const disconnectDriveMut = useMutation({
    mutationFn: disconnectDrive,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["drive-status"] }),
  })

  const exportDriveMut = useMutation({
    mutationFn: () => exportQRsToDrive(),
  })

  const user = useMemo(() => {
    try {
      const raw = localStorage.getItem("user")
      if (!raw) return { name: "", email: "" }
      const u = JSON.parse(raw) as { name?: string; email?: string; avatarUrl?: string | null }
      const parts = (u.name ?? "").split(" ")
      return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" "), email: u.email ?? "", initial: (parts[0]?.[0] ?? "U").toUpperCase(), avatarUrl: u.avatarUrl ?? null }
    } catch {
      return { firstName: "", lastName: "", email: "", initial: "U", avatarUrl: null }
    }
  }, [])

  const { data: sessionUserData } = useQuery({
    queryKey: ["session-user"],
    queryFn: getCurrentUser,
    staleTime: 30_000,
  })

  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatarUrl ?? null)
  const [avatarErrored, setAvatarErrored] = useState(false)

  useEffect(() => {
    const serverUrl = sessionUserData?.data?.avatarUrl
    if (serverUrl !== undefined) setAvatarUrl(serverUrl ?? null)
  }, [sessionUserData?.data?.avatarUrl])

  // Fall back to the initial if the avatar image fails to load; retry on change.
  useEffect(() => { setAvatarErrored(false) }, [avatarUrl])

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    setAvatarUploadState({ loading: true, error: null })
    try {
      const { avatarUrl: newUrl } = await uploadAvatar(file)
      setAvatarUrl(newUrl)
      try {
        const raw = localStorage.getItem("user")
        if (raw) localStorage.setItem("user", JSON.stringify({ ...JSON.parse(raw), avatarUrl: newUrl }))
      } catch { /* ignore */ }
      void qc.invalidateQueries({ queryKey: ["session-user"] })
      setAvatarUploadState({ loading: false, error: null })
    } catch (err) {
      setAvatarUploadState({ loading: false, error: err instanceof ApiError ? err.message : "Upload failed" })
    }
  }

  async function handleRemoveAvatar() {
    setAvatarUploadState({ loading: true, error: null })
    try {
      await removeAvatar()
      setAvatarUrl(null)
      try {
        const raw = localStorage.getItem("user")
        if (raw) localStorage.setItem("user", JSON.stringify({ ...JSON.parse(raw), avatarUrl: null }))
      } catch { /* ignore */ }
      void qc.invalidateQueries({ queryKey: ["session-user"] })
      setAvatarUploadState({ loading: false, error: null })
    } catch (err) {
      setAvatarUploadState({ loading: false, error: err instanceof ApiError ? err.message : "Failed to remove avatar" })
    }
  }

  const notifications = notificationData?.data.notifications

  function handleNotificationToggle(key: keyof NotificationPreferences, checked: boolean) {
    if (!notifications) return
    notificationMut.mutate({
      ...notifications,
      [key]: checked,
    })
  }

  return (
    <div className="space-y-8 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">Account Settings</h1>
        <p className="text-zinc-500 text-sm mt-1">Manage your profile, password, and preferences.</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader><CardTitle className="text-base">Profile</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-5 mb-6">
              <div className="relative w-16 h-16 rounded-2xl overflow-hidden bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-400 text-2xl font-bold shrink-0">
                {avatarUrl && !avatarErrored
                  ? <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" onError={() => setAvatarErrored(true)} />
                  : user.initial
                }
                {avatarUploadState.loading && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Loader2 size={20} className="animate-spin text-white" />
                  </div>
                )}
              </div>
              <div className="flex flex-col items-start gap-1">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploadState.loading}
                  className="text-sm text-violet-400 hover:text-violet-300 transition-colors disabled:opacity-50 text-left"
                >
                  {avatarUploadState.loading ? "Uploading…" : "Change avatar"}
                </button>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    disabled={avatarUploadState.loading}
                    className="text-sm text-red-400 hover:text-red-300 transition-colors disabled:opacity-50 text-left"
                  >
                    Remove avatar
                  </button>
                )}
                <p className="text-zinc-500 text-xs">JPEG, PNG, WebP or GIF · max 2 MB</p>
                {avatarUploadState.error && <p className="text-red-400 text-xs">{avatarUploadState.error}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label-text">First Name</label>
                <Input defaultValue={user.firstName} />
              </div>
              <div>
                <label className="label-text">Last Name</label>
                <Input defaultValue={user.lastName} />
              </div>
            </div>
            <div>
              <label className="label-text">Email</label>
              <Input type="email" defaultValue={user.email} />
            </div>
            <div>
              <label className="label-text">Company (optional)</label>
              <Input placeholder="Acme Corp" />
            </div>
            <Button>Save changes</Button>
          </div>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader><CardTitle className="text-base">Change Password</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-4 max-w-sm">
            <div>
              <label className="label-text">Current password</label>
              <Input type="password" placeholder="••••••••" />
            </div>
            <div>
              <label className="label-text">New password</label>
              <Input type="password" placeholder="Min 8 characters" />
            </div>
            <div>
              <label className="label-text">Confirm new password</label>
              <Input type="password" placeholder="••••••••" />
            </div>
            <Button>Update password</Button>
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader><CardTitle className="text-base">Notifications</CardTitle></CardHeader>
        <CardContent>
          {notificationFlash && (
            <div className={`mb-4 rounded-xl border px-3 py-2 text-sm ${notificationMut.isError ? "border-red-500/20 bg-red-500/10 text-red-400" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"}`}>
              {notificationFlash}
            </div>
          )}
          <div className="space-y-4">
            {NOTIFICATION_ITEMS.map((item) => (
              <div key={item.label} className="flex items-center justify-between py-3 border-b border-zinc-200 dark:border-zinc-800 last:border-0">
                <div>
                  <div className="text-zinc-800 dark:text-zinc-200 text-sm font-medium">{item.label}</div>
                  <div className="text-zinc-500 text-xs mt-0.5">{item.desc}</div>
                </div>
                <Switch.Root 
                  className="w-10 h-6 bg-zinc-300 dark:bg-zinc-800 rounded-full relative shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-950 data-[state=checked]:bg-violet-600 transition-colors cursor-pointer"
                  checked={notifications?.[item.key] ?? true}
                  disabled={notificationLoading || notificationMut.isPending}
                  onCheckedChange={(checked) => handleNotificationToggle(item.key, checked)}
                >
                  <Switch.Thumb className="block w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-150 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-[18px]" />
                </Switch.Root>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Google Drive */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <HardDrive size={16} className="text-violet-400" />
            Google Drive Export
          </CardTitle>
        </CardHeader>
        <CardContent>
          {driveFlash === "connected" && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <CheckCircle2 size={16} className="text-emerald-400" />
              <span className="text-emerald-400 text-sm">Google Drive connected successfully.</span>
            </div>
          )}
          {driveFlash === "error" && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
              Failed to connect Google Drive. Please try again.
            </div>
          )}
          {driveLoading ? (
            <div className="flex items-center gap-2 text-zinc-500 text-sm"><Loader2 size={16} className="animate-spin" /> Checking…</div>
          ) : driveConnected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-zinc-700 dark:text-zinc-300 text-sm">Connected</span>
              </div>
              <p className="text-zinc-500 text-xs">QR codes will be exported as JSON files to a "GenXQR Exports" folder in your Drive.</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => exportDriveMut.mutate()}
                  disabled={exportDriveMut.isPending}
                >
                  {exportDriveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <HardDrive size={14} />}
                  Export All QRs to Drive
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (window.confirm("Disconnect Google Drive?")) disconnectDriveMut.mutate()
                  }}
                  disabled={disconnectDriveMut.isPending}
                >
                  Disconnect
                </Button>
              </div>
              {exportDriveMut.isSuccess && (
                <p className="text-emerald-400 text-xs">{(exportDriveMut.data as { data: unknown[] }).data?.length ?? 0} files exported to Drive.</p>
              )}
              {exportDriveMut.error && (
                <p className="text-red-400 text-xs">
                  {exportDriveMut.error instanceof Error ? exportDriveMut.error.message : "Export failed"}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-zinc-600 dark:text-zinc-400 text-sm">Connect your Google Drive to export QR codes directly to your Drive folder.</p>
              <Button
                onClick={() => connectDriveMut.mutate()}
                disabled={connectDriveMut.isPending}
              >
                {connectDriveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <HardDrive size={14} />}
                Connect Google Drive
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-500/20">
        <CardHeader><CardTitle className="text-base text-red-400">Danger Zone</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="text-zinc-900 dark:text-white text-sm font-medium">Delete account</div>
              <div className="text-zinc-500 text-xs mt-0.5">Permanently delete your account and all QR codes. Cannot be undone.</div>
            </div>
            <Button variant="destructive" size="sm" onClick={() => { setShowDeleteModal(true); setDeletePassword(""); setDeleteError(null) }}>
              Delete account
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete Account Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDeleteModal(false)} />
          <div className="relative w-full max-w-md glass-card rounded-2xl p-8 shadow-2xl">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-1">Delete your account?</h2>
            <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-6">
              This will permanently delete your account, all QR codes, analytics, and billing data.
              <span className="text-red-400 font-medium"> This cannot be undone.</span>
            </p>
            <div className="mb-4">
              <label className="label-text">Confirm your password</label>
              <Input
                type="password"
                placeholder="Enter your password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !deleteLoading && handleDeleteAccount()}
                autoFocus
              />
            </div>
            {deleteError && (
              <p className="text-red-400 text-sm mb-4">{deleteError}</p>
            )}
            <div className="flex gap-3">
              <Button
                variant="destructive"
                className="flex-1"
                disabled={deleteLoading || !deletePassword}
                onClick={handleDeleteAccount}
              >
                {deleteLoading ? "Deleting..." : "Yes, delete my account"}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                disabled={deleteLoading}
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
