import { google } from "googleapis"
import { prisma } from "../db/prisma.js"
import { AppError } from "../middleware/error.middleware.js"
import { logger } from "../logger/index.js"
import { scanUrlFor } from "./custom-domain.service.js"
import { env } from "../config/env.js"
import { redis } from "../redis/client.js"
import { csvCell } from "../utils/csv-cell.util.js"
import { randomBytes } from "node:crypto"

function getOAuth2Client() {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new AppError(503, "Google Drive integration is not configured on this server")
  }
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_DRIVE_REDIRECT_URI,
  )
}

/** Build the authorization URL users must visit to grant Drive access. */
export function getDriveAuthUrl(): string {
  const oauth2 = getOAuth2Client()
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/drive.file"],
  })
}

/** Exchange the OAuth callback code for access/refresh tokens and persist them. */
export async function connectDrive(userId: string, code: string): Promise<void> {
  const oauth2 = getOAuth2Client()
  const { tokens } = await oauth2.getToken(code)

  if (!tokens.access_token) {
    throw new AppError(400, "Google returned no access token")
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      driveConnected: true,
      driveAccessToken: tokens.access_token,
      driveRefreshToken: tokens.refresh_token ?? undefined,
      driveTokenExpiresAt: tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : null,
    },
  })
  logger.info("Google Drive connected", { userId })
}

/** Revoke Drive access and clear stored tokens. */
export async function disconnectDrive(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { driveAccessToken: true },
  })
  if (user?.driveAccessToken) {
    try {
      const oauth2 = getOAuth2Client()
      await oauth2.revokeToken(user.driveAccessToken)
    } catch {
      // Token revocation failures are non-fatal
    }
  }
  await prisma.user.update({
    where: { id: userId },
    data: {
      driveConnected: false,
      driveAccessToken: null,
      driveRefreshToken: null,
      driveTokenExpiresAt: null,
      driveFolderId: null,
    },
  })
}

/** Get a Drive client initialised with the user's stored tokens. */
async function getDriveClient(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      driveConnected: true,
      driveAccessToken: true,
      driveRefreshToken: true,
      driveTokenExpiresAt: true,
    },
  })
  if (!user?.driveConnected || !user.driveAccessToken) {
    throw new AppError(400, "Google Drive is not connected. Please connect via Settings.")
  }

  const oauth2 = getOAuth2Client()
  oauth2.setCredentials({
    access_token: user.driveAccessToken,
    refresh_token: user.driveRefreshToken,
    expiry_date: user.driveTokenExpiresAt?.getTime(),
  })

  // Persist refreshed tokens if they changed
  // An event handler: nothing awaits it, so a failed write must be caught here —
  // an unhandled rejection exits the process (index.ts).
  oauth2.on("tokens", (tokens) => {
    if (!tokens.access_token) return
    prisma.user
      .update({
        where: { id: userId },
        data: {
          driveAccessToken: tokens.access_token,
          driveRefreshToken: tokens.refresh_token ?? undefined,
          driveTokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        },
      })
      .catch((err: unknown) => logger.warn("Could not save refreshed Drive tokens", { userId, error: String(err) }))
  })

  return google.drive({ version: "v3", auth: oauth2 })
}

/** Ensure a GenXQR folder exists in the user's Drive, creating it if needed. */
async function ensureGenXQRFolder(userId: string, drive: ReturnType<typeof google.drive>): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { driveFolderId: true },
  })

  if (user?.driveFolderId) {
    // Verify it still exists
    try {
      await drive.files.get({ fileId: user.driveFolderId, fields: "id" })
      return user.driveFolderId
    } catch {
      // Folder was deleted — recreate
    }
  }

  const folder = await drive.files.create({
    requestBody: {
      name: "GenXQR Exports",
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  })
  const folderId = folder.data.id!
  await prisma.user.update({ where: { id: userId }, data: { driveFolderId: folderId } })
  return folderId
}

// ─── Export: QR images + codes.csv (Business and above, 9 Nov 2026) ─────────
//
// The images are drawn in the BROWSER (lib/qrDownload.ts — frames, logos and
// fonts only exist there), so an export is a session: start() makes a dated
// folder with codes.csv and names one file per chosen code; the browser then
// sends each image, which goes straight into that folder. The server decides
// every file name and accepts each code once — the browser only picks formats.

export const DRIVE_EXPORT_MAX_CODES = 1000
export type DriveExportFormat = "png" | "svg" | "pdf"
const EXPORT_TTL = 2 * 60 * 60 // s
const metaKey = (id: string) => `gdrive:export:${id}`
const filesKey = (id: string) => `gdrive:export:${id}:files`
const MIME: Record<DriveExportFormat, string> = { png: "image/png", svg: "image/svg+xml", pdf: "application/pdf" }

/** Whether the bytes are what the format says: a PNG, a PDF, or SVG markup. */
export function looksLike(format: DriveExportFormat, buf: Buffer): boolean {
  if (format === "png") return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  if (format === "pdf") return buf.subarray(0, 5).toString("latin1") === "%PDF-"
  const head = buf.subarray(0, 512).toString("utf8").replace(/^\uFEFF/, "").trimStart()
  return head.startsWith("<svg") || head.startsWith("<?xml")
}

