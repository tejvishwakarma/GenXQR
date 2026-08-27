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
