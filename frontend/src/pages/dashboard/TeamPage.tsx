import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Users, Mail, Crown, Shield, Eye, Trash2, Plus, Send, Loader2, KeyRound, LogOut, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useWorkspace } from "@/hooks/useWorkspace"
import {
  getTeamOverview,
  sendTeamInvite,
  resendTeamInvite,
  cancelTeamInvite,
  changeTeamMemberRole,
  removeTeamMember,
  leaveTeam,
  type TeamRole,
} from "@/lib/api"

const roleConfig = {
  owner: { label: "Owner", icon: <KeyRound size={12} />, color: "text-violet-500 bg-violet-500/10 border-violet-500/20 dark:text-violet-400" },
  admin: { label: "Admin", icon: <Crown size={12} />, color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  editor: { label: "Editor", icon: <Shield size={12} />, color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  viewer: { label: "Viewer", icon: <Eye size={12} />, color: "text-zinc-500 bg-zinc-100 border-zinc-200 dark:text-zinc-400 dark:bg-zinc-800 dark:border-zinc-700" },
}

// What each role can actually do — mirrors backend workspace.service.ts PERMISSIONS.
const ROLE_DESCRIPTIONS: Record<keyof typeof roleConfig, string> = {
  owner: "Full access, including billing.",
  admin: "Create, edit, switch on/off and delete the owner's QR codes, view analytics, and manage team members and invites. No billing access.",
  editor: "Create, edit and switch on/off the owner's QR codes and view analytics. Cannot delete codes or manage the team.",
  viewer: "View the owner's QR codes and analytics. Cannot make changes.",
}

const TEAM_QUERY_KEY = ["team-overview"]

export default function TeamPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { can, isPersonal, current, switchTo } = useWorkspace()
  const canManage = can("team:manage")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<TeamRole>("editor")
  const [flash, setFlash] = useState<{ kind: "success" | "error"; text: string } | null>(null)
  const [resendingIds, setResendingIds] = useState<Set<string>>(new Set())
  const [cancellingIds, setCancellingIds] = useState<Set<string>>(new Set())
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set())
  const [roleChangingIds, setRoleChangingIds] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery({
    queryKey: TEAM_QUERY_KEY,
    queryFn: getTeamOverview,
  })

  const showFlash = (kind: "success" | "error", text: string) => {
    setFlash({ kind, text })
    window.setTimeout(() => setFlash(null), 3000)
  }

  const refreshTeam = () => {
    void qc.invalidateQueries({ queryKey: TEAM_QUERY_KEY })
    void qc.invalidateQueries({ queryKey: ["workspaces"] })
  }

  const inviteMut = useMutation({
    mutationFn: (payload: { email: string; role: TeamRole }) => sendTeamInvite(payload.email, payload.role),
    onSuccess: (res) => {
      setEmail("")
      showFlash("success", res.message ?? "Invitation sent successfully")
      refreshTeam()
    },
    onError: (err) => showFlash("error", err instanceof Error ? err.message : "Failed to send invite"),
  })

  const resendMut = useMutation({
    mutationFn: (inviteId: string) => resendTeamInvite(inviteId),
    onMutate: (inviteId) => setResendingIds((prev) => new Set(prev).add(inviteId)),
    onSettled: (_, __, inviteId) => setResendingIds((prev) => { const s = new Set(prev); s.delete(inviteId); return s }),
    onSuccess: (res) => {
      showFlash("success", res.message ?? "Invite resent")
      refreshTeam()
    },
    onError: (err) => showFlash("error", err instanceof Error ? err.message : "Failed to resend invite"),
  })

  const cancelMut = useMutation({
    mutationFn: (inviteId: string) => cancelTeamInvite(inviteId),
    onMutate: (inviteId) => setCancellingIds((prev) => new Set(prev).add(inviteId)),
    onSettled: (_, __, inviteId) => setCancellingIds((prev) => { const s = new Set(prev); s.delete(inviteId); return s }),
    onSuccess: (res) => {
      showFlash("success", res.message ?? "Invite cancelled")
      refreshTeam()
    },
    onError: (err) => showFlash("error", err instanceof Error ? err.message : "Failed to cancel invite"),
  })

  const roleMut = useMutation({
    mutationFn: (payload: { userId: string; role: TeamRole }) => changeTeamMemberRole(payload.userId, payload.role),
    onMutate: ({ userId }) => setRoleChangingIds((prev) => new Set(prev).add(userId)),
    onSettled: (_, __, { userId }) => setRoleChangingIds((prev) => { const s = new Set(prev); s.delete(userId); return s }),
    onSuccess: (res) => {
      showFlash("success", `Role changed to ${roleConfig[res.data.role].label}`)
      refreshTeam()
    },
    onError: (err) => showFlash("error", err instanceof Error ? err.message : "Failed to change role"),
  })

  const removeMut = useMutation({
    mutationFn: (userId: string) => removeTeamMember(userId),
    onMutate: (userId) => setRemovingIds((prev) => new Set(prev).add(userId)),
    onSettled: (_, __, userId) => setRemovingIds((prev) => { const s = new Set(prev); s.delete(userId); return s }),
    onSuccess: (res) => {
      showFlash("success", res.message ?? "Member removed")
      refreshTeam()
    },
    onError: (err) => showFlash("error", err instanceof Error ? err.message : "Failed to remove member"),
  })

  const leaveMut = useMutation({
    mutationFn: (ownerId: string) => leaveTeam(ownerId),
    onSuccess: () => {
      // switchTo drops every cached query except the workspace list, so
      // refresh that one explicitly — it still contains the team just left.
      void qc.invalidateQueries({ queryKey: ["workspaces"] })
      switchTo(null)
      navigate("/app/dashboard")
    },
    onError: (err) => showFlash("error", err instanceof Error ? err.message : "Failed to leave team"),
  })

  const overview = data?.data
  const members = overview?.members ?? []
  const pendingInvites = overview?.pendingInvites ?? []
  const seats = overview?.seats ?? { used: members.length, limit: 1 }
  const seatProgress = seats.limit > 0 ? Math.min(100, Math.round((seats.used / seats.limit) * 100)) : 0
  const myRole = overview?.myRole ?? "owner"
  // members[0] is always the workspace owner (backend team.service getTeamOverview).
  const ownerMemberId = members[0]?.id

  // The logged-in user, so we never offer role/remove controls on your own row.
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

  const handleLeave = () => {
    if (!current) return
    if (!window.confirm(`Leave ${current.name}? You will lose access to ${current.ownerName || "the owner"}'s QR codes.`)) return
    leaveMut.mutate(current.ownerId)
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
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">Team</h1>
          <p className="text-zinc-500 text-sm mt-1">
            {isPersonal
              ? "Invite people to work on your QR codes. Each role below decides what they can do in your workspace."
              : <>You're {/^[aeiou]/i.test(roleConfig[myRole].label) ? "an" : "a"} <span className="font-medium text-zinc-700 dark:text-zinc-300">{roleConfig[myRole].label}</span> in {current?.ownerName ? `${current.ownerName}'s` : "this"} team.</>}
          </p>
        </div>
        {!isPersonal && current && (
          <Button variant="outline" className="shrink-0 text-red-400 border-red-500/30 hover:bg-red-500/10 hover:text-red-300" onClick={handleLeave} disabled={leaveMut.isPending}>
            {leaveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
            Leave team
          </Button>
        )}
      </div>

      {flash && (
        <p className={cn("text-sm flex items-center gap-2 -mt-4", flash.kind === "success" ? "text-emerald-400" : "text-red-400")}>
          <Mail size={14} />
          {flash.text}
        </p>
      )}

      {/* Invite + roles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            {canManage ? <Plus size={16} className="text-violet-400" /> : <Info size={16} className="text-violet-400" />}
            {canManage ? "Invite Team Member" : "Roles"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* A plan with 1 seat (Free, Starter) has room only for the owner; the
              server refuses every invite, so say why instead of offering the form. */}
          {canManage && overview && seats.limit <= 1 && (
            <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-5">
              Your plan has one seat — yours. Team members need Pro (5 seats) or Business (20 seats).{" "}
              <Link to="/app/billing" className="text-violet-600 dark:text-violet-400 underline">Upgrade</Link>
            </p>
          )}
          {canManage && seats.limit > 1 && (
            <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3 mb-5">
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
          )}
          {/* Role descriptions — the real permissions, enforced by the server */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(Object.keys(roleConfig) as (keyof typeof roleConfig)[]).map((key) => {
              const cfg = roleConfig[key]
              return (
                <div key={key} className="p-3 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                  <div className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border mb-2", cfg.color)}>
                    {cfg.icon} {cfg.label}
                  </div>
                  <p className="text-zinc-500 text-xs leading-relaxed">{ROLE_DESCRIPTIONS[key]}</p>
                </div>
              )
            })}
          </div>
          <p className="text-zinc-500 text-xs leading-relaxed mt-4">
            Codes created in a team workspace belong to the owner and count against the owner's plan.
            Team access needs Pro or above (5 seats on Pro, 20 on Business, including the owner).
          </p>
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
            const isOwnerRow = member.id === ownerMemberId
            const isMe = member.id === currentUserId
            const cfg = isOwnerRow ? roleConfig.owner : roleConfig[member.role]
            const manageable = canManage && !isOwnerRow && !isMe
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
                    <span className="text-zinc-900 dark:text-white text-sm font-medium truncate">{member.name}</span>
                    {isMe && <span className="text-zinc-500 text-xs">(you)</span>}
                  </div>
                  <div className="text-zinc-500 text-xs truncate">{member.email}</div>
                </div>
                {/* Role */}
                {manageable ? (
                  <Select
                    value={member.role}
                    onValueChange={(value) => {
                      if (value !== member.role) roleMut.mutate({ userId: member.id, role: value as TeamRole })
                    }}
                    disabled={roleChangingIds.has(member.id) || removingIds.has(member.id)}
                  >
                    <SelectTrigger className="w-28 sm:w-32 h-8 text-xs shrink-0" aria-label={`Role for ${member.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="editor">Editor</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border shrink-0", cfg.color)}>
                    {cfg.icon} {cfg.label}
                  </div>
                )}
                {/* Last active */}
                <div className="hidden lg:block text-right shrink-0">
                  <div className="text-zinc-500 text-xs">Last active</div>
                  <div className="text-zinc-700 dark:text-zinc-300 text-xs">{member.lastActive ? formatRelative(member.lastActive) : "—"}</div>
                </div>
                {/* Remove — never for the owner or for yourself (use Leave team) */}
                {manageable && (
                  <button
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors ml-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    disabled={removingIds.has(member.id)}
                    onClick={() => {
                      if (window.confirm(`Remove ${member.name} from the team? They will lose access to this workspace.`)) {
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
                  {canManage && (
                    <>
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
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {seats.limit > 0 && (
            <p className="text-zinc-500 text-xs mt-4">Seats used: {seats.used} / {seats.limit} (the owner and pending invites each take a seat)</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
