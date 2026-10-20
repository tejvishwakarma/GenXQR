import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { AlertTriangle, Ban, Check, Lock, RotateCcw, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { PlanChip } from "@/components/PlanFeatureGate"
import { FRAME_CATALOG, SHAPE_PALETTE } from "@/lib/frames/catalog"
import {
  darkenForFrame,
  dotContrast,
  fieldMaxLength,
  frameThumbUrl,
  getFrame,
  MIN_FRAME_DOT_CONTRAST,
  normaliseHex,
  shapeColor,
  type FrameFields,
} from "@/lib/frames/compose"
import type { FrameEntry, FrameFieldId, FrameGroup } from "@/lib/frames/types"

const TABS: { id: FrameGroup; label: string }[] = [
  { id: "shape", label: "Shapes" },
  { id: "premium", label: "Premium" },
  { id: "occasion", label: "Occasions" },
]

const SHAPE_FILTERS = [
  { id: "all", label: "All" },
  { id: "everyday", label: "Everyday" },
  { id: "objects", label: "Objects" },
  { id: "food", label: "Food & drink" },
  { id: "occasions", label: "Celebrations" },
] as const

const FIELD_LABEL: Record<FrameFieldId, string> = {
  title: "Heading",
  cta: "Call to action",
  brand: "Brand name",
  url: "Website",
  date: "Date",
  year: "Year",
  names: "Names",
  seat: "Seat",
  monogram: "Monogram",
  line1: "Extra text",
  line2: "Extra text 2",
  line3: "Extra text 3",
}

/** cta first — it is the line every frame has and the one most people change. */
const FIELD_ORDER: FrameFieldId[] = ["cta", "brand", "title", "names", "date", "year", "seat", "url", "monogram", "line1", "line2", "line3"]

const COUNTS = FRAME_CATALOG.reduce<Record<string, number>>((acc, f) => {
  acc[f.group] = (acc[f.group] ?? 0) + 1
  return acc
}, {})

export interface FramePickerProps {
  /** Selected frame: a library id, "none", or a classic frame id still saved on an older code. */
  value: string
  onChange: (frameId: string) => void
  /** Shape colour as saved; null/invalid means the shape's default. */
  color: string | null
  onColorChange: (color: string | null) => void
  fields: FrameFields
  onFieldsChange: (fields: FrameFields) => void
  /** The code's dot and background colours, for the scan-safety check. */
  dotColor: string
  panelColor: string
  onDotColorChange: (color: string) => void
  /** Not on a plan with premiumFrames: frames can be previewed, not saved. */
  locked: boolean
  requiredPlan: string
  /** Name of the classic frame saved on this code, if any, so it is not silently dropped. */
  classicLabel?: string | null
}

export function FramePicker(props: FramePickerProps) {
  const { value, onChange, locked, requiredPlan, classicLabel } = props
  const selected = getFrame(value)
  const [tab, setTab] = useState<FrameGroup>(selected?.group ?? "shape")
  const [filter, setFilter] = useState<(typeof SHAPE_FILTERS)[number]["id"]>("all")

  const visible = useMemo(
    () =>
      FRAME_CATALOG.filter(
        (f) => f.group === tab && (tab !== "shape" || filter === "all" || f.category === filter),
      ),
    [tab, filter],
  )

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          <Sparkles size={14} className="text-violet-400" /> Frame
          {locked && <PlanChip plan={requiredPlan} />}
        </h3>
        {value !== "none" && (
          <button
            type="button"
            onClick={() => onChange("none")}
            className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            Remove frame
          </button>
        )}
      </div>

      {locked && (
        <div className="mb-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-xs text-violet-900 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200">
          Frames are included in every paid plan. You can try them on here; saving one needs{" "}
          <Link to="/app/billing" className="font-semibold underline underline-offset-2">
            {requiredPlan} or above
          </Link>
          .
        </div>
      )}

      {classicLabel && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-700">
          <span className="text-zinc-600 dark:text-zinc-400">
            Current frame: <span className="font-medium text-zinc-800 dark:text-zinc-200">{classicLabel}</span> (classic)
          </span>
          <span className="text-zinc-500">Pick a new frame below to replace it</span>
        </div>
      )}

      {/* Group tabs */}
      <div role="tablist" className="mb-3 flex gap-1 rounded-xl border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-800 dark:bg-zinc-900">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all",
              tab === t.id
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200",
            )}
          >
            {t.label} <span className="font-normal text-zinc-400">{COUNTS[t.id]}</span>
          </button>
        ))}
      </div>

      {tab === "shape" && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {SHAPE_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                filter === f.id
                  ? "border-violet-500 bg-violet-500/10 text-violet-600 dark:text-violet-300"
                  : "border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-800 dark:border-zinc-700 dark:hover:text-zinc-200",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Gallery */}
      <div className="grid max-h-[26rem] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => onChange("none")}
          aria-pressed={value === "none"}
          className={cn(
            "flex aspect-[5/7] flex-col items-center justify-center gap-1.5 rounded-xl border text-[11px] font-medium transition-all",
            value === "none"
              ? "border-violet-500 bg-violet-500/10 text-violet-600 ring-2 ring-violet-500/30 dark:text-violet-300"
              : "border-dashed border-zinc-300 text-zinc-500 hover:border-zinc-400 dark:border-zinc-700",
          )}
        >
          <Ban size={18} />
          No frame
        </button>
        {visible.map((f) => (
          <FrameTile key={f.id} entry={f} selected={value === f.id} locked={locked} onSelect={() => onChange(f.id)} />
        ))}
      </div>

      {selected && <FrameSettings {...props} entry={selected} />}
    </div>
  )
}

