/**
 * Microsoft Clarity (session recordings + heatmaps).
 *
 * Loads ONLY when VITE_CLARITY_PROJECT_ID is set, so local and preview builds
 * leave it blank and record nothing — same opt-in-per-environment rule as GA
 * (analytics.ts).
 *
 * Clarity's copy-paste snippet is an INLINE <script>, which this site's CSP
 * forbids (script-src 'self', no 'unsafe-inline' — see deploy/*.conf and the
 * prerender's "no inline scripts" guarantee). So the snippet's bootstrap lives
 * here, in a module served from our own origin, and only the external tag it
 * injects (https://www.clarity.ms/tag/<id>) needs a CSP allowance:
 *   script-src  https://*.clarity.ms (the tag pulls the recorder from scripts.clarity.ms)
 *   connect-src https://*.clarity.ms https://c.bing.com
 * Without those, Clarity loads nothing. Keep them in step with this file.
 */

const projectId = ((import.meta.env["VITE_CLARITY_PROJECT_ID"] as string | undefined) ?? "").trim()

type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[] }
declare global {
  interface Window { clarity?: ClarityFn }
}

let initialised = false

/** True when a Clarity project id is configured. */
export function isClarityEnabled(): boolean {
  return projectId.length > 0
}

/**
 * Injects the Clarity tag. Safe to call more than once — later calls are
 * ignored. This is the official bootstrap, lifted out of the inline snippet:
 * it stubs `window.clarity` as a command queue, then loads the external tag,
 * which drains the queue once it is ready.
 */
export function initClarity(): void {
  if (initialised || typeof window === "undefined") return
  if (!isClarityEnabled()) return
  initialised = true

  const clarity: ClarityFn = function (...args: unknown[]) {
    ;(clarity.q = clarity.q ?? []).push(args)
  }
  window.clarity = window.clarity ?? clarity

  const script = document.createElement("script")
  script.async = true
  script.src = `https://www.clarity.ms/tag/${encodeURIComponent(projectId)}?ref=bwt`
  script.addEventListener("error", () => {
    // Usually a CSP block or an ad/tracker blocker. Not fatal, but silent otherwise.
    console.warn("[clarity] tag failed to load — check CSP script-src and any blockers.")
  })
  document.head.appendChild(script)
}
