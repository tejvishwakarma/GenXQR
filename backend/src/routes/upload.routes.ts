import path from "path"
import fs from "fs"
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import multer, { type FileFilterCallback } from "multer"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { requireAuth } from "../middleware/auth.middleware.js"
import { AppError } from "../middleware/error.middleware.js"
import { prisma } from "../db/prisma.js"
import { logger } from "../logger/index.js"
import { redis } from "../redis/client.js"
import { type FileType } from "@prisma/client"
import { checkAndNotifyLimit } from "../services/limit-notification.service.js"
import { getUserPlanLimits } from "../services/billing.service.js"
import { verifyMagicBytes, type MagicByteRule } from "../utils/verifyMagicBytes.js"

const uid = (req: Request): string => (req.user as unknown as AccessTokenPayload).sub

// ─── Upload directory ─────────────────────────────────────────────────────────

export const UPLOAD_BASE = path.join(process.cwd(), "uploads")

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

// ─── Multer factories ─────────────────────────────────────────────────────────

interface UploadConfig {
  subdir: string
  maxBytes: number
  allowedMimes: string[]
  allowedExtensions: Set<string>
  fileType: FileType
  magicByteRule: MagicByteRule
}

const CONFIGS: Record<string, UploadConfig> = {
  pdf: {
    subdir: "pdf",
    maxBytes: 100 * 1024 * 1024,
    allowedMimes: ["application/pdf"],
    allowedExtensions: new Set([".pdf"]),
    fileType: "PDF",
    magicByteRule: { category: "application/pdf" },
  },
  video: {
    subdir: "video",
    maxBytes: 250 * 1024 * 1024,
    allowedMimes: ["video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-msvideo"],
    allowedExtensions: new Set([".mp4", ".webm", ".ogg", ".mov", ".avi"]),
    fileType: "VIDEO",
    // .ogg/.avi containers occasionally don't carry a signature file-type
    // recognizes as strongly — allow-through-with-warning rather than block
    // legitimate uploads.
    magicByteRule: { category: "video/", allowUndetected: true },
  },
  mp3: {
    subdir: "mp3",
    maxBytes: 25 * 1024 * 1024,
    allowedMimes: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/aac"],
    allowedExtensions: new Set([".mp3", ".wav", ".ogg", ".aac", ".m4a"]),
    fileType: "MP3",
    // Raw AAC/ADTS streams and some MP3s lack a universally reliable magic
    // number — same tradeoff as above.
    magicByteRule: { category: "audio/", allowUndetected: true },
  },
  image: {
    subdir: "image",
    maxBytes: 10 * 1024 * 1024,
    allowedMimes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    // SVG intentionally excluded — it can contain executable scripts
    allowedExtensions: new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]),
    fileType: "IMAGE",
    // Every allowed image format has a strong, universal signature — no
    // legitimate file should ever fail to be detected here.
    magicByteRule: { category: "image/" },
  },
}

function makeUploader(config: UploadConfig) {
  const destDir = path.join(UPLOAD_BASE, config.subdir)
  ensureDir(destDir)

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, destDir),
    filename: (_req, file, cb) => {
      // Extract and validate extension from the original filename
      const ext = path.extname(file.originalname).toLowerCase()
      if (!config.allowedExtensions.has(ext)) {
        cb(new AppError(415, `File extension "${ext}" is not allowed for this upload type`), "")
        return
      }
      // Sanitize the base name: keep only alphanumeric, hyphen, underscore
      const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100)
      const unique = `${Date.now()}_${base}${ext}`
      cb(null, unique)
    },
  })

  const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    // Validate MIME type from the multipart header
    if (!config.allowedMimes.includes(file.mimetype)) {
      cb(new AppError(415, `Unsupported file type: ${file.mimetype}`))
      return
    }
    // Validate file extension independently — client-supplied MIME cannot be trusted alone
    const ext = path.extname(file.originalname).toLowerCase()
    if (!config.allowedExtensions.has(ext)) {
      cb(new AppError(415, `File extension "${ext}" is not allowed for this upload type`))
      return
    }
    cb(null, true)
  }

  return multer({ storage, fileFilter, limits: { fileSize: config.maxBytes } })
}

// ─── Router ───────────────────────────────────────────────────────────────────

const router: IRouter = Router()
router.use(requireAuth)

