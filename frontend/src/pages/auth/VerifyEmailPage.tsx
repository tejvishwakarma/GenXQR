import { useEffect, useState } from "react"
import { useSearchParams, Link } from "react-router-dom"
import { QrCode, CheckCircle, XCircle, Loader2 } from "lucide-react"
import { apiFetch } from "@/lib/api"

type Status = "verifying" | "success" | "error"

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<Status>("verifying")
  const [message, setMessage] = useState("")

  useEffect(() => {
    const token = searchParams.get("token")
    if (!token) {
      setStatus("error")
      setMessage("No verification token found. Please use the link from your email.")
      return
    }

    apiFetch<{ success: boolean; message: string }>(`/api/auth/verify-email/${encodeURIComponent(token)}`)
      .then(() => setStatus("success"))
      .catch((err) => {
        setStatus("error")
        setMessage(err instanceof Error ? err.message : "Verification failed. The link may have expired.")
      })
  }, [searchParams])

  const isSuccess  = status === "success"
  const isError    = status === "error"
  const isVerifying = status === "verifying"

  return (
    <div className="dark min-h-screen flex items-center justify-center px-4 bg-zinc-950 relative overflow-hidden">
      {/* ── Background layers matching homepage hero ── */}
      <div className="absolute inset-0 bg-hero-glow pointer-events-none" />
      <div className="absolute inset-0 bg-dots opacity-[0.18] pointer-events-none" />
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-10 w-64 h-64 bg-purple-700/8 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 left-10 w-48 h-48 bg-violet-500/5 rounded-full blur-2xl pointer-events-none" />

      <div className="relative w-full max-w-md text-center animate-fade-in">
        {/* Logo */}
        <Link to="/" className="inline-flex items-center gap-2.5 justify-center mb-8">
          <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center shadow-[0_0_20px_rgba(124,58,237,0.4)]">
            <QrCode size={20} className="text-white" />
          </div>
          <span className="text-white font-bold text-xl">GenX<span className="gradient-text">QR</span></span>
        </Link>

        <div className="glass-card p-10 rounded-2xl animate-fade-in animate-delay-100">
          {isVerifying && (
            <>
              {/* Outer glow ring for spinner */}
              <div className="relative inline-flex mb-4">
                <div className="absolute inset-0 rounded-full blur-lg opacity-30 bg-violet-500 scale-150" />
                <Loader2 size={48} className="relative text-violet-400 animate-spin" />
              </div>
              <h1 className="text-xl font-bold text-white mb-2">Verifying your email…</h1>
              <p className="text-zinc-400 text-sm">Please wait a moment.</p>
            </>
          )}

          {isSuccess && (
            <>
              <div className="relative inline-flex mb-4">
                <div className="absolute inset-0 rounded-full blur-lg opacity-30 bg-green-500 scale-150" />
                <CheckCircle size={48} className="relative text-green-400" />
              </div>
              <h1 className="text-xl font-bold text-white mb-2">Email verified!</h1>
              <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
                Your account is now active. You can sign in and start creating QR codes.
              </p>
              <Link
                to="/login"
                className="inline-block px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl transition-colors shadow-[0_0_20px_rgba(124,58,237,0.3)] hover:shadow-[0_0_25px_rgba(124,58,237,0.5)]"
              >
                Sign in to your account
              </Link>
            </>
          )}

          {isError && (
            <>
              <div className="relative inline-flex mb-4">
                <div className="absolute inset-0 rounded-full blur-lg opacity-30 bg-red-500 scale-150" />
                <XCircle size={48} className="relative text-red-400" />
              </div>
              <h1 className="text-xl font-bold text-white mb-2">Verification failed</h1>
              <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
                {message || "This link is invalid or has expired. Please request a new verification email."}
              </p>
              <Link
                to="/login"
                className="inline-block px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl transition-colors"
              >
                Back to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
