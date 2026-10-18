/**
 * Deleting an account deletes the account's data.
 *
 * Before this, deleting a user removed only the users row. qr_codes.userId is
 * ON DELETE SET NULL, so every QR code — with its content, uploaded files and
 * every scan (raw IPs included) — stayed in the database, ownerless, and kept
 * redirecting. The GDPR page promises a right to erasure; this makes it true.
 *
 * Used by both self-service deletion (auth.service deleteAccount) and admin
 * deletion (admin-users.service deleteUser).
 *
 * Not erased here: invoices, which cascade with the user row as they always
 * have; and the email blocklist entry admin deletion writes, which exists to
 * stop the same person re-registering.
 */
import fs from "node:fs/promises"
import path from "node:path"
import { prisma } from "../db/prisma.js"
import { logger } from "../logger/index.js"
import { invalidateQRCache } from "./scan.service.js"

// Same root as upload.routes.ts (uploads land under the backend's cwd).
const UPLOAD_BASE = path.join(process.cwd(), "uploads")

/** Resolves an /uploads/... URL to a disk path, or null if it escapes UPLOAD_BASE. */
function toDiskPath(fileUrl: string): string | null {
  if (!fileUrl.startsWith("/uploads/")) return null
  const resolved = path.resolve(path.join(process.cwd(), fileUrl))
  return resolved.startsWith(UPLOAD_BASE + path.sep) ? resolved : null
}

/**
 * Removes the user's QR codes (content, design, files, scans, daily rollups,
 * routing rules, A/B variants and abuse reports cascade from each code) and the
 * user row, in one transaction; then drops the codes from the scan cache and
 * deletes their uploaded files and avatar from disk.
 */
export async function deleteUserAndData(userId: string): Promise<void> {
  const [user, codes, files] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } }),
    prisma.qRCode.findMany({ where: { userId }, select: { slug: true } }),
    prisma.qRFile.findMany({
      where: { qrCode: { userId } },
      select: { fileUrl: true, thumbnailUrl: true },
    }),
  ])

  await prisma.$transaction([
    prisma.qRCode.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ])

  // Without this a deleted code keeps redirecting from cache for up to 10 min.
  await Promise.all(codes.map((c) => invalidateQRCache(c.slug)))

  // Disk cleanup is best-effort: the data rows are already gone. A file still
  // referenced by another QRFile row is kept — fileUrl can alias another
  // tenant's upload (see the DELETE /api/upload/:fileId route), and deleting
  // the bytes would break their code.
  const urls = new Set<string>()
  for (const f of files) {
    urls.add(f.fileUrl)
    if (f.thumbnailUrl) urls.add(f.thumbnailUrl)
  }
  for (const url of urls) {
    const disk = toDiskPath(url)
    if (!disk) continue
    const stillReferenced = await prisma.qRFile.count({
      where: { OR: [{ fileUrl: url }, { thumbnailUrl: url }] },
    })
    if (stillReferenced > 0) continue
    await fs.unlink(disk).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== "ENOENT") logger.warn("Failed to delete uploaded file", { path: disk, error: err.message })
    })
  }

  if (user?.avatarUrl) {
    const disk = toDiskPath(user.avatarUrl)
    if (disk) {
      await fs.unlink(disk).catch((err: NodeJS.ErrnoException) => {
        if (err.code !== "ENOENT") logger.warn("Failed to delete avatar", { path: disk, error: err.message })
      })
    }
  }

  logger.info("Account and its data deleted", { userId, qrCodes: codes.length, files: urls.size })
}