/** Generic upload handler factory. Upload is always a single file named "file". */
function uploadHandler(type: keyof typeof CONFIGS) {
  const config = CONFIGS[type]!
  const upload = makeUploader(config)

  return [
    upload.single("file"),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.file) {
          throw new AppError(400, "No file uploaded")
        }

        const magicByteCheck = await verifyMagicBytes(req.file.path, config.magicByteRule, {
          userId: uid(req),
          type,
          fileName: req.file.originalname,
        })
        if (!magicByteCheck.ok) {
          throw new AppError(415, magicByteCheck.error)
        }

        const relativePath = `/uploads/${config.subdir}/${req.file.filename}`

        logger.info("File uploaded", {
          userId: uid(req),
          type,
          fileName: req.file.originalname,
          bytes: req.file.size,
        })

        // ─── Enforce the storage quota BEFORE accepting the file (finding #2) ──
        // Previously this ran fire-and-forget AFTER responding and only sent a
        // notification, so any authenticated user could fill the shared disk, and
        // a zero-quota (FREE) plan was skipped entirely. Now the server-observed
        // byte count is checked against the plan up front; over-quota or
        // zero-quota uploads are unlinked and refused. This is not perfectly
        // atomic against simultaneous uploads, but it turns "unbounded" into
        // "bounded by the plan plus a small concurrency margin".
        const userId = uid(req)
        const { limits, planName } = await getUserPlanLimits(userId)
        const limitBytes = limits.fileStorageGB * 1024 ** 3

        if (limitBytes <= 0) {
          fs.unlink(req.file.path, () => undefined)
          throw new AppError(403, "Your plan does not include file storage. Upgrade to upload files.")
        }

        const agg = await prisma.qRFile.aggregate({
          where: { qrCode: { userId } },
          _sum: { sizeBytes: true },
        })
        const usedBytes = Number(agg._sum.sizeBytes ?? 0)
        if (usedBytes + req.file.size > limitBytes) {
          fs.unlink(req.file.path, () => undefined)
          throw new AppError(413, "This upload would exceed your plan's storage limit.")
        }

        // Bind this file to its uploader (finding #1, provenance). QR
        // create/update accepts a client-supplied tempUrl; without a record of
        // who uploaded a path, a tenant could attach — and then delete — a path
        // aliasing another tenant's file. 24h is comfortably longer than the
        // create-a-QR flow. Redis-only; a miss just means the stricter re-attach
        // fallback (an existing QRFile the user already owns) must apply.
        void redis.setex(`upload:owner:${relativePath}`, 24 * 60 * 60, userId)
          .catch((err) => logger.warn("Upload ownership record failed", { userId, error: String(err) }))

        res.status(201).json({
          success: true,
          data: {
            tempUrl: relativePath,
            fileName: req.file.originalname,
            mimeType: req.file.mimetype,
            sizeBytes: req.file.size,
            fileType: config.fileType,
          },
        })

        // Fire the 80%/100% warning email now that the file is accepted.
        void checkAndNotifyLimit(
          userId,
          "storage",
          Math.round(((usedBytes + req.file.size) / 1024 ** 3) * 100) / 100,
          limits.fileStorageGB,
          planName,
        ).catch((err) => logger.warn("Storage limit notification failed", { userId, error: String(err) }))
      } catch (err) {
        // Clean up on error to avoid orphaned temp files
        if (req.file) {
          fs.unlink(req.file.path, () => undefined)
        }
        next(err)
      }
    },
  ] as Parameters<typeof router.post>[1][]
}

router.post("/pdf", ...uploadHandler("pdf"))
router.post("/video", ...uploadHandler("video"))
router.post("/mp3", ...uploadHandler("mp3"))
router.post("/image", ...uploadHandler("image"))

/**
 * DELETE /api/upload/:fileId
 * Delete a QRFile record and remove the file from disk.
 * Only the owner of the parent QR can delete its files.
 */
router.delete(
  "/:fileId",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const fileId = req.params["fileId"] as string
      const file = await prisma.qRFile.findUnique({ where: { id: fileId } })
      if (!file) throw new AppError(404, "File not found")

      const qr = await prisma.qRCode.findUnique({
        where: { id: file.qrId },
        select: { userId: true },
      })
      if (!qr || qr.userId !== uid(req)) throw new AppError(403, "Forbidden")

      // Delete disk file (best-effort — don't fail if already missing)
      // Resolve and verify the path stays within UPLOAD_BASE to prevent path traversal
      const diskPath = path.resolve(path.join(process.cwd(), file.fileUrl))
      if (!diskPath.startsWith(UPLOAD_BASE + path.sep) && diskPath !== UPLOAD_BASE) {
        throw new AppError(400, "Invalid file path")
      }

      // Delete the DB row first, then unlink the bytes ONLY if no other QRFile
      // still references the same path (finding #1). fileUrl is derived from a
      // client-supplied tempUrl, so a tenant can create a QRFile whose fileUrl
      // aliases another tenant's file (it legitimately lives under UPLOAD_BASE,
      // so the traversal guard above passes). Reference-counting means deleting
      // such an alias removes only the alias row — the bytes survive as long as
      // the real owner's row points at them. Full provenance binding at attach
      // time is the remaining hardening (see the security follow-up).
      await prisma.qRFile.delete({ where: { id: file.id } })

      const stillReferenced = await prisma.qRFile.count({ where: { fileUrl: file.fileUrl } })
      if (stillReferenced === 0) {
        fs.unlink(diskPath, (err) => {
          if (err && err.code !== "ENOENT") {
            logger.warn("Failed to delete uploaded file from disk", { path: diskPath, error: err.message })
          }
        })
      }

      res.json({ success: true, message: "File deleted" })
    } catch (err) {
      next(err)
    }
  },
)

export default router
