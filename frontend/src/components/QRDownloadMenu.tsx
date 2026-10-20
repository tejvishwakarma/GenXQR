import { useState, useRef, useCallback, useEffect } from "react"
import { createPortal } from "react-dom"
import { Loader2, Download } from "lucide-react"
import type { QRCode } from "@/lib/api"
import { cn } from "@/lib/utils"
import { downloadQR, type QRDownloadExt } from "@/lib/qrDownload"

/**
 * Per-QR download button + format menu (PNG / SVG / JPEG / WebP / PDF).
 * Renders through lib/qrDownload, the same path as the detail page, so the
 * code's frame (library or classic) is part of the file.
 * Shared by the dashboard and the dedicated My QR Codes page.
 */
/** w-48 in Tailwind. Kept in sync by hand because the value is needed before paint. */
const MENU_W = 192
/** Roughly the natural height of the five format rows plus the heading. */
const MENU_MAX_H = 330
/** Never shrink below this — below it, scroll inside the menu instead. */
const MENU_MIN_H = 140
const GAP = 6
const EDGE = 8

type MenuPos = {
  left: number
  /** Exactly one of top/bottom is set: bottom is used when the menu opens upwards. */
  top?: number
  bottom?: number
  maxHeight: number
}

export function DownloadMenu({ qr }: { qr: QRCode }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [menuPos, setMenuPos] = useState<MenuPos>({ left: 0, top: 0, maxHeight: MENU_MAX_H })
  const btnRef = useRef<HTMLButtonElement>(null)

  const handleDownload = useCallback(async (ext: QRDownloadExt) => {
    setLoading(true)
    setOpen(false)
    setFailed(false)
    try {
      // Same renderer as the detail page, so the code's frame is included.
      await downloadQR(qr, ext)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [qr])

  const openMenu = useCallback(() => {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const spaceBelow = vh - rect.bottom
    const spaceAbove = rect.top

    // Right-align the menu to the button, but never let it cross either viewport
    // edge — the old version computed `right` from the button alone, which went
    // negative for a button flush against the right edge of the window.
    const left = Math.max(EDGE, Math.min(rect.right - MENU_W, vw - MENU_W - EDGE))

    // Open upwards when there is not enough room below. Without this the menu was
    // planted 271px under a button that could be a few pixels from the bottom of
    // the screen, so it rendered entirely below the fold — and because scrolling
    // closes the menu, it could not be reached by scrolling either.
    const flipUp = spaceBelow < MENU_MAX_H && spaceAbove > spaceBelow

    setMenuPos(flipUp
      ? { left, bottom: vh - rect.top + GAP, maxHeight: Math.max(MENU_MIN_H, spaceAbove - GAP - EDGE) }
      : { left, top: rect.bottom + GAP,      maxHeight: Math.max(MENU_MIN_H, spaceBelow - GAP - EDGE) })
    setOpen(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", close)
    document.addEventListener("scroll", close, true)
    window.addEventListener("resize", close)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("scroll", close, true)
      window.removeEventListener("resize", close)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const formats: { ext: QRDownloadExt; label: string; hint: string }[] = [
    { ext: "png",  label: "PNG",  hint: "Best for web & print" },
    { ext: "svg",  label: "SVG",  hint: "Vector, infinitely scalable" },
    { ext: "jpeg", label: "JPEG", hint: "Smaller file size" },
    { ext: "webp", label: "WebP", hint: "Modern web format" },
    { ext: "pdf",  label: "PDF",  hint: "Ready to print" },
  ]

  return (
    <>
      <button
        ref={btnRef}
        onClick={openMenu}
        disabled={loading}
        className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center hover:text-violet-400 hover:bg-violet-500/10 transition-colors disabled:opacity-40",
          failed ? "text-red-500" : "text-zinc-500",
        )}
        title={failed ? "Download failed — try again" : "Download QR"}
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
      </button>
      {open && createPortal(
        <div
          role="menu"
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            left: menuPos.left,
            top: menuPos.top,
            bottom: menuPos.bottom,
            maxHeight: menuPos.maxHeight,
          }}
          className="z-[9999] overflow-y-auto bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl shadow-2xl w-48 py-1 text-sm"
        >
          <div className="px-3 py-1.5 text-zinc-500 text-[10px] uppercase tracking-widest font-semibold border-b border-zinc-200 dark:border-zinc-800 mb-1">
            Download as
          </div>
          {formats.map(({ ext, label, hint }) => (
            <button
              key={ext}
              onClick={() => handleDownload(ext)}
              className="w-full flex flex-col px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
            >
              <span className="text-zinc-800 dark:text-zinc-200 font-medium">{label}</span>
              <span className="text-zinc-500 text-[10px]">{hint}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}
