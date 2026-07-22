import { Link, useNavigate, useParams } from "react-router-dom"
import { useMemo, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Loader2, Mail, QrCode, Shield, Users, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ApiError, acceptTeamInvite, apiFetch, clearClientSession, getTeamInvitePreview } from "@/lib/api"

function roleLabel(role: "admin" | "editor" | "viewer") {
  if (role === "admin") return "Admin"
  if (role === "editor") return "Editor"
  return "Viewer"
}

export default function InviteAcceptPage() {
  const navigate = useNavigate()
  const { token } = useParams<{ token: string }>()
  const [flash, setFlash] = useState<string | null>(null)

  const currentUser = useMemo(() => {
    try {
      const raw = localStorage.getItem("user")
      return raw ? (JSON.parse(raw) as { email?: string; name?: string }) : null
    } catch {
      return null
    }
  }, [])

  const { data, isLoading, error } = useQuery({
    queryKey: ["team-invite-preview", token],
    queryFn: () => getTeamInvitePreview(token ?? ""),
    enabled: !!token,
    retry: false,
  })

  const acceptMut = useMutation({
    mutationFn: () => acceptTeamInvite(token ?? ""),
    onSuccess: (res) => {
      setFlash(res.message)
      window.setTimeout(() => navigate("/app/team", { replace: true }), 1200)
    },
    onError: (err) => {
      setFlash(err instanceof Error ? err.message : "Failed to accept invite")
    },
  })

  async function switchAccount() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" })
    } catch {
      // ignore logout errors; clear local session regardless
    }
    clearClientSession()
    navigate(`/login?next=${encodeURIComponent(`/invite/${token ?? ""}`)}`, { replace: true })
  }

  if (!token) {
    return (
      <div className="dark min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        Invalid invite link.
      </div>
    )
  }

  return (
    <div className="dark min-h-screen flex items-center justify-center px-4 py-16 bg-zinc-950 relative overflow-hidden">
      {/* ── Background layers matching homepage hero ── */}
      <div className="absolute inset-0 bg-hero-glow pointer-events-none" />
      <div className="absolute inset-0 bg-dots opacity-[0.18] pointer-events-none" />
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-10 w-64 h-64 bg-purple-700/8 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-10 w-48 h-48 bg-violet-500/5 rounded-full blur-2xl pointer-events-none" />

      <div className="relative w-full max-w-xl glass-card p-8 rounded-2xl animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center shadow-[0_0_20px_rgba(124,58,237,0.4)]">
              <QrCode size={20} className="text-white" />
            </div>
            <span className="text-white font-bold text-xl">GenX<span className="gradient-text">QR</span></span>
          </Link>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center text-zinc-400 py-8 gap-2">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Loading invite…</span>
          </div>
        )}

        {!isLoading && error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-4 text-sm text-red-400">
            {error instanceof ApiError ? error.message : "Invite not found or already used."}
          </div>
        )}

        {!isLoading && data?.data && (
          <div className="space-y-6">
            {/* Header with section pill */}
            <div className="text-center">
              <span className="section-header mb-4 inline-flex">
                <Zap size={14} className="text-violet-400" />
                Team invitation
              </span>
              <h1 className="text-2xl font-bold text-white mt-3">You're invited to join a team</h1>
              <p className="text-zinc-400 text-sm mt-2 leading-relaxed">
                <span className="text-white font-medium">{data.data.owner.name}</span> invited{" "}
                <span className="text-white">{data.data.invite.email}</span> to join GenXQR as{" "}
                <span className="text-violet-400 font-medium">{roleLabel(data.data.invite.role)}</span>.
              </p>
            </div>

            {/* Info cards */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 hover:border-violet-500/30 transition-colors">
                <div className="flex items-center gap-2 text-violet-400 text-xs font-medium mb-2">
                  <Users size={14} />
                  Team Owner
                </div>
                <p className="text-white font-medium text-sm">{data.data.owner.name}</p>
                <p className="text-zinc-500 text-xs mt-0.5">{data.data.owner.email}</p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 hover:border-violet-500/30 transition-colors">
                <div className="flex items-center gap-2 text-violet-400 text-xs font-medium mb-2">
                  <Shield size={14} />
                  Your Role
                </div>
                <p className="text-white font-medium text-sm">{roleLabel(data.data.invite.role)}</p>
                <p className="text-zinc-500 text-xs mt-0.5">
                  Invited on {new Date(data.data.invite.invitedAt).toLocaleDateString()}
                </p>
              </div>
            </div>

            {flash && (
              <div className={`rounded-xl border px-4 py-3 text-sm ${acceptMut.isError ? "border-red-500/20 bg-red-500/10 text-red-400" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"}`}>
                {flash}
              </div>
            )}

            {!currentUser && (
              <div className="space-y-3">
                <p className="text-zinc-400 text-sm">
                  Sign in or create an account with{" "}
                  <span className="text-white font-medium">{data.data.invite.email}</span>{" "}
                  to accept this invite.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link to={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} className="flex-1">
                    <Button className="w-full" size="lg">Sign in to accept</Button>
                  </Link>
                  <Link to={`/signup?next=${encodeURIComponent(`/invite/${token}`)}`} className="flex-1">
                    <Button variant="secondary" className="w-full" size="lg">Create account</Button>
                  </Link>
                </div>
              </div>
            )}

            {currentUser && currentUser.email?.toLowerCase() === data.data.invite.email.toLowerCase() && (
              <div className="space-y-3">
                <p className="text-zinc-400 text-sm">
                  Signed in as <span className="text-white">{currentUser.email}</span>.
                </p>
                <Button
                  onClick={() => acceptMut.mutate()}
                  disabled={acceptMut.isPending}
                  className="w-full"
                  size="lg"
                >
                  {acceptMut.isPending ? <Loader2 size={16} className="animate-spin" /> : "Accept invite"}
                </Button>
              </div>
            )}

            {currentUser && currentUser.email?.toLowerCase() !== data.data.invite.email.toLowerCase() && (
              <div className="space-y-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
                <div className="flex items-center gap-2 text-amber-300 text-sm font-medium">
                  <Mail size={16} />
                  Wrong account signed in
                </div>
                <p className="text-sm text-amber-200 leading-relaxed">
                  This invite was sent to{" "}
                  <span className="font-medium">{data.data.invite.email}</span>, but you're currently signed in as{" "}
                  <span className="font-medium">{currentUser.email ?? "another account"}</span>.
                </p>
                <Button variant="secondary" className="w-full" onClick={() => void switchAccount()}>
                  Sign in with invited account
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
