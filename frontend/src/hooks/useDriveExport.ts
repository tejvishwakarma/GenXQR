import { useCallback, useState } from "react"
import type { DriveExportFormat, QRCode } from "@/lib/api"
import { exportCodesToDrive, type DriveExportProgress, type DriveExportResult } from "@/lib/driveExport"

/** Runs a Drive export (lib/driveExport.ts) and keeps its progress, result and error for the UI. */
export function useDriveExport() {
  const [progress, setProgress] = useState<DriveExportProgress | null>(null)
  const [result, setResult] = useState<DriveExportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async (qrs: QRCode[] | (() => Promise<QRCode[]>), format: DriveExportFormat) => {
    setResult(null)
    setError(null)
    setProgress({ done: 0, total: 0 })
    try {
      const list = typeof qrs === "function" ? await qrs() : qrs
      if (list.length === 0) throw new Error("There are no QR codes to export.")
      setResult(await exportCodesToDrive(list, format, setProgress))
    } catch (err) {
      setError(err instanceof Error ? err.message : "The export failed. Please try again.")
    } finally {
      setProgress(null)
    }
  }, [])

  return { run, running: progress !== null, progress, result, error, clear: () => { setResult(null); setError(null) } }
}
