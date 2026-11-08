import { useState } from "react"
import { ChevronDown, Tags } from "lucide-react"
import { cn } from "@/lib/utils"

const FIELDS = [
  { key: "utm_source", label: "Source", placeholder: "qr" },
  { key: "utm_medium", label: "Medium", placeholder: "print" },
  { key: "utm_campaign", label: "Campaign", placeholder: "diwali_2026" },
  { key: "utm_content", label: "Content (optional)", placeholder: "poster_a" },
  { key: "utm_term", label: "Term (optional)", placeholder: "" },
] as const

type Key = (typeof FIELDS)[number]["key"]

/** The URL parsed leniently (a typed "example.com" counts), or null while it isn't one. */
function parse(url: string): URL | null {
  const s = url.trim()
  if (!s) return null
  try {
    return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`)
  } catch {
    return null
  }
}

/**
 * UTM tags on the destination URL, so scans show up as their own campaign in
 * Google Analytics and other tools. Edits the URL in place: the tags are read
 * from it and written back, so the URL field stays the single source of truth.
 */
export function UtmBuilder({ url, onChange }: { url: string; onChange: (url: string) => void }) {
  const parsed = parse(url)
  const hasTags = !!parsed && FIELDS.some((f) => parsed.searchParams.has(f.key))
  const [open, setOpen] = useState(hasTags)

  const set = (key: Key, value: string) => {
    const u = parse(url)
    if (!u) return
    // Not trimmed: a space typed mid-word would vanish before the next letter.
    if (value) u.searchParams.set(key, value)
    else u.searchParams.delete(key)
    onChange(u.toString())
  }

  const preset = () => {
    const u = parse(url)
    if (!u) return
    if (!u.searchParams.get("utm_source")) u.searchParams.set("utm_source", "qr")
    if (!u.searchParams.get("utm_medium")) u.searchParams.set("utm_medium", "print")
    onChange(u.toString())
  }

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm text-zinc-700 dark:text-zinc-300"
      >
        <span className="inline-flex items-center gap-2">
          <Tags size={15} className="text-violet-500" />
          UTM tags {hasTags ? <span className="text-xs text-emerald-600 dark:text-emerald-400">on</span> : <span className="text-xs text-zinc-500">(campaign tracking, optional)</span>}
        </span>
        <ChevronDown size={15} className={cn("text-zinc-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-3">
          {!parsed ? (
            <p className="text-xs text-zinc-500">Enter the website URL first.</p>
          ) : (
            <>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Added to the link people land on, so Google Analytics shows these visits as their own campaign.{" "}
                <button type="button" onClick={preset} className="text-violet-500 hover:underline">Use qr / print</button>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {FIELDS.map((f) => (
                  <div key={f.key}>
                    <label htmlFor={f.key} className="label-text">{f.label}</label>
                    <input
                      id={f.key}
                      value={parsed.searchParams.get(f.key) ?? ""}
                      onChange={(e) => set(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      autoCapitalize="none"
                      spellCheck={false}
                      className="input-field py-2"
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
