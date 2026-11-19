/**
 * Hands a code made on the free generator (/generate) to the dashboard editor,
 * so "Make it trackable" opens a new dynamic code with the same content filled
 * in, even across sign-up (Google returns straight to /app/create; email
 * sign-up goes through verification and lands on the dashboard, which forwards
 * to the editor while a draft is waiting).
 *
 * Stored only when the visitor clicks the offer, in this browser only, and only
 * for a few hours: it can hold a Wi-Fi password. Taking it deletes it.
 */

const KEY = "genxqr_generator_draft"
const TTL_MS = 6 * 60 * 60 * 1000

interface Draft {
  /** The text the free code holds (buildQRData's output), e.g. "WIFI:T:WPA;S:…". */
  data: string
  savedAt: number
}

export function saveGeneratorDraft(data: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ data, savedAt: Date.now() } satisfies Draft))
  } catch {
    // Private mode or storage blocked: the editor just opens empty.
  }
}

function read(): Draft | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as Partial<Draft>
    if (typeof d.data !== "string" || typeof d.savedAt !== "number" || Date.now() - d.savedAt > TTL_MS) {
      localStorage.removeItem(KEY)
      return null
    }
    return { data: d.data, savedAt: d.savedAt }
  } catch {
    return null
  }
}

/** Whether a fresh draft is waiting (the dashboard forwards to the editor). */
export function hasGeneratorDraft(): boolean {
  return read() !== null
}

/** Returns the waiting draft's content and deletes it. */
export function takeGeneratorDraft(): string | null {
  const d = read()
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
  return d?.data ?? null
}
