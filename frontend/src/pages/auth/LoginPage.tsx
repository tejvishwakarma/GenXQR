import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { QrCode, Eye, EyeOff, RefreshCw, Zap, TrendingUp } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { login, resendVerificationEmail, ApiError } from "@/lib/api"

// Stable decorative scan chart bars (no random — consistent across renders)
const SCAN_BARS = [3, 6, 4, 8, 5, 9, 7, 10, 6, 8, 5, 7, 9, 6, 4, 8]

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const next = searchParams.get("next") ?? "/app/dashboard"
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(() => {
    const urlError = searchParams.get("error")
    if (urlError === "account_permanently_banned") return "This account has been permanently banned from the platform. Contact support if you believe this is a mistake."
    if (urlError === "account_deleted") return "This account has been deleted by an administrator. Contact support if you believe this is a mistake."
    if (urlError === "oauth_failed") return "Google sign-in failed. Please try again."
    return null
  })
  const [loading, setLoading] = useState(false)
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "cooldown" | "error">("idle")

  const isUnverifiedError = error === "Please verify your email before signing in"

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setResendState("idle")
    setLoading(true)
    try {
      const res = await login(email, password)
      localStorage.setItem("access_token", res.data.accessToken)
      localStorage.setItem("user", JSON.stringify(res.data.user))
      const role = res.data.user.role
      if ((role === "ADMIN" || role === "SUPER_ADMIN") && next === "/app/dashboard") {
        navigate("/admin", { replace: true })
      } else {
        navigate(next, { replace: true })
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  async function handleResendVerification() {
    setResendState("sending")
    try {
      await resendVerificationEmail(email)
      setResendState("sent")
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setResendState("cooldown")
      } else {
        setResendState("error")
      }
    }
  }

  return (
    <div className="dark min-h-screen flex items-center justify-center px-4 py-16 bg-zinc-950 relative overflow-hidden">
      {/* ── Background layers matching homepage hero ── */}
      <div className="absolute inset-0 bg-hero-glow pointer-events-none" />
      <div className="absolute inset-0 bg-dots opacity-[0.18] pointer-events-none" />
      <div className="absolute -top-40 left-1/4 w-[500px] h-[500px] bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-purple-700/8 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 -translate-y-1/2 right-0 w-56 h-56 bg-violet-500/5 rounded-full blur-2xl pointer-events-none" />

      <div className="relative w-full max-w-4xl grid lg:grid-cols-[1.15fr_1fr] gap-10 items-center animate-fade-in">

        {/* ── Left: Brand panel (desktop only) ── */}
        <div className="hidden lg:flex flex-col py-6">
          {/* Logo */}
          <Link to="/" className="inline-flex items-center gap-2.5 mb-10 w-fit">
            <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center shadow-[0_0_20px_rgba(124,58,237,0.4)]">
              <QrCode size={20} className="text-white" />
            </div>
            <span className="text-white font-bold text-xl">Nexus<span className="gradient-text">QR</span></span>
          </Link>

          <span className="section-header mb-6 w-fit animate-fade-in">
            <Zap size={14} className="text-violet-400" />
            India's QR Code Platform 🇮🇳
          </span>

          <h1 className="text-3xl xl:text-4xl font-bold text-white leading-[1.2] mb-4 animate-fade-in animate-delay-100">
            Your QR codes are<br />
            <span className="gradient-text">live and tracking.</span>
          </h1>
          <p className="text-zinc-400 text-sm leading-relaxed mb-8 max-w-sm animate-fade-in animate-delay-200">
            Sign in to see who scanned your codes today, update destinations without reprinting, and manage every campaign in one place.
          </p>

          {/* Mini stats row */}
          <div className="flex items-center gap-8 mb-8 animate-fade-in animate-delay-300">
            {[
              { value: "50K+",  label: "Businesses" },
              { value: "2M+",   label: "Scans tracked" },
              { value: "99.9%", label: "Uptime" },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-white font-bold text-xl">{s.value}</div>
                <div className="text-zinc-500 text-xs">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Live scan activity chart */}
          <div className="glass-card p-4 rounded-xl animate-fade-in animate-delay-400">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp size={13} className="text-violet-400" />
                <span className="text-zinc-400 text-xs font-medium">Today's scan activity</span>
              </div>
              <span className="flex items-center gap-1.5 text-xs text-green-400">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                Live
              </span>
            </div>
            <div className="flex items-end gap-[3px] h-14">
              {SCAN_BARS.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-[2px]"
                  style={{
                    height: `${h * 10}%`,
                    background: `rgba(124, 58, 237, ${0.2 + (h / 10) * 0.55})`,
                  }}
                />
              ))}
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-zinc-700 text-[10px]">12 am</span>
              <span className="text-zinc-700 text-[10px]">Now</span>
            </div>
          </div>

          {/* Testimonial */}
          <div className="mt-5 glass-card p-4 rounded-xl animate-fade-in animate-delay-400">
            <p className="text-zinc-300 text-sm italic leading-relaxed">"We updated our event QR destination 3 times on the day itself. Couldn't have done it without GenXQR."</p>
            <div className="flex items-center gap-2 mt-3">
              <div className="w-7 h-7 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400 text-xs font-semibold">P</div>
              <div>
                <div className="text-white text-xs font-medium">Priya S.</div>
                <div className="text-zinc-500 text-xs">Events Manager, Bangalore</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: Form ── */}
        <div>
          {/* Mobile logo + title */}
          <div className="text-center mb-8 lg:hidden">
            <Link to="/" className="inline-flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center shadow-[0_0_20px_rgba(124,58,237,0.4)]">
                <QrCode size={20} className="text-white" />
              </div>
              <span className="text-white font-bold text-xl">Nexus<span className="gradient-text">QR</span></span>
            </Link>
            <h1 className="text-xl sm:text-2xl font-bold text-white mt-6 mb-2">Welcome back</h1>
            <p className="text-zinc-400 text-sm">Sign in to your GenXQR account</p>
          </div>

          <div className="glass-card p-5 sm:p-8 rounded-2xl">
            {/* Desktop heading */}
            <div className="hidden lg:block mb-6">
              <h2 className="text-xl font-bold text-white mb-1">Welcome back</h2>
              <p className="text-zinc-400 text-sm">Sign in to your GenXQR account</p>
            </div>

            {/* Google OAuth */}
            <a
              href={`${import.meta.env.VITE_API_URL ?? ""}/api/auth/google?next=${encodeURIComponent(next)}`}
              className="w-full flex items-center justify-center gap-3 bg-white/5 hover:bg-white/10 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm font-medium transition-all mb-6"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </a>

            {/* Divider */}
            <div className="flex items-center gap-4 mb-6">
              <div className="flex-1 h-px bg-zinc-800" />
              <span className="text-zinc-600 text-xs">or continue with email</span>
              <div className="flex-1 h-px bg-zinc-800" />
            </div>

            {/* Form */}
            <form className="space-y-4" onSubmit={handleSubmit}>
              {error && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                  <p>{error}</p>
                  {isUnverifiedError && (
                    <div className="mt-3 pt-3 border-t border-red-500/20">
                      {resendState === "sent" ? (
                        <p className="text-emerald-400 text-xs">✓ Verification email sent! Check your inbox.</p>
                      ) : resendState === "cooldown" ? (
                        <p className="text-amber-400 text-xs">Please wait a moment before requesting another email.</p>
                      ) : resendState === "error" ? (
                        <p className="text-red-300 text-xs">Failed to resend. Please try again later.</p>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleResendVerification()}
                          disabled={resendState === "sending"}
                          className="flex items-center gap-1.5 text-xs text-red-300 hover:text-white transition-colors disabled:opacity-60"
                        >
                          <RefreshCw size={12} className={resendState === "sending" ? "animate-spin" : ""} />
                          {resendState === "sending" ? "Sending…" : "Resend verification email"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className="label-text">Email</label>
                <Input
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="label-text !mb-0">Password</label>
                  <Link to="/forgot-password" className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    className="pr-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <p className="text-center text-zinc-500 text-sm mt-6">
              Don't have an account?{" "}
              <Link
                to={`/signup${next !== "/app/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`}
                className="text-violet-400 hover:text-violet-300 font-medium transition-colors"
              >
                Sign up free
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
