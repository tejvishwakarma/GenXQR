import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Reads localStorage from a place that may not have it.
 *
 * The marketing pages are prerendered to static HTML at build time (see
 * scripts/prerender.mjs), which runs the render phase in Node where there is no
 * localStorage. Effects never run during that pass, so anything inside useEffect
 * is already safe — but a useState LAZY INITIALIZER does run, and an unguarded
 * `useState(() => localStorage.getItem(k))` throws and fails the whole build.
 *
 * Returns null when storage is unavailable, so the server render always produces
 * the logged-out, light-theme markup. The client corrects it on hydration, which
 * is the same first paint visitors already got before prerendering existed.
 *
 * Also catches: Safari in private mode and "block third-party cookies" throw on
 * access rather than returning null.
 */
export function readStoredValue(key: string): string | null {
  try {
    if (typeof localStorage === "undefined") return null
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * The page's accent: the code's page colour, unless it is too light to carry
 * white text (codes made through the API default it to white), then its dot colour.
 */
export function readableAccent(design: Record<string, unknown>): string {
  const light = (c: string) => {
    const h = c.replace("#", "")
    if (!/^[0-9a-f]{6}$/i.test(h)) return true
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
    return 0.299 * r! + 0.587 * g! + 0.114 * b! > 186
  }
  for (const c of [design.secondaryColor, design.primaryColor]) if (typeof c === "string" && !light(c)) return c
  return "#7c3aed"
}
