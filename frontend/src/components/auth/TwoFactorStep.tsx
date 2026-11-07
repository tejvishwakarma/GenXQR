import { useState } from "react"
import { ShieldCheck, Loader2 } from "lucide-react"
import { ApiError, verifyTwoFactor, type AuthUser } from "@/lib/api"

/**
 * The second step of a sign-in with two-factor on: a 6-digit code from the
 * authenticator app, or a recovery code. Dark, for the login pages.
 */
export function TwoFactorStep({
  challenge,
  onDone,
  onRestart,
}: {
  challenge: string
  onDone: (session: { accessToken: string; user: AuthUser; next: string | null }) => void
  onRestart: () => void
}) {
  const [code, setCode] = useState("")
  const [recovery, setRecovery] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await verifyTwoFactor(challenge, code.trim())
      onDone(res.data)
    } catch (err) {
      // 401 = the sign-in is over (expired or too many wrong codes): start again.
      if (err instanceof ApiError && err.status === 401) setExpired(true)
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
      setCode("")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center shrink-0">
          <ShieldCheck size={18} className="text-violet-400" />
        </div>
        <div>
          <h2 className="text-white font-semibold">Two-factor sign-in</h2>
          <p className="text-zinc-400 text-sm mt-0.5">
            {recovery ? "Enter one of the recovery codes you saved when you turned this on. Each works once." : "Enter the 6-digit code from your authenticator app."}
          </p>
        </div>
      </div>

      {error && <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">{error}</div>}

      {expired ? (
        <button type="button" onClick={onRestart}
          className="w-full rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold py-3 transition-colors">
          Sign in again
        </button>
      ) : (
        <>
          <input
            autoFocus
            value={code}
            onChange={(e) => setCode(recovery ? e.target.value : e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode={recovery ? "text" : "numeric"}
            autoComplete="one-time-code"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={recovery ? "xxxxx-xxxxx" : "123456"}
            aria-label={recovery ? "Recovery code" : "Authenticator code"}
            className="w-full rounded-xl bg-zinc-900 border border-zinc-700 px-4 py-3 text-center text-xl tracking-[0.3em] font-mono text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500"
          />
          <button type="submit" disabled={loading || (recovery ? code.trim().length < 6 : code.length !== 6)}
            className="w-full rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold py-3 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2">
            {loading && <Loader2 size={15} className="animate-spin" />} Verify
          </button>
          <div className="flex items-center justify-between text-xs">
            <button type="button" onClick={() => { setRecovery((v) => !v); setCode(""); setError(null) }} className="text-violet-400 hover:text-violet-300">
              {recovery ? "Use the authenticator code" : "Lost your phone? Use a recovery code"}
            </button>
            <button type="button" onClick={onRestart} className="text-zinc-500 hover:text-zinc-300">Cancel</button>
          </div>
        </>
      )}
    </form>
  )
}
