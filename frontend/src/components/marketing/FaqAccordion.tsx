import { useId, useState } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

// Reusable FAQ accordion (list only, no heading) — every inner marketing page
// drops this under its own <SectionHead>/<PageHero>. Extracted from the
// homepage's original inline FaqItem so the same accordion behaviour and
// styling is shared everywhere instead of being re-implemented per page.
// The answer is always in the HTML and only HIDDEN when collapsed (`hidden`),
// not added on click: crawlers and AI search tools read the answer text, and
// one that only exists after a click is invisible to them.
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  const answerId = useId()
  return (
    <div className="rounded-2xl border border-line bg-paper-pure overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left text-sm font-medium text-ink hover:bg-ink/[0.02] transition-colors"
        aria-expanded={open}
        aria-controls={answerId}
      >
        <span>{q}</span>
        <ChevronDown size={16} className={cn("shrink-0 text-ink-faint transition-transform duration-300", open && "rotate-180")} />
      </button>
      <div id={answerId} hidden={!open} className="px-6 pb-5 pt-4 border-t border-line text-sm leading-relaxed text-ink-soft">
        {a}
      </div>
    </div>
  )
}

export function FaqAccordion({ items, className = "" }: { items: { q: string; a: string }[]; className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      {items.map((f) => (
        <FaqItem key={f.q} q={f.q} a={f.a} />
      ))}
    </div>
  )
}
