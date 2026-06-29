import { useParams, Link, useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft, Loader2, Shield, Trash2, UserCheck,
  QrCode, Key, Mail, Calendar, Clock, Lock, BellRing, CheckCircle,
} from "lucide-react"
import { useState } from "react"
import {
  fetchAdminUser,
  updateAdminUser,
  deleteAdminUser,
  impersonateUser,
  changeAdminUserPlan,
  changeAdminUserPassword,
  verifyAdminUserEmail,
  sendUserPaymentReminder,
  getTokenRole,
  startImpersonationSession,
  type AdminPlanName,
  type AuthUser,
} from "@/lib/api"

const statusBadge: Record<string, string> = {
  ACTIVE:    "bg-emerald-500/20 text-emerald-400",
  TRIALING:  "bg-blue-500/20 text-blue-400",
  EXPIRED:   "bg-orange-500/20 text-orange-400",
  CANCELLED: "bg-zinc-700 text-zinc-400",
  PAST_DUE:  "bg-red-500/20 text-red-400",
  PAUSED:    "bg-amber-500/20 text-amber-400",
}

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const isSuperAdmin = getTokenRole() === "SUPER_ADMIN"

  const [editRole, setEditRole] = useState<string | null>(null)
  const [editPlan, setEditPlan] = useState<AdminPlanName | null>(null)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [passwordError, setPasswordError] = useState("")
  const [passwordSuccess, setPasswordSuccess] = useState("")
  const [reminderSuccess, setReminderSuccess] = useState("")

  const toAuthUserRole = (role: string): AuthUser["role"] => {
    if (role === "ADMIN" || role === "SUPER_ADMIN") return role
    return "USER"
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "user", id],
    queryFn: () => fetchAdminUser(id!),
    enabled: !!id,
  })

  const updateMut = useMutation({
    mutationFn: (role: string) => updateAdminUser(id!, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "user", id] })
      setEditRole(null)
    },
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteAdminUser(id!),
    onSuccess: () => {
      // Navigate to Abuse → Blocklist pre-filtered to this user's email so the
      // admin can unblock them if they change their mind.
      const email = data?.data?.email ?? ""
      const params = new URLSearchParams({ tab: "blocklist", type: "email", q: email })
      navigate(`/admin/abuse?${params.toString()}`, { replace: true })
    },
  })

  const impersonateMut = useMutation({
    mutationFn: () => impersonateUser(id!),
    onSuccess: (res) => {
      const currentUser = data?.data
      if (!currentUser) return
      const targetUser: AuthUser = {
        id: currentUser.id,
        email: currentUser.email,
        name: currentUser.name,
        role: toAuthUserRole(currentUser.role),
      }
      startImpersonationSession({
        token: res.data.token,
        targetUser,
        expiresInSeconds: res.data.expiresInSeconds,
      })
      navigate("/app/dashboard", { replace: true })
    },
  })

  const changePlanMut = useMutation({
    mutationFn: (planName: AdminPlanName) => changeAdminUserPlan(id!, planName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "user", id] })
      setEditPlan(null)
    },
  })

  const verifyEmailMut = useMutation({
    mutationFn: () => verifyAdminUserEmail(id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "user", id] }),
  })

  const changePasswordMut = useMutation({
    mutationFn: (password: string) => changeAdminUserPassword(id!, password),
    onSuccess: () => {
      setPasswordSuccess("Password updated successfully")
      setNewPassword("")
      setShowPasswordForm(false)
      setPasswordError("")
    },
    onError: (err: Error) => {
      setPasswordError(err.message || "Failed to update password")
    },
  })

  const sendReminderMut = useMutation({
    mutationFn: () => sendUserPaymentReminder(id!),
    onSuccess: (res) => {
      setReminderSuccess(res.message ?? "Reminder sent")
      setTimeout(() => setReminderSuccess(""), 4000)
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <Loader2 className="w-7 h-7 text-red-400 animate-spin" />
      </div>
    )
  }

  if (error || !data?.data) {
    return (
      <div className="text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm">
        User not found or failed to load.
      </div>
    )
  }

  const u = data.data
  const sub = u.subscription
  const now = new Date()
  // Mirror the getUserPlanLimits trial-expiry logic so admin view matches user billing view
  const trialExpired = sub?.status === "TRIALING" && !!sub.trialEndsAt && new Date(sub.trialEndsAt) < now
  const displayStatus    = !sub ? "" : trialExpired ? "EXPIRED" : sub.status
  const displayPlanName  = !sub ? "" : trialExpired ? "Free" : sub.plan.displayName
  const periodLabel      = sub?.status === "TRIALING" ? (trialExpired ? "Trial ended" : "Trial ends") : "Period end"
  const periodDate       = sub?.status === "TRIALING" ? sub.trialEndsAt : sub?.currentPeriodEnd ?? null

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link to="/admin/users" className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white">{u.name}</h1>
          <p className="text-zinc-500 text-sm">{u.email}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Details */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest">Account</h2>
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-zinc-400 flex-wrap">
              <Mail size={14} /> <span className="text-zinc-200">{u.email}</span>
              {u.emailVerified
                ? <span className="text-emerald-400 text-xs">✓ Verified</span>
                : isSuperAdmin && (
                  <button
                    onClick={() => verifyEmailMut.mutate()}
                    disabled={verifyEmailMut.isPending}
                    className="flex items-center gap-1 px-2 py-0.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 text-xs rounded-lg transition"
                  >
                    {verifyEmailMut.isPending ? <Loader2 size={10} className="animate-spin" /> : null}
                    Verify Now
                  </button>
                )
              }
            </div>
            <div className="flex items-center gap-2 text-zinc-400">
              <Shield size={14} /> Role: <span className="text-zinc-200">{u.role}</span>
              {u.googleId && <span className="text-blue-400 text-xs">(Google)</span>}
            </div>
            <div className="flex items-center gap-2 text-zinc-400">
              <Calendar size={14} /> Joined {new Date(u.createdAt).toLocaleDateString()}
            </div>
            {u.lastLoginAt && (
              <div className="flex items-center gap-2 text-zinc-400">
                <Clock size={14} /> Last login {new Date(u.lastLoginAt).toLocaleDateString()}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-1 text-sm">
            <div className="bg-zinc-800 rounded-xl px-3 py-2 flex items-center gap-2 text-zinc-300">
              <QrCode size={14} className="text-violet-400" /> {u._count.qrCodes} QR Codes
            </div>
            <div className="bg-zinc-800 rounded-xl px-3 py-2 flex items-center gap-2 text-zinc-300">
              <Key size={14} className="text-amber-400" /> {u._count.apiKeys} API Keys
            </div>
          </div>
        </div>

        {/* Subscription */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest">Subscription</h2>
          {u.subscription ? (
            <div className="space-y-2 text-sm text-zinc-400">
              <div className="flex items-center justify-between">
                <span>Plan</span>
                <span className="text-white font-medium">{displayPlanName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Status</span>
                <span className={`px-2 py-0.5 rounded-full text-xs ${statusBadge[displayStatus] ?? ""}`}>
                  {displayStatus}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>{periodLabel}</span>
                <span>{periodDate ? new Date(periodDate).toLocaleDateString() : "—"}</span>
              </div>

              {isSuperAdmin && (
                <div className="pt-3 flex items-center gap-2 flex-wrap">
                  {editPlan === null ? (
                    <button
                      onClick={() => setEditPlan((u.subscription?.plan.name as AdminPlanName) ?? "FREE")}
                      className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded-xl transition"
                    >
                      Change Plan
                    </button>
                  ) : (
                    <>
                      <select
                        value={editPlan}
                        onChange={(e) => setEditPlan(e.target.value as AdminPlanName)}
                        className="bg-zinc-800 border border-zinc-700 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                      >
                        <option value="FREE">FREE</option>
                        <option value="STARTER">STARTER</option>
                        <option value="PRO">PRO</option>
                        <option value="BUSINESS">BUSINESS</option>
                        <option value="ENTERPRISE">ENTERPRISE</option>
                      </select>
                      <button
                        onClick={() => changePlanMut.mutate(editPlan)}
                        disabled={changePlanMut.isPending || editPlan === (u.subscription?.plan.name as AdminPlanName)}
                        className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs rounded-xl transition flex items-center gap-1.5"
                      >
                        {changePlanMut.isPending && <Loader2 size={12} className="animate-spin" />}
                        Save Plan
                      </button>
                      <button
                        onClick={() => setEditPlan(null)}
                        className="px-2 py-1.5 text-zinc-400 hover:text-white text-xs transition"
                      >
                        Cancel
                      </button>
                    </>
                  )}

                  {/* Send payment reminder */}
                  {editPlan === null && (
                    <button
                      onClick={() => sendReminderMut.mutate()}
                      disabled={sendReminderMut.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 text-amber-400 text-xs rounded-xl transition disabled:opacity-50"
                    >
                      {sendReminderMut.isPending
                        ? <Loader2 size={12} className="animate-spin" />
                        : <BellRing size={12} />}
                      Send Reminder
                    </button>
                  )}
                </div>
              )}

              {/* Success / error feedback */}
              {reminderSuccess && (
                <div className="flex items-center gap-1.5 text-emerald-400 text-xs pt-1">
                  <CheckCircle size={12} /> {reminderSuccess}
                </div>
              )}
              {sendReminderMut.isError && (
                <div className="text-red-400 text-xs pt-1">
                  {(sendReminderMut.error as Error).message}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-zinc-500 text-sm">No active subscription.</p>
              {isSuperAdmin && (
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={editPlan ?? "FREE"}
                    onChange={(e) => setEditPlan(e.target.value as AdminPlanName)}
                    className="bg-zinc-800 border border-zinc-700 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                  >
                    <option value="FREE">FREE</option>
                    <option value="STARTER">STARTER</option>
                    <option value="PRO">PRO</option>
                    <option value="BUSINESS">BUSINESS</option>
                    <option value="ENTERPRISE">ENTERPRISE</option>
                  </select>
                  <button
                    onClick={() => changePlanMut.mutate((editPlan ?? "FREE") as AdminPlanName)}
                    disabled={changePlanMut.isPending}
                    className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs rounded-xl transition flex items-center gap-1.5"
                  >
                    {changePlanMut.isPending && <Loader2 size={12} className="animate-spin" />}
                    Set Plan
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Role management */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest">Role Management</h2>
        <div className="flex items-center gap-3 flex-wrap">
          {editRole === null ? (
            <button
              onClick={() => setEditRole(u.role)}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-xl transition"
            >
              Change Role
            </button>
          ) : (
            <>
              <select
                value={editRole}
                onChange={(e) => setEditRole(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/40"
              >
                <option value="USER">USER</option>
                <option value="ADMIN">ADMIN</option>
                {isSuperAdmin && <option value="SUPER_ADMIN">SUPER_ADMIN</option>}
              </select>
              <button
                onClick={() => updateMut.mutate(editRole)}
                disabled={updateMut.isPending || editRole === u.role}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm rounded-xl transition flex items-center gap-2"
              >
                {updateMut.isPending && <Loader2 size={14} className="animate-spin" />}
                Save
              </button>
              <button onClick={() => setEditRole(null)} className="px-3 py-2 text-zinc-400 hover:text-white text-sm transition">
                Cancel
              </button>
            </>
          )}

          {isSuperAdmin && (
            <button
              onClick={() => impersonateMut.mutate()}
              disabled={impersonateMut.isPending}
              className="px-4 py-2 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 text-amber-400 text-sm rounded-xl transition flex items-center gap-2"
            >
              {impersonateMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
              Impersonate
            </button>
          )}

          <button
            onClick={() => {
              if (window.confirm(`Permanently delete ${u.name}? All their data will be removed.`)) {
                deleteMut.mutate()
              }
            }}
            disabled={deleteMut.isPending}
            className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-sm rounded-xl transition flex items-center gap-2"
          >
            {deleteMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Delete User
          </button>
        </div>

      </div>

      {/* Password Change — SUPER_ADMIN only */}
      {isSuperAdmin && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest">Security</h2>

          {passwordSuccess && !showPasswordForm && (
            <p className="text-emerald-400 text-xs">{passwordSuccess}</p>
          )}

          {!showPasswordForm ? (
            <button
              onClick={() => { setShowPasswordForm(true); setPasswordSuccess(""); setPasswordError("") }}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-xl transition"
            >
              <Lock size={14} /> Change Password
            </button>
          ) : (
            <div className="flex flex-col gap-3 max-w-sm">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (min. 8 characters)"
                className="bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500/40 placeholder:text-zinc-500"
              />
              {passwordError && <p className="text-red-400 text-xs">{passwordError}</p>}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setPasswordError("")
                    if (newPassword.length < 8) { setPasswordError("Password must be at least 8 characters"); return }
                    changePasswordMut.mutate(newPassword)
                  }}
                  disabled={changePasswordMut.isPending || !newPassword}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm rounded-xl transition flex items-center gap-2"
                >
                  {changePasswordMut.isPending && <Loader2 size={14} className="animate-spin" />}
                  Save Password
                </button>
                <button
                  onClick={() => { setShowPasswordForm(false); setNewPassword(""); setPasswordError("") }}
                  className="px-3 py-2 text-zinc-400 hover:text-white text-sm transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recent Invoices */}
      {u.invoices.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest">Recent Invoices</h2>
          <div className="space-y-2">
            {u.invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between text-sm py-1.5 border-b border-zinc-800 last:border-0">
                <div className="text-zinc-400">{new Date(inv.createdAt).toLocaleDateString()}</div>
                <div className="text-zinc-300">{inv.planName}</div>
                <div className="text-zinc-200 font-medium">
                  {inv.currency} {(inv.amount / 100).toFixed(2)}
                </div>
                <div className={`px-2 py-0.5 rounded-full text-xs ${inv.status === "paid" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                  {inv.status}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
