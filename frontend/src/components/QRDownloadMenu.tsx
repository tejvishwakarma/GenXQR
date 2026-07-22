import { useState, useRef, useCallback, useEffect } from "react"
import { createPortal } from "react-dom"
import { Loader2, Download } from "lucide-react"
import QRCodeStyling from "qr-code-styling"
import { getQrBaseUrl, type QRCode } from "@/lib/api"

type DownloadExt = "png" | "svg" | "jpeg" | "webp"

/**
 * Per-QR download button + format menu (PNG / SVG / JPEG / WebP).
 * Renders the styled QR client-side via qr-code-styling and triggers a download.
 * Shared by the dashboard and the dedicated My QR Codes page.
 */
export function DownloadMenu({ qr }: { qr: QRCode }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)

  const handleDownload = useCallback(async (ext: DownloadExt) => {
    setLoading(true)
    setOpen(false)
    try {
      const redirectUrl = `${getQrBaseUrl()}/r/${qr.slug}`
      const d = qr.design
      const filename = qr.name.replace(/[^a-z0-9_-]/gi, "_")

      const sharedOpts = {
        data: redirectUrl,
        dotsOptions: { color: d?.primaryColor ?? "#7c3aed", type: (d?.dotStyle ?? "rounded") as import("qr-code-styling").DotType },
        cornersSquareOptions: { color: d?.primaryColor ?? "#7c3aed", type: (d?.cornerSquareStyle ?? "square") as import("qr-code-styling").CornerSquareType },
        cornersDotOptions: { color: d?.primaryColor ?? "#7c3aed" },
        backgroundOptions: { color: d?.backgroundColor ?? "#ffffff" },
        ...(d?.logoUrl ? {
          image: d.logoUrl,
          imageOptions: { hideBackgroundDots: true, imageSize: 0.35, margin: 8, crossOrigin: "anonymous" },
        } : {}),
        qrOptions: { errorCorrectionLevel: "H" as const },
      }

      if (ext === "svg") {
        const instance = new QRCodeStyling({ ...sharedOpts, width: 512, height: 512, type: "svg", margin: 20 })
        const blob = await instance.getRawData("svg")
        if (blob) {
          const raw = blob instanceof Blob ? await blob.text() : (blob as Buffer).toString("utf-8")
          const cleaned = raw.replace(/^(<svg)([^>]*)(>)/, (_match: string, openTag: string, attrs: string, close: string) => {
            const wm = attrs.match(/width="(\d+(?:\.\d+)?)"/)
            const hm = attrs.match(/height="(\d+(?:\.\d+)?)"/)
            const w = wm?.[1] ?? "512"
            const h = hm?.[1] ?? "512"
            const strippedAttrs = attrs
              .replace(/\s+width="[^"]*"/, "")
              .replace(/\s+height="[^"]*"/, "")
            const hasViewBox = /viewBox/i.test(strippedAttrs)
            const viewBoxAttr = hasViewBox ? "" : ` viewBox="0 0 ${w} ${h}"`
            return `${openTag}${strippedAttrs}${viewBoxAttr}${close}`
          })
          const svgBlob = new Blob([cleaned], { type: "image/svg+xml;charset=utf-8" })
          const url = URL.createObjectURL(svgBlob)
          const a = document.createElement("a")
          a.href = url
          a.download = `${filename}.svg`
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          setTimeout(() => URL.revokeObjectURL(url), 1000)
        }
      } else {
        const instance = new QRCodeStyling({ ...sharedOpts, width: 1024, height: 1024, type: "canvas", margin: 40 })
        await instance.download({ name: filename, extension: ext })
      }
    } finally {
      setLoading(false)
    }
  }, [qr])

  const openMenu = useCallback(() => {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    setMenuPos({
      top: rect.bottom + window.scrollY + 4,
      right: window.innerWidth - rect.right - window.scrollX,
    })
    setOpen(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    document.addEventListener("mousedown", close)
    document.addEventListener("scroll", close, true)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("scroll", close, true)
    }
  }, [open])

  const formats: { ext: DownloadExt; label: string; hint: string }[] = [
    { ext: "png",  label: "PNG",  hint: "Best for web & print" },
    { ext: "svg",  label: "SVG",  hint: "Vector, infinitely scalable" },
    { ext: "jpeg", label: "JPEG", hint: "Smaller file size" },
    { ext: "webp", label: "WebP", hint: "Modern web format" },
  ]

  return (
    <>
      <button
        ref={btnRef}
        onClick={openMenu}
        disabled={loading}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-violet-400 hover:bg-violet-500/10 transition-colors disabled:opacity-40"
        title="Download QR"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
      </button>
      {open && createPortal(
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{ position: "absolute", top: menuPos.top, right: menuPos.right }}
          className="z-[9999] bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl shadow-2xl w-48 py-1 text-sm"
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
