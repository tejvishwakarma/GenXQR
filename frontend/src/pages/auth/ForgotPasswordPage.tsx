import { Link } from "react-router-dom"
import { QrCode, ArrowLeft, Mail, Check } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { forgotPassword, ApiError } from "@/lib/api"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await forgotPassword(email)
      setSent(true)
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
      <div className="absolute bottom-0 left-10 w-64 h-64 bg-purple-700/8 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-10 w-48 h-48 bg-violet-500/5 rounded-full blur-2xl pointer-events-none" />

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
            <div className={`absolute inset-0 rounded-2xl blur-md opacity-40 transition-all duration-500 ${sent ? "bg-green-500/60" : "bg-violet-500/60"}`} />
            <div className={`relative w-14 h-14 rounded-2xl border flex items-center justify-center transition-all duration-500 ${sent ? "bg-green-500/15 border-green-500/30" : "bg-violet-500/15 border-violet-500/25"}`}>
              {sent
                ? <Check size={24} className="text-green-400" />
                : <Mail size={24} className="text-violet-400" />
              }
            </div>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-white mb-2">
            {sent ? "Email sent!" : "Forgot your password?"}
          </h1>
          <p className="text-zinc-400 text-sm max-w-sm mx-auto leading-relaxed">
            {sent
              ? `If an account exists for ${email}, you'll receive a reset link shortly. Check your spam folder too.`
              : "No worries! Enter your email and we'll send you a reset link. Check your inbox in a few minutes."}
          </p>
        </div>

        <div className="glass-card p-5 sm:p-8 rounded-2xl animate-fade-in animate-delay-100">
          {sent ? (
            <div className="space-y-4">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                size="lg"
                onClick={() => { setSent(false); setEmail("") }}
              >
                Try a different email
              </Button>
              <div className="flex items-center justify-center">
                <Link to="/login" className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-sm transition-colors">
                  <ArrowLeft size={14} />
                  Back to sign in
                </Link>
              </div>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              {error && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                  {error}
                </div>
              )}
              <div>
                <label className="label-text">Email address</label>
                <Input
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? "Sending…" : "Send reset link"}
              </Button>

              <div className="flex items-center justify-center gap-2 mt-2">
                <Link to="/login" className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-sm transition-colors">
                  <ArrowLeft size={14} />
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
