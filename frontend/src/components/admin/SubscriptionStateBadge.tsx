import type { SubscriptionState, SubscriptionStateKey } from "@/lib/api"

/**
 * A subscription as the admin panel shows it: what it is doing, worked out by
 * the server from the plan and its dates (backend subscription-state.ts). The
 * raw `status` column is ACTIVE for paying, lapsed and free accounts alike.
 */

const STYLES: Record<SubscriptionStateKey, string> = {
  trial:      "bg-blue-500/15 text-blue-400 ring-blue-500/30",
  paid:       "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
  cancelling: "bg-amber-500/15 text-amber-400 ring-amber-500/30",
  notice:     "bg-orange-500/15 text-orange-400 ring-orange-500/30",
  ending:     "bg-red-500/15 text-red-400 ring-red-500/30",
  free:       "bg-zinc-700/60 text-zinc-400 ring-zinc-600/40",
  other:      "bg-zinc-700/60 text-zinc-400 ring-zinc-600/40",
}

/** Filter options, in lifecycle order. */
export const STATE_FILTERS: { key: SubscriptionStateKey; label: string }[] = [
  { key: "trial", label: "Trial" },
  { key: "paid", label: "Paid" },
  { key: "cancelling", label: "Cancelled" },
  { key: "notice", label: "Expired · notice" },
  { key: "ending", label: "Expired · moving to Free" },
  { key: "free", label: "Free" },
]

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : ""

export function describeState(s: SubscriptionState, rawStatus?: string): { label: string; detail: string | null; className: string } {
  const ended = s.wasTrial ? "Trial ended" : "Expired"
  const { label, detail } = (() => {
    switch (s.key) {
      case "trial":      return { label: "Trial", detail: `ends ${day(s.date)}` }
      case "paid":       return { label: "Paid", detail: `until ${day(s.date)}` }
      case "cancelling": return { label: "Cancelled", detail: `ends ${day(s.date)}` }
      case "notice":     return { label: ended, detail: `codes pause ${day(s.date)}` }
      case "ending":     return { label: ended, detail: "moving to Free" }
      case "free":       return { label: "Free", detail: s.date ? `since ${day(s.date)}` : null }
      case "other":      return { label: rawStatus ?? "Unknown", detail: null }
    }
  })()
  return { label, detail, className: STYLES[s.key] }
}

export function SubscriptionStateBadge({ state, rawStatus, showDetail = true }: { state: SubscriptionState; rawStatus?: string; showDetail?: boolean }) {
  const d = describeState(state, rawStatus)
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={d.detail ? `${d.label} · ${d.detail}` : d.label}>
      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${d.className}`}>{d.label}</span>
      {showDetail && d.detail && <span className="text-zinc-500 text-xs">{d.detail}</span>}
    </span>
  )
}
