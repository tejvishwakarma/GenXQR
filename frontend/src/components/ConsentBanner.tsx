import { useEffect, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import {
  CONSENT_OPEN, configuredTrackers, consentRelevantOn, readConsent, saveConsent, type Consent,
} from "@/lib/consent"

/**
 * Asks before GenXQR's own analytics load (lib/consent.ts). Shown on pages
 * where a configured tracker could run, until the visitor chooses; reopened by
 * openConsentSettings(). Rendered only after mount, so the prerendered HTML
 * never contains it and a returning visitor never sees it flash.
 */
export function ConsentBanner() {
  const { pathname } = useLocation()
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [details, setDetails] = useState(false)
  const [choice, setChoice] = useState<Consent>({ analytics: false, recordings: false })
  const trackers = configuredTrackers()

  useEffect(() => {
    setMounted(true)
    const onOpen = () => {
      setChoice(readConsent() ?? { analytics: false, recordings: false })
      setDetails(true)
      setOpen(true)
    }
    window.addEventListener(CONSENT_OPEN, onOpen)
    return () => window.removeEventListener(CONSENT_OPEN, onOpen)
  }, [])

  useEffect(() => {
    if (readConsent() === null && consentRelevantOn(pathname)) setOpen(true)
  }, [pathname])

  if (!mounted || !open || (!trackers.analytics && !trackers.recordings)) return null

  const decide = (c: Consent) => {
    saveConsent(c)
    setOpen(false)
    setDetails(false)
  }

  return (
    <div
      role="dialog"
      aria-labelledby="consent-title"
      aria-describedby="consent-text"
      className="fixed inset-x-4 bottom-4 z-[60] mx-auto max-w-lg rounded-2xl border border-line bg-paper-pure p-5 text-ink shadow-2xl sm:left-6 sm:right-auto sm:mx-0"
    >
      <h2 id="consent-title" className="font-display text-base font-bold">Cookies on GenXQR</h2>
      <p id="consent-text" className="mt-2 text-sm leading-relaxed text-ink-soft">
        We'd like to use analytics cookies to see how our site is used and improve it. They're off unless you
        allow them. Cookies that keep you signed in are always on.{" "}
        <Link to="/cookie-policy" className="font-medium text-accent hover:text-accent-ink underline underline-offset-2">
          Cookie Policy
        </Link>
      </p>

      {details && (
        <fieldset className="mt-4 space-y-3">
          <legend className="sr-only">Choose which analytics to allow</legend>
          {trackers.analytics && (
            <Toggle
              id="consent-analytics"
              checked={choice.analytics}
              onChange={(v) => setChoice((c) => ({ ...c, analytics: v }))}
              title="Usage statistics"
              text="Google Analytics counts visits and which pages are used. Not used on admin or scan pages."
            />
          )}
          {trackers.recordings && (
            <Toggle
              id="consent-recordings"
              checked={choice.recordings}
              onChange={(v) => setChoice((c) => ({ ...c, recordings: v }))}
              title="Session recordings"
              text="Microsoft Clarity records clicks, scrolling and the pages viewed, on our public pages only."
            />
          )}
        </fieldset>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {details ? (
          <>
            <button type="button" onClick={() => decide(choice)} className={BTN}>Save choices</button>
            {readConsent() !== null && (
              <button
                type="button"
                onClick={() => { setOpen(false); setDetails(false) }}
                className="px-2 py-2 text-sm font-medium text-ink-soft hover:text-ink underline underline-offset-2"
              >
                Cancel
              </button>
            )}
          </>
        ) : (
          <>
            <button type="button" onClick={() => decide({ analytics: false, recordings: false })} className={BTN}>Reject</button>
            <button type="button" onClick={() => decide({ analytics: true, recordings: true })} className={BTN}>Accept</button>
            <button
              type="button"
              onClick={() => { setChoice(readConsent() ?? { analytics: false, recordings: false }); setDetails(true) }}
              className="px-2 py-2 text-sm font-medium text-ink-soft hover:text-ink underline underline-offset-2"
            >
              Choose
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/** Reject and Accept look the same on purpose: refusing must be as easy as agreeing. */
const BTN = "min-w-[96px] rounded-xl border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent hover:text-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"

function Toggle({ id, checked, onChange, title, text }: {
  id: string; checked: boolean; onChange: (v: boolean) => void; title: string; text: string
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[rgb(var(--mkt-accent))]"
      />
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs leading-relaxed text-ink-soft">{text}</span>
      </span>
    </label>
  )
}
