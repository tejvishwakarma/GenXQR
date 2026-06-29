import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { Shield, Eye, EyeOff, Loader2 } from "lucide-react"
import { login } from "@/lib/api"
import { getTokenRole } from "@/lib/api"

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const [email, setEmail]   = useState("")
  const [password, setPassword] = useState("")
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const res = await login(email, password)
      localStorage.setItem("access_token", res.data.accessToken)
      localStorage.setItem("user", JSON.stringify(res.data.user))

      const role = getTokenRole()
      if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
        // User is not an admin — clear tokens and show error
        localStorage.removeItem("access_token")
        localStorage.removeItem("user")
        setError("Access denied. This account does not have admin privileges.")
        return
      }

      navigate("/admin", { replace: true })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed"
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="w-14 h-14 rounded-2xl bg-red-600/20 border border-red-500/30 flex items-center justify-center mx-auto mb-4 shadow-[0_0_30px_rgba(220,38,38,0.2)]">
            <Shield size={28} className="text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Admin Panel</h1>
          <p className="text-zinc-500 text-sm">Sign in with an admin account to continue</p>
        </div>

        {/* Card */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8 shadow-2xl animate-fade-in">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-zinc-400 text-sm font-medium mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 transition"
                placeholder="admin@example.com"
              />
            </div>

            <div>
              <label className="block text-zinc-400 text-sm font-medium mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 transition pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition"
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} />}
              {loading ? "Signing in…" : "Sign In to Admin"}
            </button>
          </form>
        </div>

        <p className="text-center text-zinc-600 text-xs mt-6">
          <Link to="/" className="hover:text-zinc-400 transition">← Back to site</Link>
        </p>
      </div>
    </div>
  )
}
