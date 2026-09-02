import { useState } from "react"
import { useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { verifyQRPassword, getPublicBranding, GENXQR_BRANDING, ApiError } from "@/lib/api"
import { ScanBrandHeader, ScanBrandFooter } from "@/components/ScanBranding"

/**
 * The password gate for a protected QR code, at /r/:slug/password.
 *
 * This page is the most likely cause of both Search Console security flags, and
 * the reason is what it used to leave out rather than anything it did. Its entire
 * visible copy was:
 *
 *     Protected Content
 *     Enter the password to continue
 *     Powered by GenXQR          (gray-600 on near-black — barely legible)
 *
 * A generic padlock, no logo, nothing saying whose content it guards, and a lone
 * password field. Measured against Google's own definition of a deceptive page —
 * "pretend to look and feel like a trusted entity" and "try to trick you into
 * doing something you'd only do for a trusted entity, like sharing a password" —
 * an unbranded page that asks for a password satisfies both halves by omission.
 * It is also exactly where Chrome's password-reuse warning would fire, which is
 * what "Possible phishing detected on user login" reports.
 *
 * So the page now states plainly who is asking, what is being asked for, and —
 * most importantly — that this is NOT an account sign-in and no account password
 * should be entered. Anyone editing this file should keep all three: they are the
 * difference between a password prompt and a credential-harvesting page, both to
 * a classifier and to the person holding the phone.
 */
export default function PasswordPage() {
  const { slug } = useParams<{ slug: string }>()
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  /**
   * Whose name this page carries. White-label swaps GenXQR's identity for the
   * customer's — it never leaves the page anonymous, which is the state Search
   * Console reported as deceptive.
   *
   * Placeholder data means the first paint is GenXQR-branded rather than blank:
   * a flash of no identity on a page asking for a password is the exact thing
   * being avoided, and it resolves within one request.
   */
  const { data: branding = GENXQR_BRANDING } = useQuery({
    queryKey: ["scan-branding", slug],
    queryFn: () => getPublicBranding(slug!),
    enabled: !!slug,
    staleTime: 5 * 60_000,
    placeholderData: GENXQR_BRANDING,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!slug || !password) return

    setLoading(true)
    setError(null)

    try {
      const res = await verifyQRPassword(slug, password)
      if (res.success && res.data.destination) {
        // Defense-in-depth for finding #3: the backend already refuses non-http(s)
        // destinations, but this is the actual navigation sink, so re-check the
        // scheme here too. A javascript:/data: value never reaches location.href.
        let safe = false
        try {
          const proto = new URL(res.data.destination, window.location.origin).protocol
          safe = proto === "http:" || proto === "https:"
        } catch {
          safe = false
        }
        if (safe) {
          window.location.href = res.data.destination
        } else {
          setError("This QR code points to an unsupported destination.")
        }
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        {/* Who is asking — GenXQR, or the customer on a white-label plan. Never
            nothing: an unidentified page asking for a password is what got this
            one flagged. */}
        <ScanBrandHeader branding={branding} className="mb-7" />

        <div className="text-center mb-7">
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          {/* Names the actual situation instead of the ambiguous "Protected
              Content", which could describe any page on any site. */}
          <h1 className="text-xl font-bold text-white">This QR code is password-protected</h1>
          <p className="text-gray-300 text-sm mt-2 leading-relaxed">
            Whoever created this QR code set a password on it. Ask them for the
            password to see where it leads.
          </p>
          {slug && (
            // Ties the prompt to one specific code, so it reads as a per-item
            // gate rather than a site-wide login screen.
            <p className="mt-3 text-[11px] text-gray-500 font-mono">QR code: {slug}</p>
          )}
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label htmlFor="qr-access-code" className="block text-xs text-gray-400 mb-1.5">
              QR code password
            </label>
            {/* This is a per-QR access code, NOT a GenXQR account credential, and
                the distinction has to be made to the browser as well as to the
                reader. An unnamed, unannotated password field on a public page
                makes Chrome's password manager offer the visitor's saved
                credentials, and Chrome then warns about a password being reused
                somewhere it does not recognise — which is what Search Console
                reports as "Possible phishing detected on user login".

                name is deliberately not "password", and new-password stops a
                saved account credential being offered. Chrome ignores
                autoComplete="off" on password inputs, so "off" would look like a
                fix while changing nothing. */}
            <input
              id="qr-access-code"
              type="password"
              name="qr-access-code"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter the QR code password"
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-indigo-400 focus:bg-white/15 transition-all"
              autoFocus
            />
          </div>

          {error && (
            <div role="alert" className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-xl">
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
            {loading ? "Verifying…" : "Continue"}
          </button>
        </form>

        {/* The explicit disclaimer. Google's test for a deceptive page includes
            "try to trick you into doing something you'd only do for a trusted
            entity, like sharing a password" — so the page says outright that no
            account password belongs here. It is also the honest instruction: a
            visitor really should not type their GenXQR password into this box. */}
        <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <p className="text-xs text-gray-300 leading-relaxed">
            <strong className="text-white">This is not a sign-in page.</strong>{" "}
            It asks only for the password set on this one QR code. Never enter an
            account password — for {branding.mode === "custom" ? "any service" : "GenXQR"} or
            anywhere else — here.
          </p>
        </div>

        <ScanBrandFooter branding={branding} className="mt-8 rounded-xl border-white/10 bg-white/[0.03]" />
      </div>
    </div>
  )
}
