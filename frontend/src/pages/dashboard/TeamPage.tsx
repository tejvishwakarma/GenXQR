import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Users, Mail, Crown, Shield, Eye, Trash2, Plus, Send, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  getTeamOverview,
  sendTeamInvite,
  resendTeamInvite,
  cancelTeamInvite,
  removeTeamMember,
  type TeamRole,
} from "@/lib/api"

const roleConfig = {
  admin: { label: "Admin", icon: <Crown size={12} />, color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  editor: { label: "Editor", icon: <Shield size={12} />, color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  viewer: { label: "Viewer", icon: <Eye size={12} />, color: "text-zinc-500 bg-zinc-100 border-zinc-200 dark:text-zinc-400 dark:bg-zinc-800 dark:border-zinc-700" },
}

export default function TeamPage() {
  const qc = useQueryClient()
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<TeamRole>("editor")
  const [flash, setFlash] = useState<{ kind: "success" | "error"; text: string } | null>(null)
  const [resendingIds, setResendingIds] = useState<Set<string>>(new Set())
  const [cancellingIds, setCancellingIds] = useState<Set<string>>(new Set())
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery({
    queryKey: ["team-overview"],
    queryFn: getTeamOverview,
  })

  const inviteMut = useMutation({
    mutationFn: (payload: { email: string; role: TeamRole }) => sendTeamInvite(payload.email, payload.role),
    onSuccess: (res) => {
      setEmail("")
      setFlash({ kind: "success", text: res.message ?? "Invitation sent successfully" })
      void qc.invalidateQueries({ queryKey: ["team-overview"] })
      window.setTimeout(() => setFlash(null), 3000)
    },
    onError: (err) => {
      setFlash({ kind: "error", text: err instanceof Error ? err.message : "Failed to send invite" })
      window.setTimeout(() => setFlash(null), 3000)
    },
  })

  const resendMut = useMutation({
    mutationFn: (inviteId: string) => resendTeamInvite(inviteId),
    onMutate: (inviteId) => setResendingIds((prev) => new Set(prev).add(inviteId)),
    onSettled: (_, __, inviteId) => setResendingIds((prev) => { const s = new Set(prev); s.delete(inviteId); return s }),
    onSuccess: (res) => {
      setFlash({ kind: "success", text: res.message ?? "Invite resent" })
      void qc.invalidateQueries({ queryKey: ["team-overview"] })
      window.setTimeout(() => setFlash(null), 3000)
    },
    onError: (err) => {
      setFlash({ kind: "error", text: err instanceof Error ? err.message : "Failed to resend invite" })
      window.setTimeout(() => setFlash(null), 3000)
    },
  })

  const cancelMut = useMutation({
    mutationFn: (inviteId: string) => cancelTeamInvite(inviteId),
    onMutate: (inviteId) => setCancellingIds((prev) => new Set(prev).add(inviteId)),
    onSettled: (_, __, inviteId) => setCancellingIds((prev) => { const s = new Set(prev); s.delete(inviteId); return s }),
    onSuccess: (res) => {
      setFlash({ kind: "success", text: res.message ?? "Invite cancelled" })
      void qc.invalidateQueries({ queryKey: ["team-overview"] })
      window.setTimeout(() => setFlash(null), 3000)
    },
    onError: (err) => {
      setFlash({ kind: "error", text: err instanceof Error ? err.message : "Failed to cancel invite" })
      window.setTimeout(() => setFlash(null), 3000)
    },
  })

  const removeMut = useMutation({
    mutationFn: (userId: string) => removeTeamMember(userId),
    onMutate: (userId) => setRemovingIds((prev) => new Set(prev).add(userId)),
    onSettled: (_, __, userId) => setRemovingIds((prev) => { const s = new Set(prev); s.delete(userId); return s }),
    onSuccess: (res) => {
      setFlash({ kind: "success", text: res.message ?? "Member removed" })
      void qc.invalidateQueries({ queryKey: ["team-overview"] })
      window.setTimeout(() => setFlash(null), 3000)
    },
    onError: (err) => {
      setFlash({ kind: "error", text: err instanceof Error ? err.message : "Failed to remove member" })
      window.setTimeout(() => setFlash(null), 3000)
    },
  })

  const members = data?.data.members ?? []
  const pendingInvites = data?.data.pendingInvites ?? []
  const seats = data?.data.seats ?? { used: members.length, limit: 1 }
  const seatProgress = seats.limit > 0 ? Math.min(100, Math.round((seats.used / seats.limit) * 100)) : 0

  // Identify the current logged-in user so we can hide the remove button only for ourselves
  const currentUserId = (() => {
    try { return (JSON.parse(localStorage.getItem("user") ?? "") as { id?: string }).id ?? "" }
    catch { return "" }
  })()



  const formatRelative = (iso: string) => {
    const diffMs = Date.now() - new Date(iso).getTime()
    const diffHours = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60)))
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`
    const days = Math.floor(diffHours / 24)
    return `${days} day${days === 1 ? "" : "s"} ago`
  }

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    inviteMut.mutate({ email: email.trim(), role })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64 text-zinc-500">
        <Loader2 size={18} className="animate-spin mr-2" /> Loading team…
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-fade-in max-w-4xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">Team</h1>
        <p className="text-zinc-500 text-sm mt-1">Invite team members and manage their access levels.</p>
      </div>

      {/* Invite Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus size={16} className="text-violet-400" />
            Invite Team Member
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                type="email"
                placeholder="colleague@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Select value={role} onValueChange={(value) => setRole(value as TeamRole)}>
              <SelectTrigger className="sm:w-40 rounded-xl h-10 px-4 text-sm">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" disabled={!email || inviteMut.isPending}>
              {inviteMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Send Invite
            </Button>
          </form>
          {flash && (
            <p className={cn("text-sm mt-3 flex items-center gap-2", flash.kind === "success" ? "text-emerald-400" : "text-red-400")}>
              <Mail size={14} />
              {flash.text}
            </p>
          )}
          {/* Role descriptions */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {Object.entries(roleConfig).map(([key, cfg]) => (
              <div key={key} className="p-3 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <div className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border mb-2", cfg.color)}>
                  {cfg.icon} {cfg.label}
                </div>
                <p className="text-zinc-500 text-xs leading-relaxed">
                  {key === "admin" && "Full access: create, edit, delete, and manage team."}
                  {key === "editor" && "Can create and edit QR codes, view analytics."}
                  {key === "viewer" && "Read-only access to QR codes and analytics."}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Members Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users size={16} className="text-violet-400" />
            Members ({members.length} / {seats.limit})
          </CardTitle>
          <div className="h-1.5 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-violet-600 rounded-full" style={{ width: `${seatProgress}%` }} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {members.length === 0 && (
            <div className="px-6 py-5 text-zinc-500 text-sm">No team members yet.</div>
          )}
          {members.map((member, i) => {
            const cfg = roleConfig[member.role as keyof typeof roleConfig]
            const avatar = member.name.charAt(0).toUpperCase()
            return (
              <div
                key={member.id}
                className={cn("px-6 py-4 flex items-center gap-4 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors", i < members.length - 1 && "border-b border-zinc-200 dark:border-zinc-800")}
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-400 font-semibold shrink-0">
                  {avatar}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-900 dark:text-white text-sm font-medium">{member.name}</span>
                    {member.role === "admin" && <Crown size={13} className="text-amber-400" />}
                  </div>
                  <div className="text-zinc-500 text-xs">{member.email}</div>
                </div>
                {/* Role */}
                <div className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border shrink-0", cfg.color)}>
                  {cfg.icon} {cfg.label}
                </div>
                {/* Last active */}
                <div className="hidden lg:block text-right shrink-0">
                  <div className="text-zinc-500 text-xs">Last active</div>
                  <div className="text-zinc-700 dark:text-zinc-300 text-xs">{member.lastActive ? formatRelative(member.lastActive) : "—"}</div>
                </div>
                {/* Remove button — shown for every member except the current user (owner) */}
                {member.id !== currentUserId && (
                  <button
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors ml-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    disabled={removingIds.has(member.id)}
                    onClick={() => {
                      if (window.confirm(`Remove ${member.name} from the team?`)) {
                        removeMut.mutate(member.id)
                      }
                    }}
                    title="Remove member"
                  >
                    {removingIds.has(member.id) ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Pending invites */}
      <Card>
        <CardHeader><CardTitle className="text-base">Pending Invites</CardTitle></CardHeader>
        <CardContent>
          {pendingInvites.length === 0 && (
            <p className="text-zinc-500 text-sm">No pending invites.</p>
          )}

          <div className="space-y-2">
            {pendingInvites.map((invite) => (
              <div key={invite.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 py-2 border-b border-zinc-100 dark:border-zinc-800/50 last:border-0">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-500 shrink-0">
                    <Mail size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-zinc-700 dark:text-zinc-300 text-sm truncate">{invite.email}</div>
                    <div className="text-zinc-600 text-xs">Invited as {roleConfig[invite.role].label} · {formatRelative(invite.invitedAt)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 pl-[52px] sm:pl-0">
                  <Badge variant="warning">Pending</Badge>
                  <button
                    className="text-xs text-zinc-500 hover:text-violet-400 transition-colors disabled:opacity-50"
                    onClick={() => resendMut.mutate(invite.id)}
                    disabled={resendingIds.has(invite.id) || cancellingIds.has(invite.id)}
                  >
                    {resendingIds.has(invite.id) ? "Resending…" : "Resend"}
                  </button>
                  <button
                    className="text-xs text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-50"
                    onClick={() => cancelMut.mutate(invite.id)}
                    disabled={cancellingIds.has(invite.id) || resendingIds.has(invite.id)}
                  >
                    {cancellingIds.has(invite.id) ? "Cancelling…" : "Cancel"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {seats.limit > 0 && (
            <p className="text-zinc-500 text-xs mt-4">Seats used: {seats.used} / {seats.limit}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
