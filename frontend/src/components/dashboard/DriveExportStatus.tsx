import { CheckCircle2, ExternalLink, Loader2 } from "lucide-react"
import type { useDriveExport } from "@/hooks/useDriveExport"

/** Progress, then the outcome, of a Drive export (hooks/useDriveExport.ts). */
export function DriveExportStatus({ state }: { state: ReturnType<typeof useDriveExport> }) {
  const { progress, result, error } = state
  if (progress) {
    return (
      <p className="flex items-center gap-2 text-sm text-zinc-500">
        <Loader2 size={14} className="animate-spin" />
        {progress.total ? `Saving to Google Drive… ${progress.done} of ${progress.total}` : "Preparing the export…"}
      </p>
    )
  }
  if (error) return <p className="text-sm text-red-500">{error}</p>
  if (!result) return null
  return (
    <div className="space-y-1 text-sm">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 size={14} />
        Saved {result.sent} {result.sent === 1 ? "code" : "codes"} and codes.csv to Google Drive.
        <a href={result.folderUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-violet-500 hover:underline">
          Open folder <ExternalLink size={12} />
        </a>
      </p>
      {result.failed.length > 0 && (
        <p className="text-amber-600 dark:text-amber-400">
          {result.failed.length} could not be saved: {result.failed.slice(0, 5).join(", ")}{result.failed.length > 5 ? "…" : ""}. Export them again to retry.
        </p>
      )}
    </div>
  )
}
