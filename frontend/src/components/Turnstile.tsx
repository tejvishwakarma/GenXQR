import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"

/**
 * Cloudflare Turnstile widget (added 25 Oct 2026) for register, login and
 * contact. Enabled only when VITE_TURNSTILE_SITE_KEY is set, matching the
 * backend, which skips the check when its secret key is unset — so with no keys
 * the forms behave exactly as before.
 *
 * The site CSP must allow https://challenges.cloudflare.com in script-src and
 * frame-src (see deploy/*.conf), or the widget is blocked in production.
 */

const SITE_KEY = ((import.meta.env["VITE_TURNSTILE_SITE_KEY"] as string | undefined) ?? "").trim()
export const TURNSTILE_ENABLED = SITE_KEY.length > 0

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  reset: (id?: string) => void
  remove: (id: string) => void
}
declare global {
  interface Window { turnstile?: TurnstileApi }
}

let scriptPromise: Promise<void> | null = null
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script")
    s.src = SCRIPT_SRC
    s.async = true
    s.defer = true
    s.addEventListener("load", () => resolve())
    s.addEventListener("error", () => { scriptPromise = null; reject(new Error("Turnstile script failed to load")) })
    document.head.appendChild(s)
  })
  return scriptPromise
}

export interface TurnstileHandle {
  /** Clears the current token and shows a fresh challenge (tokens are single-use). */
  reset: () => void
}

interface Props {
  /** Called with a fresh token when the challenge is solved. */
  onVerify: (token: string) => void
  /** Called when the token expires or the widget errors — the token is no longer valid. */
  onExpire?: () => void
}

/**
 * Renders the widget, or nothing when Turnstile is not configured. Pages read
 * TURNSTILE_ENABLED to decide whether a token is required before submitting.
 */
export const Turnstile = forwardRef<TurnstileHandle, Props>(function Turnstile({ onVerify, onExpire }, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  // Keep the latest callbacks without re-rendering the widget.
  const onVerifyRef = useRef(onVerify)
  const onExpireRef = useRef(onExpire)
  onVerifyRef.current = onVerify
  onExpireRef.current = onExpire

  useImperativeHandle(ref, () => ({
    reset: () => {
      try { if (widgetIdRef.current && window.turnstile) window.turnstile.reset(widgetIdRef.current) } catch { /* ignore */ }
    },
  }), [])

  useEffect(() => {
    if (!TURNSTILE_ENABLED) return
    let cancelled = false
    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          theme: "auto",
          callback: (token: string) => onVerifyRef.current(token),
          "expired-callback": () => onExpireRef.current?.(),
          "error-callback": () => onExpireRef.current?.(),
        })
      })
      .catch(() => { /* script blocked/offline: pages still submit; the server decides */ })
    return () => {
      cancelled = true
      try { if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current) } catch { /* ignore */ }
      widgetIdRef.current = null
    }
  }, [])

  if (!TURNSTILE_ENABLED) return null
  return <div ref={containerRef} className="flex justify-center" />
})
