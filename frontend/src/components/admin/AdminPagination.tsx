import { useState } from "react"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"

// ─── Range helper ─────────────────────────────────────────────────────────────

function getPaginationRange(
  current: number,
  total: number,
  siblings = 1,
): (number | "…")[] {
  if (total <= siblings * 2 + 5) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const left  = Math.max(current - siblings, 2)
  const right = Math.min(current + siblings, total - 1)
  const showLeft  = left  > 2
  const showRight = right < total - 1

  const middle: (number | "…")[] = []
  if (showLeft)  middle.push("…")
  for (let p = left; p <= right; p++) middle.push(p)
  if (showRight) middle.push("…")

  return [1, ...middle, total]
}

// ─── Component ────────────────────────────────────────────────────────────────

interface AdminPaginationProps {
  page: number
  totalPages: number
  total: number
  pageSize?: number
  onPageChange: (page: number) => void
}

export default function AdminPagination({
  page,
  totalPages,
  total,
  pageSize = 20,
  onPageChange,
}: AdminPaginationProps) {
  const [jumpValue, setJumpValue] = useState("")

  if (totalPages <= 1) return null

  const rangeStart = ((page - 1) * pageSize + 1).toLocaleString()
  const rangeEnd   = Math.min(page * pageSize, total).toLocaleString()

  function handleJump(e: React.FormEvent) {
    e.preventDefault()
    const val = parseInt(jumpValue, 10)
    if (!isNaN(val) && val >= 1 && val <= totalPages) {
      onPageChange(val)
      setJumpValue("")
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3 border-t border-zinc-800 flex-wrap">
      {/* Entry range */}
      <span className="text-zinc-500 text-xs whitespace-nowrap">
        {rangeStart}–{rangeEnd} of {total.toLocaleString()} entries
      </span>

      {/* Page strip */}
      <div className="flex items-center gap-1">
        {/* First */}
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={page <= 1}
          title="First page"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          <ChevronsLeft size={15} />
        </button>

        {/* Prev */}
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          title="Previous page"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          <ChevronLeft size={15} />
        </button>

        {/* Numbered pages */}
        {getPaginationRange(page, totalPages).map((p, idx) =>
          p === "…" ? (
            <span
              key={`dots-${idx}`}
              className="w-8 h-8 flex items-center justify-center text-zinc-600 text-xs select-none"
            >
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              className={`min-w-8 h-8 px-1.5 rounded-lg text-xs font-medium transition ${
                p === page
                  ? "bg-violet-600 text-white"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-700"
              }`}
            >
              {p}
            </button>
          ),
        )}

        {/* Next */}
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          title="Next page"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          <ChevronRight size={15} />
        </button>

        {/* Last */}
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
          title="Last page"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          <ChevronsRight size={15} />
        </button>
      </div>

      {/* Jump to page */}
      <form onSubmit={handleJump} className="flex items-center gap-2">
        <span className="text-zinc-500 text-xs whitespace-nowrap">Go to</span>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={jumpValue}
          onChange={(e) => setJumpValue(e.target.value)}
          placeholder={String(page)}
          className="w-14 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-white text-center placeholder-zinc-600 focus:outline-none focus:border-violet-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          type="submit"
          className="px-2.5 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs rounded-lg transition"
        >
          Go
        </button>
      </form>
    </div>
  )
}
