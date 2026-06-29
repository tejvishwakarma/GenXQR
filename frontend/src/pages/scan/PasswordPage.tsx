import { useState } from "react"
import { useParams } from "react-router-dom"
import { verifyQRPassword, ApiError } from "@/lib/api"

export default function PasswordPage() {
  const { slug } = useParams<{ slug: string }>()
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!slug || !password) return

    setLoading(true)
    setError(null)

    try {
      const res = await verifyQRPassword(slug, password)
      if (res.success && res.data.destination) {
        window.location.href = res.data.destination
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Incorrect password. Please try again.")
      } else {
        setError("Something went wrong. Please try again.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Icon */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Protected Content</h1>
          <p className="text-gray-400 text-sm mt-2">Enter the password to continue</p>
        </div>

        {/* Form */}
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-indigo-400 focus:bg-white/15 transition-all"
              autoFocus
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-xl">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-colors"
          >
            {loading ? "Verifying..." : "Continue"}
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-gray-600">Powered by GenXQR</p>
      </div>
    </div>
  )
}
