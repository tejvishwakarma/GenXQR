/**
 * Uploaded files: what counts against storage, what may be attached, and
 * clean-up (security audit, 22 Oct 2026).
 *
 * Before this, the storage quota summed QRFile.sizeBytes — a number the CLIENT
 * sent when attaching — and never counted files uploaded but not attached. So a
 * 250 MB video attached as `sizeBytes: 0`, or simply never attached, cost
 * nothing, and nothing ever deleted it: any trial account could fill the disk
 * that Postgres and Redis share.
 *
 * Now every upload is recorded (PendingUpload) with the size the server
 * measured. The quota counts attached + pending bytes; attaching takes size and
 * type from the record (or the owner's existing QRFile), never the request;
 * and a sweep deletes uploads still unattached after a day.
 */
import fs from "node:fs/promises"
import path from "node:path"
import type { FileType } from "@prisma/client"
import { prisma } from "../db/prisma.js"
import { redis } from "../redis/client.js"
import { AppError } from "../middleware/error.middleware.js"
import { logger } from "../logger/index.js"

/** Same root as upload.routes.ts: uploads land under the backend's cwd. */
const UPLOAD_BASE = path.join(process.cwd(), "uploads")

/** How long an upload may wait to be attached before the sweep deletes it. */
export const PENDING_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000

/** Resolves an /uploads/... URL to a disk path, or null if it escapes UPLOAD_BASE. */
export function toDiskPath(fileUrl: string): string | null {
  if (!fileUrl.startsWith("/uploads/")) return null
  const resolved = path.resolve(path.join(process.cwd(), fileUrl))
  return resolved.startsWith(UPLOAD_BASE + path.sep) ? resolved : null
}

/**
 * Whether anything still points at this uploaded file. Uploads are used in more
 * places than QRFile attachments — a QR design's centre logo, images inside a
 * code's content (e.g. a vCard photo), an account's avatar and white-label logo
 * — so ALL of them are checked before any file is deleted.
 */
export async function isFileReferenced(url: string): Promise<boolean> {
  const [files, pending, designs, users, contents] = await Promise.all([
    prisma.qRFile.count({ where: { OR: [{ fileUrl: url }, { thumbnailUrl: url }] } }),
    prisma.pendingUpload.count({ where: { path: url } }),
    prisma.qRDesign.count({ where: { logoUrl: url } }),
    prisma.user.count({ where: { OR: [{ avatarUrl: url }, { brandLogoUrl: url }] } }),
    // Content is free-form JSON; an exact substring match (strpos, not LIKE, so
    // "_" in a filename is not a wildcard) finds the path wherever it sits.
    prisma.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*)::bigint AS n FROM qr_content WHERE strpos(data::text, ${url}) > 0`,
  ])
  return files + pending + designs + users + Number(contents[0]?.n ?? 0) > 0
}

/** Deletes these files from disk unless something still uses them (isFileReferenced). */
export async function removeUnreferencedFiles(urls: Iterable<string>): Promise<void> {
  for (const url of new Set(urls)) {
    const disk = toDiskPath(url)
    if (!disk) continue
    if (await isFileReferenced(url)) continue
    await fs.unlink(disk).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== "ENOENT") logger.warn("Failed to delete uploaded file", { path: disk, error: err.message })
    })
  }
}

/** Bytes counting against this owner's storage: attached files plus uploads waiting to be attached. */
export async function storageUsedBytes(ownerId: string): Promise<number> {
  const [attached, pending] = await Promise.all([
    prisma.qRFile.aggregate({ where: { qrCode: { userId: ownerId } }, _sum: { sizeBytes: true } }),
    prisma.pendingUpload.aggregate({ where: { ownerId }, _sum: { sizeBytes: true } }),
  ])
  return Number(attached._sum.sizeBytes ?? 0) + Number(pending._sum.sizeBytes ?? 0)
}

export async function recordPendingUpload(p: {
  path: string
  ownerId: string
  uploaderId: string
  sizeBytes: number
  mimeType: string
  fileType: FileType
}): Promise<void> {
  await prisma.pendingUpload.create({ data: { ...p, sizeBytes: BigInt(p.sizeBytes) } })
}

export interface AttachInput {
  tempUrl: string
  fileName: string
  fileType: FileType
  mimeType: string
  sizeBytes: number
}

/**
 * Checks the caller may attach these uploads and returns them with TRUSTED
 * size/type: from the upload record, or from a file the owner already has
 * attached elsewhere. Throws 403 for anything else.
 *
 * `actorId`: in a team workspace a member uploads into a code owned by the
 * workspace owner, so an upload by either is accepted.
 */
export async function resolveAttachments(ownerId: string, files: AttachInput[], actorId: string = ownerId): Promise<AttachInput[]> {
  const out: AttachInput[] = []
  for (const f of files) {
    const pending = await prisma.pendingUpload.findUnique({ where: { path: f.tempUrl } })
    if (pending && (pending.uploaderId === ownerId || pending.uploaderId === actorId)) {
      out.push({ ...f, sizeBytes: Number(pending.sizeBytes), mimeType: pending.mimeType, fileType: pending.fileType })
      continue
    }

    const owned = await prisma.qRFile.findFirst({
      where: { fileUrl: f.tempUrl, qrCode: { userId: ownerId } },
      select: { sizeBytes: true, mimeType: true, fileType: true },
    })
    if (owned) {
      out.push({ ...f, sizeBytes: Number(owned.sizeBytes), mimeType: owned.mimeType, fileType: owned.fileType })
      continue
    }

    // Uploaded before upload records existed (deploy window): the Redis
    // provenance record, with the size read from disk rather than the request.
    const legacyOwner = await redis.get(`upload:owner:${f.tempUrl}`).catch(() => null)
    const disk = toDiskPath(f.tempUrl)
    if ((legacyOwner === ownerId || legacyOwner === actorId) && disk) {
      const stat = await fs.stat(disk).catch(() => null)
      if (stat?.isFile()) {
        out.push({ ...f, sizeBytes: stat.size })
        continue
      }
    }

    throw new AppError(403, "One or more uploaded files could not be attached to your account.")
  }
  return out
}

/** Attached now: no longer pending (the QRFile row carries the bytes from here). */
export async function markAttached(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  await prisma.pendingUpload.deleteMany({ where: { path: { in: paths } } })
}

/**
 * Clears upload records older than PENDING_UPLOAD_TTL_MS (run from the expiry
 * worker) and deletes the file — unless it ended up used somewhere other than a
 * QRFile attachment (a design logo, content, avatar, branding), in which case
 * only the record goes and the file stays.
 */
export async function sweepPendingUploads(now = new Date()): Promise<number> {
  const stale = await prisma.pendingUpload.findMany({
    where: { createdAt: { lt: new Date(now.getTime() - PENDING_UPLOAD_TTL_MS) } },
    select: { path: true },
    take: 500,
  })
  if (stale.length === 0) return 0
  const paths = stale.map((s) => s.path)
  await prisma.pendingUpload.deleteMany({ where: { path: { in: paths } } })
  await removeUnreferencedFiles(paths)
  logger.info("Swept unattached uploads", { count: paths.length })
  return paths.length
}
