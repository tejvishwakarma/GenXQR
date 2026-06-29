import { google } from "googleapis"
import { prisma } from "../db/prisma.js"
import { AppError } from "../middleware/error.middleware.js"
import { logger } from "../logger/index.js"
import { env } from "../config/env.js"

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
  oauth2.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          driveAccessToken: tokens.access_token,
          driveRefreshToken: tokens.refresh_token ?? undefined,
          driveTokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        },
      })
    }
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

/**
 * Export QR code metadata for a specific QR (or all QRs) to Google Drive.
 * Creates a JSON file in the GenXQR Exports folder.
 */
export async function exportQRsToDrive(
  userId: string,
  qrIds?: string[],
): Promise<{ fileId: string; fileName: string; webViewLink: string }[]> {
  const drive = await getDriveClient(userId)
  const folderId = await ensureGenXQRFolder(userId, drive)

  const where = qrIds?.length
    ? { id: { in: qrIds }, userId }
    : { userId }

  const qrs = await prisma.qRCode.findMany({
    where,
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      isActive: true,
      scanCount: true,
      createdAt: true,
      content: { select: { data: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  })

  if (qrs.length === 0) throw new AppError(400, "No QR codes found to export")

  const FRONTEND_URL = env.FRONTEND_URL ?? "https://genxqr.com"
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const fileName = `GenXQR_export_${timestamp}.json`

  const exportData = qrs.map((q) => ({
    id: q.id,
    name: q.name,
    slug: q.slug,
    type: q.type,
    isActive: q.isActive,
    scanCount: q.scanCount,
    scanUrl: `${FRONTEND_URL}/r/${q.slug}`,
    content: q.content?.data,
    createdAt: q.createdAt.toISOString(),
  }))

  const { Readable } = await import("stream")
  const stream = Readable.from(JSON.stringify(exportData, null, 2))

  const created = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
      mimeType: "application/json",
    },
    media: { mimeType: "application/json", body: stream },
    fields: "id,name,webViewLink",
  })

  logger.info("Exported QRs to Google Drive", { userId, count: qrs.length, fileId: created.data.id })

  return [{
    fileId: created.data.id!,
    fileName: created.data.name!,
    webViewLink: created.data.webViewLink!,
  }]
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
