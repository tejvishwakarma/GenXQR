import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { QrCode, Eye, EyeOff, KeyRound, Check } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { resetPassword, ApiError } from "@/lib/api"

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token") ?? ""

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  // Password strength requirements
  const hasUpper  = /[A-Z]/.test(password)
  const hasLower  = /[a-z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  const hasLength = password.length >= 8

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!token) {
      setError("Invalid or missing reset link. Please request a new one.")
      return
    }
    if (!hasUpper || !hasLower || !hasNumber || !hasLength) {
      setError("Password does not meet the requirements below.")
      return
    }
    if (password !== confirm) {
      setError("Passwords do not match.")
      return
    }

    setLoading(true)
    try {
      await resetPassword(token, password)
      setDone(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="dark min-h-screen flex items-center justify-center px-4 py-16 bg-zinc-950 relative overflow-hidden">
      {/* ── Background layers matching homepage hero ── */}
      <div className="absolute inset-0 bg-hero-glow pointer-events-none" />
      <div className="absolute inset-0 bg-dots opacity-[0.18] pointer-events-none" />
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-10 w-64 h-64 bg-purple-700/8 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 left-10 w-48 h-48 bg-violet-500/5 rounded-full blur-2xl pointer-events-none" />

      <div className="relative w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center shadow-[0_0_20px_rgba(124,58,237,0.4)]">
              <QrCode size={20} className="text-white" />
            </div>
            <span className="text-white font-bold text-xl">Nexus<span className="gradient-text">QR</span></span>
          </Link>

          {/* State icon with outer glow ring */}
          <div className="relative inline-flex mt-8 mb-4">
            <div className={`absolute inset-0 rounded-2xl blur-md opacity-40 transition-all duration-500 ${done ? "bg-green-500/60" : "bg-violet-500/60"}`} />
            <div className={`relative w-14 h-14 rounded-2xl border flex items-center justify-center transition-all duration-500 ${done ? "bg-green-500/15 border-green-500/30" : "bg-violet-500/15 border-violet-500/25"}`}>
              {done
                ? <Check size={24} className="text-green-400" />
                : <KeyRound size={24} className="text-violet-400" />
              }
            </div>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-white mb-2">
            {done ? "Password updated!" : "Set a new password"}
          </h1>
          <p className="text-zinc-400 text-sm max-w-sm mx-auto leading-relaxed">
            {done
              ? "Your password has been changed successfully. You can now sign in with your new password."
              : "Enter a strong new password for your account."}
          </p>
        </div>

        <div className="glass-card p-5 sm:p-8 rounded-2xl animate-fade-in animate-delay-100">
          {done ? (
            <Button
              className="w-full bg-violet-600 hover:bg-violet-500"
              size="lg"
              onClick={() => navigate("/login")}
            >
              Sign in now
            </Button>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              {!token && (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-amber-400">
                  This link appears to be invalid. Please{" "}
                  <Link to="/forgot-password" className="underline">request a new one</Link>.
                </div>
              )}

              {error && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              {/* New password */}
              <div>
                <label className="label-text">New password</label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Strength indicators */}
              {password && (
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  {[
                    { ok: hasLength, label: "8+ characters" },
                    { ok: hasUpper,  label: "Uppercase letter" },
                    { ok: hasLower,  label: "Lowercase letter" },
                    { ok: hasNumber, label: "Number" },
                  ].map(({ ok, label }) => (
                    <div key={label} className={`flex items-center gap-1.5 ${ok ? "text-green-400" : "text-zinc-500"}`}>
                      <div className={`w-1 h-1 rounded-full ${ok ? "bg-green-400" : "bg-zinc-600"}`} />
                      {label}
                    </div>
                  ))}
                </div>
              )}

              {/* Confirm password */}
              <div>
                <label className="label-text">Confirm new password</label>
                <Input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter your new password"
                  required
                />
                {confirm && password !== confirm && (
                  <p className="text-xs text-red-400 mt-1">Passwords do not match</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full bg-violet-600 hover:bg-violet-500"
                size="lg"
                disabled={loading || !token}
              >
                {loading ? "Updating password…" : "Update password"}
              </Button>

              <div className="text-center">
                <Link to="/login" className="text-zinc-400 hover:text-white text-sm transition-colors">
                  Back to sign in
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