function FrameTile({
  entry,
  selected,
  locked,
  onSelect,
}: {
  entry: FrameEntry
  selected: boolean
  locked: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      title={entry.title}
      className={cn(
        "group relative flex aspect-[5/7] items-center justify-center rounded-xl border bg-zinc-50 p-1.5 transition-all dark:bg-zinc-900",
        selected
          ? "border-violet-500 ring-2 ring-violet-500/30"
          : "border-zinc-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:hover:border-zinc-600",
      )}
    >
      <img
        src={frameThumbUrl(entry)}
        alt=""
        loading="lazy"
        decoding="async"
        className="max-h-full max-w-full object-contain"
        draggable={false}
      />
      <span className="sr-only">{entry.title}</span>
      {selected && (
        <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-white shadow">
          <Check size={12} strokeWidth={3} />
        </span>
      )}
      {locked && !selected && (
        <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-zinc-500 shadow-sm dark:bg-zinc-800/90">
          <Lock size={10} />
        </span>
      )}
      <span className="pointer-events-none absolute inset-x-1 bottom-1 truncate rounded-md bg-white/90 px-1 py-0.5 text-center text-[10px] font-medium text-zinc-700 opacity-0 transition-opacity group-hover:opacity-100 dark:bg-zinc-900/90 dark:text-zinc-300">
        {entry.title}
      </span>
    </button>
  )
}

function FrameSettings({
  entry,
  color,
  onColorChange,
  fields,
  onFieldsChange,
  dotColor,
  panelColor,
  onDotColorChange,
}: FramePickerProps & { entry: FrameEntry }) {
  const current = shapeColor(entry, color)
  const lowContrast = dotContrast(dotColor, panelColor) < MIN_FRAME_DOT_CONTRAST
  const darker = darkenForFrame(dotColor, panelColor)
  const ordered = [...entry.fields].sort((a, b) => FIELD_ORDER.indexOf(a.id) - FIELD_ORDER.indexOf(b.id))

  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">{entry.title}</p>
        <p className="text-[11px] text-zinc-500">
          {entry.group === "shape" ? "Shape" : entry.group === "premium" ? "Premium" : "Occasion"} frame
        </p>
      </div>

      {entry.group === "shape" && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs text-zinc-500">Frame colour</label>
            {normaliseHex(color) && normaliseHex(color) !== entry.defaultColor && (
              <button
                type="button"
                onClick={() => onColorChange(null)}
                className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              >
                <RotateCcw size={11} /> Default
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {SHAPE_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onColorChange(c)}
                aria-label={`Frame colour ${c}`}
                aria-pressed={current === c}
                className={cn(
                  "h-7 w-7 rounded-full border-2 transition-transform hover:scale-110",
                  current === c ? "border-zinc-900 ring-2 ring-violet-500/40 dark:border-white" : "border-white dark:border-zinc-800",
                )}
                style={{ backgroundColor: c }}
              />
            ))}
            <label
              className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border-2 border-dashed border-zinc-300 dark:border-zinc-600"
              title="Custom colour"
            >
              <input
                type="color"
                value={current}
                onChange={(e) => onColorChange(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
              <span
                className="block h-full w-full"
                style={{ background: "conic-gradient(#F0524F,#F5A524,#138A55,#1D8FE0,#5B4BFF,#E0457B,#F0524F)" }}
              />
            </label>
            <Input
              value={current}
              onChange={(e) => {
                const v = normaliseHex(e.target.value)
                if (v) onColorChange(v)
              }}
              className="h-8 w-24 font-mono text-xs"
              maxLength={7}
              aria-label="Frame colour hex"
            />
          </div>
        </div>
      )}

      {ordered.length > 0 && (
        <div className="space-y-3">
          {ordered.map((f) => (
            <div key={f.id}>
              <label htmlFor={`frame-field-${f.id}`} className="mb-1.5 block text-xs text-zinc-500">
                {FIELD_LABEL[f.id]}
              </label>
              <Input
                id={`frame-field-${f.id}`}
                value={fields[f.id] ?? ""}
                placeholder={f.default}
                maxLength={fieldMaxLength(f)}
                onChange={(e) => onFieldsChange({ ...fields, [f.id]: e.target.value })}
                className="text-sm"
              />
            </div>
          ))}
          <p className="text-[11px] text-zinc-500">
            Empty fields keep the text shown. Longer text is narrowed to fit the frame — check the preview.
          </p>
        </div>
      )}

      {lowContrast && (
        <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <div className="space-y-2">
            <p>
              Your QR dots are light for a framed code. Next to busy artwork, phones read darker dots more reliably.
            </p>
            <button
              type="button"
              onClick={() => onDotColorChange(darker)}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-900 px-2.5 py-1.5 font-medium text-white hover:bg-amber-800 dark:bg-amber-400 dark:text-amber-950 dark:hover:bg-amber-300"
            >
              <span className="h-3.5 w-3.5 rounded-full border border-white/60" style={{ backgroundColor: darker }} />
              Use a darker shade ({darker})
            </button>
          </div>
        </div>
      )}

      <p className="text-[11px] text-zinc-500">For print, keep the code itself at least 2.5 cm wide and test it on a phone first.</p>
    </div>
  )
}
