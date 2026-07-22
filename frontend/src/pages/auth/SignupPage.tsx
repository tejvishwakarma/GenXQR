import { Link, useSearchParams } from "react-router-dom"
import { QrCode, Eye, EyeOff, Check, Mail, Zap, BarChart3, RefreshCw, Shield } from "lucide-react"
import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { register, getTeamInvitePreview, ApiError } from "@/lib/api"

const perks = [
  { icon: <BarChart3 size={15} />, text: "Real-time scan analytics" },
  { icon: <RefreshCw size={15} />, text: "Dynamic QR — edit after printing" },
  { icon: <Shield size={15} />, text: "Password-protected QR codes" },
  { icon: <QrCode size={15} />, text: "All 16 QR content types" },
]

export default function SignupPage() {
  const [searchParams] = useSearchParams()
  const next = searchParams.get("next") ?? "/app/dashboard"

  // Extract invite token from the ?next param (e.g. /invite/:token)
  const inviteTokenMatch = next.match(/^\/invite\/([^/?#]+)/)
  const inviteToken = inviteTokenMatch ? decodeURIComponent(inviteTokenMatch[1]) : null

  const { data: invitePreview } = useQuery({
    queryKey: ["team-invite-preview", inviteToken],
    queryFn: () => getTeamInvitePreview(inviteToken!),
    enabled: !!inviteToken,
    retry: false,
  })

  const invitedEmail = invitePreview?.data?.invite?.email ?? null

  const [showPassword, setShowPassword] = useState(false)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  // Pre-fill the email field when the invite preview resolves
  useEffect(() => {
    if (invitedEmail && !email) {
      setEmail(invitedEmail)
    }
  }, [invitedEmail])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!agreed) { setError("Please agree to the Terms of Service and Privacy Policy."); return }
    setError(null)
    setLoading(true)
    try {
      const name = `${firstName.trim()} ${lastName.trim()}`.trim()
      await register(name, email, password)
      setSuccess(true)
    } catch (err) {
      if (err instanceof ApiError && err.status === 403 && err.message === "account_deleted") {
        setError("This email address is no longer eligible for registration. Contact support if you believe this is a mistake.")
      } else {
        setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="dark min-h-screen flex items-center justify-center px-4 py-16 bg-zinc-950 relative overflow-hidden">
      {/* ── Background layers matching homepage hero ── */}
      <div className="absolute inset-0 bg-hero-glow pointer-events-none" />
      <div className="absolute inset-0 bg-dots opacity-[0.18] pointer-events-none" />
      <div className="absolute -top-40 right-1/4 w-[500px] h-[500px] bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-purple-700/8 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 -translate-y-1/2 left-0 w-56 h-56 bg-violet-500/5 rounded-full blur-2xl pointer-events-none" />

      <div className="relative w-full max-w-4xl grid md:grid-cols-2 gap-8 animate-fade-in">
        {/* ── Left: Brand panel (desktop only) ── */}
        <div className="hidden md:flex flex-col justify-center py-8">
          <Link to="/" className="inline-flex items-center gap-2.5 mb-8 w-fit">
            <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center shadow-[0_0_20px_rgba(124,58,237,0.4)]">
              <QrCode size={20} className="text-white" />
            </div>
            <span className="text-white font-bold text-xl">GenX<span className="gradient-text">QR</span></span>
          </Link>

          <span className="section-header mb-6 w-fit animate-fade-in">
            <Zap size={14} className="text-violet-400" />
            Free forever — no credit card
          </span>

          <h1 className="text-2xl lg:text-3xl font-bold text-white mb-3 leading-tight animate-fade-in animate-delay-100">
            Start creating smarter{" "}
            <span className="gradient-text">QR codes</span>
          </h1>
          <p className="text-zinc-400 text-sm mb-7 leading-relaxed animate-fade-in animate-delay-200">
            Join 50,000+ businesses using GenXQR to drive more engagement — from dhabas in Pune to D2C brands in Bangalore.
          </p>

          {/* Perks list */}
          <div className="space-y-3 mb-8">
            {perks.map((perk, i) => (
              <div
                key={perk.text}
                className="flex items-center gap-3 animate-fade-in"
                style={{ animationDelay: `${200 + i * 80}ms` }}
              >
                <div className="w-7 h-7 rounded-lg bg-violet-500/15 border border-violet-500/25 flex items-center justify-center text-violet-400 shrink-0">
                  {perk.icon}
                </div>
                <span className="text-zinc-300 text-sm">{perk.text}</span>
              </div>
            ))}
          </div>

          {/* Testimonial card */}
          <div className="glass-card p-4 rounded-xl animate-fade-in animate-delay-400">
            {/* Stars */}
            <div className="flex gap-0.5 mb-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <svg key={i} className="w-3.5 h-3.5 text-violet-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
            <p className="text-zinc-300 text-sm italic leading-relaxed">"GenXQR doubled our menu QR scans in the first month. The real-time analytics changed how we run our restaurant."</p>
            <div className="flex items-center gap-2 mt-3">
              <div className="w-7 h-7 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400 text-xs font-semibold shrink-0">R</div>
              <div>
                <div className="text-white text-xs font-medium">Rahul M.</div>
                <div className="text-zinc-500 text-xs">Restaurant Owner, Pune</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: Form ── */}
        <div>
          {/* Mobile logo */}
          <div className="text-center mb-6 md:hidden">
            <Link to="/" className="inline-flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center">
                <QrCode size={20} className="text-white" />
              </div>
              <span className="text-white font-bold text-xl">GenX<span className="gradient-text">QR</span></span>
            </Link>
          </div>

          <div className="glass-card p-5 sm:p-8 rounded-2xl">
            <h2 className="text-xl font-bold text-white mb-1">Create your account</h2>
            <p className="text-zinc-400 text-sm mb-6">Free forever. No credit card required.</p>

            {success ? (
              <div className="rounded-xl bg-green-500/10 border border-green-500/20 px-4 py-5 text-center">
                <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3">
                  <Check size={22} className="text-green-400" />
                </div>
                <p className="text-white font-semibold mb-1">Account created!</p>
                <p className="text-zinc-400 text-sm">
                  Your account for <span className="text-white">{email}</span> is ready. You can sign in now.
                </p>
                <Link
                  to={`/login${next !== "/app/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`}
                  className="inline-block mt-4 text-violet-400 hover:text-violet-300 text-sm font-medium transition-colors"
                >
                  Go to sign in →
                </Link>
              </div>
            ) : (
              <>
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
                  Sign up with Google
                </a>

                <div className="flex items-center gap-4 mb-6">
                  <div className="flex-1 h-px bg-zinc-800" />
                  <span className="text-zinc-600 text-xs">or with email</span>
                  <div className="flex-1 h-px bg-zinc-800" />
                </div>

                <form className="space-y-4" onSubmit={handleSubmit}>
                  {error && (
                    <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                      {error}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label-text">First name</label>
                      <Input
                        placeholder="Rahul"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        required
                        autoComplete="given-name"
                      />
                    </div>
                    <div>
                      <label className="label-text">Last name</label>
                      <Input
                        placeholder="Sharma"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        autoComplete="family-name"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label-text">Work email</label>
                    {invitedEmail && (
                      <div className="flex items-center gap-2 mb-1.5 text-xs text-violet-300 bg-violet-500/10 border border-violet-500/20 rounded-lg px-3 py-2">
                        <Mail size={12} className="shrink-0" />
                        This email was pre-filled from your team invite. You must sign up with this address.
                      </div>
                    )}
                    <Input
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      readOnly={!!invitedEmail}
                      className={invitedEmail ? "opacity-70 cursor-not-allowed" : ""}
                    />
                  </div>
                  <div>
                    <label className="label-text">Password</label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="Min 8 characters"
                        className="pr-10"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="new-password"
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

                  <div className="flex items-start gap-2.5 pt-1">
                    <input
                      type="checkbox"
                      id="terms"
                      className="mt-0.5 accent-violet-600"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                    />
                    <label htmlFor="terms" className="text-zinc-400 text-xs leading-relaxed">
                      I agree to the{" "}
                      <Link to="/terms" className="text-violet-400 hover:underline">Terms of Service</Link>
                      {" "}and{" "}
                      <Link to="/privacy" className="text-violet-400 hover:underline">Privacy Policy</Link>
                    </label>
                  </div>

                  <Button type="submit" className="w-full" size="lg" disabled={loading}>
                    {loading ? "Creating account…" : "Create free account"}
                  </Button>
                </form>

                <p className="text-center text-zinc-500 text-sm mt-6">
                  Already have an account?{" "}
                  <Link
                    to={`/login${next !== "/app/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`}
                    className="text-violet-400 hover:text-violet-300 font-medium transition-colors"
                  >
                    Sign in
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