const safeName = (name: string) => name.replace(/[^\p{L}\p{N} _().-]+/gu, "_").replace(/\s+/g, " ").trim().slice(0, 80) || "QR"

function exportFolderName(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now)
  const v = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
  return `GenXQR export ${v("year")}-${v("month")}-${v("day")} ${v("hour")}.${v("minute")}`
}

/** What a code points at, for the CSV: its link, or the kind of page it opens. */
function destinationOf(type: string, data: unknown): string {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>
  for (const k of ["url", "reviewUrl", "appStoreUrl", "playStoreUrl"]) {
    if (typeof d[k] === "string" && d[k]) return d[k] as string
  }
  return `${type.toLowerCase().replace(/_/g, " ")} page`
}

/**
 * Starts an export of `qrIds` (the caller's own codes) in `format`: creates
 * "GenXQR Exports/GenXQR export <date>" with codes.csv, and returns the files
 * the browser should send. Throws 404 if any id is not the caller's.
 */
export async function startDriveExport(userId: string, qrIds: string[], format: DriveExportFormat) {
  const ids = [...new Set(qrIds)]
  const qrs = await prisma.qRCode.findMany({
    where: { id: { in: ids }, userId },
    select: {
      id: true, name: true, slug: true, type: true, isActive: true, scanCount: true, createdAt: true,
      content: { select: { data: true } },
      customDomain: { select: { hostname: true, status: true } },
      folder: { select: { name: true } },
      place: { select: { name: true, code: true } },
    },
    orderBy: { createdAt: "asc" },
  })
  if (qrs.length !== ids.length) throw new AppError(404, "Some of these QR codes were not found in your account.")

  const drive = await getDriveClient(userId)
  const parentId = await ensureGenXQRFolder(userId, drive)
  const folder = await drive.files.create({
    requestBody: { name: exportFolderName(), mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id,webViewLink",
  })
  const folderId = folder.data.id!

  // Name + slug: unique within the export, and still readable.
  const files = qrs.map((q) => ({ qrId: q.id, fileName: `${safeName(q.name)} - ${q.slug}.${format}` }))
  const fileOf = new Map(files.map((f) => [f.qrId, f.fileName]))

  const header = ["name", "type", "status", "scan_url", "destination", "scans", "folder", "place", "location_id", "created", "image_file"]
  const rows = qrs.map((q) => [
    q.name, q.type, q.isActive ? "active" : "inactive", scanUrlFor(q), destinationOf(q.type, q.content?.data),
    q.scanCount, q.folder?.name ?? "", q.place?.name ?? "", q.place?.code ?? "", q.createdAt.toISOString().slice(0, 10), fileOf.get(q.id),
  ])
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n"
  const { Readable } = await import("stream")
  await drive.files.create({
    requestBody: { name: "codes.csv", parents: [folderId], mimeType: "text/csv" },
    media: { mimeType: "text/csv", body: Readable.from(["\uFEFF" + csv]) }, // BOM: Excel reads it as UTF-8
    fields: "id",
  })

  const exportId = randomBytes(16).toString("hex")
  await redis
    .multi()
    .set(metaKey(exportId), JSON.stringify({ userId, folderId, format }), "EX", EXPORT_TTL)
    .hset(filesKey(exportId), Object.fromEntries(files.map((f) => [f.qrId, f.fileName])))
    .expire(filesKey(exportId), EXPORT_TTL)
    .exec()

  logger.info("Drive export started", { userId, count: qrs.length, format })
  return { exportId, folderUrl: folder.data.webViewLink ?? `https://drive.google.com/drive/folders/${folderId}`, files }
}

/** Puts one code's image into its export folder. Each code once; only the export's owner. */
export async function uploadDriveExportFile(userId: string, exportId: string, qrId: string, file: Buffer) {
  const raw = await redis.get(metaKey(exportId))
  const meta = raw ? (JSON.parse(raw) as { userId: string; folderId: string; format: DriveExportFormat }) : null
  if (!meta || meta.userId !== userId) throw new AppError(404, "This export has ended. Start it again.")
  if (!looksLike(meta.format, file)) throw new AppError(422, `That file is not a ${meta.format.toUpperCase()}.`)

  const fileName = await redis.hget(filesKey(exportId), qrId)
  // HDEL is the claim: of two requests for the same code only one gets 1.
  if (!fileName || (await redis.hdel(filesKey(exportId), qrId)) !== 1) {
    throw new AppError(409, "This code is not part of the export, or was already sent.")
  }

  const drive = await getDriveClient(userId)
  const { Readable } = await import("stream")
  try {
    await drive.files.create({
      requestBody: { name: fileName, parents: [meta.folderId], mimeType: MIME[meta.format] },
      media: { mimeType: MIME[meta.format], body: Readable.from([file]) },
      fields: "id",
    })
  } catch (err) {
    await redis.hset(filesKey(exportId), qrId, fileName).catch(() => undefined) // can be retried
    throw err
  }
}

/** Get current Drive connection status for a user. */
export async function getDriveStatus(userId: string): Promise<{
  connected: boolean
  folderId: string | null
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { driveConnected: true, driveFolderId: true },
  })
  return {
    connected: user?.driveConnected ?? false,
    folderId: user?.driveFolderId ?? null,
  }
}
