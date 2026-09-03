/**
 * Frame picker — thumbnailed, grouped by category, searchable.
 *
 * The old picker was a flat grid of text buttons, which worked at 16 frames and
 * breaks completely at 40+: nobody recognises "Pine & Baubles" from a label. So
 * every entry renders a real thumbnail via the frame engine's <FrameThumb>,
 * meaning the thumbnail, the live preview and the downloaded file are all the
 * same scene — a frame cannot look different in the picker than in the export.
 *
 * Categories come from the frames themselves (see the manifest), so an added
 * asset frame appears here automatically with no edit to this file.
 */
import { useMemo, useState } from "react"
import { ChevronDown, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { FRAME_OPTIONS, FrameThumb, type FrameOption } from "@/lib/qr-frames"

/**
 * Everyday categories lead; occasion packs follow alphabetically. Anything not
 * listed sorts after these, so a new category never has to be registered here.
 */
const CATEGORY_ORDER = ["Basic", "Standard", "Call to Action", "Labels", "Borders", "Neon", "Decorative"]

function categoryRank(name: string): number {
  const i = CATEGORY_ORDER.indexOf(name)
  return i === -1 ? CATEGORY_ORDER.length : i
}

interface Group {
  category: string
  frames: FrameOption[]
}

function groupFrames(query: string): Group[] {
  const q = query.trim().toLowerCase()
  const matches = q
    ? FRAME_OPTIONS.filter(
        (f) => f.label.toLowerCase().includes(q) || f.category.toLowerCase().includes(q) || f.id.includes(q),
      )
    : FRAME_OPTIONS

  const byCategory = new Map<string, FrameOption[]>()
  for (const f of matches) {
    const list = byCategory.get(f.category)
    if (list) list.push(f)
    else byCategory.set(f.category, [f])
  }

  return [...byCategory.entries()]
    .map(([category, frames]) => ({ category, frames }))
    .sort((a, b) => categoryRank(a.category) - categoryRank(b.category) || a.category.localeCompare(b.category))
}

export function FramePicker({
  value,
  onChange,
  color,
  text,
}: {
  value: string
  onChange: (id: string) => void
  /** Passed through to thumbnails so they reflect the user's own colour/text. */
  color: string
  text: string
}) {
  const [query, setQuery] = useState("")
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const groups = useMemo(() => groupFrames(query), [query])
  const total = groups.reduce((n, g) => n + g.frames.length, 0)

  return (
    <div>
      {/* Search */}
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${FRAME_OPTIONS.length} frames…`}
          aria-label="Search frames"
          className="w-full h-10 pl-9 pr-9 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:border-violet-500"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear frame search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="max-h-[26rem] overflow-y-auto pr-1 -mr-1 space-y-3">
        {total === 0 && (
          <p className="text-sm text-zinc-500 text-center py-8">
            No frames match “{query}”.
          </p>
        )}

        {groups.map(({ category, frames }) => {
          // While searching, keep every matching group open regardless of state.
          const isOpen = query.trim() ? true : !collapsed[category]
          return (
            <section key={category}>
              <button
                type="button"
                onClick={() => setCollapsed((c) => ({ ...c, [category]: !c[category] }))}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between gap-2 py-1.5 text-left group"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 group-hover:text-zinc-700 dark:group-hover:text-zinc-300">
                  {category}
                  <span className="ml-1.5 font-normal normal-case tracking-normal text-zinc-400">{frames.length}</span>
                </span>
                <ChevronDown
                  size={14}
                  className={cn("text-zinc-400 transition-transform shrink-0", isOpen && "rotate-180")}
                />
              </button>

              {isOpen && (
                <div className="grid grid-cols-4 gap-2 pt-1">
                  {frames.map((f) => {
                    const selected = value === f.id
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => onChange(f.id)}
                        title={f.label}
                        aria-pressed={selected}
                        className={cn(
                          "group rounded-xl border p-1.5 transition-all flex flex-col items-center gap-1",
                          selected
                            ? "border-violet-500 bg-violet-500/10 ring-1 ring-violet-500/40"
                            : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600",
                        )}
                      >
                        <div className="h-[76px] w-full flex items-center justify-center overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800/60">
                          <FrameThumb frameStyle={f.id} color={color} text={text} px={72} />
                        </div>
                        <span
                          className={cn(
                            "text-[10px] leading-tight text-center truncate w-full",
                            selected ? "text-violet-500 dark:text-violet-400 font-medium" : "text-zinc-500",
                          )}
                        >
                          {f.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
