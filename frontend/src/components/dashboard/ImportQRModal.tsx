import { useEffect, useRef, useState } from "react"
import { Upload, X, ScanLine, AlertCircle, Loader2 } from "lucide-react"
import { decodeImageData, parseQRData, type ParsedQR } from "@/lib/qrDecode"

interface ImportQRModalProps {
  onClose: () => void
  onImported: (parsed: ParsedQR) => void
}

/**
 * Decodes a photo of an existing (usually third-party/static) QR code and
 * hands the parsed content back to the caller. This does NOT alter the
 * physical code that was scanned — it only pre-fills a brand-new dynamic
 * QR code with the same content, which the user then prints and swaps in.
 */
export function ImportQRModal({ onClose, onImported }: ImportQRModalProps) {
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  function processFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Please upload a valid image file (PNG, JPG, WEBP).")
      return
    }
    setError(null)
    setBusy(true)

    const reader = new FileReader()
    reader.onload = (e) => {
      const src = e.target?.result as string
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement("canvas")
        // Cap at 1024px — jsQR accuracy peaks here; larger just wastes CPU
        const MAX = 1024
        const scale = Math.min(1, MAX / Math.max(img.width, img.height))
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)

        const ctx = canvas.getContext("2d", { willReadFrequently: true })
        if (!ctx) { setBusy(false); setError("Could not read the image.") ; return }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

        const decoded = decodeImageData(imageData)
        setBusy(false)
        if (decoded) {
          onImported(parseQRData(decoded))
        } else {
          setError("No QR code found in this image. Try a clearer or higher-resolution photo.")
        }
      }
      img.onerror = () => { setBusy(false); setError("Could not load the image. The file may be corrupt.") }
      img.src = src
    }
    reader.onerror = () => { setBusy(false); setError("Could not read the file.") }
    reader.readAsDataURL(file)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ""
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/15 border border-violet-500/30 flex items-center justify-center">
              <ScanLine size={15} className="text-violet-400" />
            </div>
            <div>
              <h2 className="text-zinc-900 dark:text-white font-semibold text-sm">Import from an existing QR code</h2>
              <p className="text-zinc-500 text-xs">Upload a photo — we'll pre-fill the content for you</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="p-6">
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl flex flex-col items-center justify-center py-10 px-6 text-center cursor-pointer transition-colors ${
              dragOver
                ? "border-violet-500 bg-violet-500/10"
                : "border-zinc-200 dark:border-zinc-800 hover:border-violet-500/50 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
            }`}
          >
            {busy ? (
              <Loader2 size={28} className="text-violet-400 animate-spin mb-3" />
            ) : (
              <Upload size={28} className="text-zinc-400 mb-3" />
            )}
            <p className="text-zinc-700 dark:text-zinc-300 font-medium text-sm mb-1">
              {busy ? "Decoding…" : "Click to upload"}
            </p>
            <p className="text-zinc-500 text-xs">or drag and drop a photo of your printed QR code</p>
            <p className="text-zinc-600 text-xs mt-3">Supports PNG, JPG, WEBP</p>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-900/40 bg-red-500/5 p-3">
              <AlertCircle size={15} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-red-400 text-xs">{error}</p>
            </div>
          )}

          <p className="mt-4 text-zinc-500 text-xs leading-relaxed">
            This creates a brand-new dynamic QR code with the same content — it won't change the QR code you already have printed. Print the new one and swap it in.
          </p>
        </div>
      </div>
    </div>
  )
}
