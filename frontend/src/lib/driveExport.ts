import { listQRs, startDriveExport, uploadDriveExportFile, type DriveExportFormat, type QRCode } from "@/lib/api"
import { renderQRDownload } from "@/lib/qrDownload"

/**
 * Google Drive export (Business+, backend gdrive.service.ts). The server makes a
 * dated folder with codes.csv; each code is drawn HERE by the same renderer as a
 * download (frame, logo, fonts) and sent on. One at a time: a framed code is a
 * large render, and a whole selection in parallel can exhaust the tab's memory.
 */
export interface DriveExportProgress { done: number; total: number }
export interface DriveExportResult { folderUrl: string; sent: number; failed: string[] }

export async function exportCodesToDrive(
  qrs: QRCode[],
  format: DriveExportFormat,
  onProgress?: (p: DriveExportProgress) => void,
): Promise<DriveExportResult> {
  const byId = new Map(qrs.map((q) => [q.id, q]))
  const session = await startDriveExport([...byId.keys()], format)
  const failed: string[] = []
  let done = 0
  onProgress?.({ done, total: session.files.length })
  for (const f of session.files) {
    const qr = byId.get(f.qrId)
    try {
      if (!qr) throw new Error("missing")
      const { blob } = await renderQRDownload(qr, format)
      await uploadDriveExportFile(session.exportId, f.qrId, blob)
    } catch {
      failed.push(qr?.name ?? f.fileName)
    }
    onProgress?.({ done: ++done, total: session.files.length })
  }
  return { folderUrl: session.folderUrl, sent: session.files.length - failed.length, failed }
}

/** Every code in the personal workspace (the export takes up to 1,000). */
export async function listAllOwnCodes(max = 1000): Promise<QRCode[]> {
  const all: QRCode[] = []
  for (let page = 1; all.length < max; page++) {
    const res = await listQRs({ page, limit: 100 })
    all.push(...res.data)
    if (!res.pagination.hasNext) break
  }
  return all.slice(0, max)
}
