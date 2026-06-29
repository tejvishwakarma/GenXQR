import path from "path"
import fs from "fs"
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import multer, { type FileFilterCallback } from "multer"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { requireAuth } from "../middleware/auth.middleware.js"
import { AppError } from "../middleware/error.middleware.js"
import { prisma } from "../db/prisma.js"
import { logger } from "../logger/index.js"
import { type FileType } from "@prisma/client"
import { checkAndNotifyLimit } from "../services/limit-notification.service.js"
import { getUserPlanLimits } from "../services/billing.service.js"

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
}

const CONFIGS: Record<string, UploadConfig> = {
  pdf: {
    subdir: "pdf",
    maxBytes: 100 * 1024 * 1024,
    allowedMimes: ["application/pdf"],
    allowedExtensions: new Set([".pdf"]),
    fileType: "PDF",
  },
  video: {
    subdir: "video",
    maxBytes: 250 * 1024 * 1024,
    allowedMimes: ["video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-msvideo"],
    allowedExtensions: new Set([".mp4", ".webm", ".ogg", ".mov", ".avi"]),
    fileType: "VIDEO",
  },
  mp3: {
    subdir: "mp3",
    maxBytes: 25 * 1024 * 1024,
    allowedMimes: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/aac"],
    allowedExtensions: new Set([".mp3", ".wav", ".ogg", ".aac", ".m4a"]),
    fileType: "MP3",
  },
  image: {
    subdir: "image",
    maxBytes: 10 * 1024 * 1024,
    allowedMimes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    // SVG intentionally excluded — it can contain executable scripts
    allowedExtensions: new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]),
    fileType: "IMAGE",
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

        const relativePath = `/uploads/${config.subdir}/${req.file.filename}`

        logger.info("File uploaded", {
          userId: uid(req),
          type,
          fileName: req.file.originalname,
          bytes: req.file.size,
        })

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

        // Check storage limit after responding (fire-and-forget)
        const userId = uid(req)
        void (async () => {
          try {
            const { limits, planName } = await getUserPlanLimits(userId)
            if (limits.fileStorageGB > 0) {
              const agg = await prisma.qRFile.aggregate({
                where: { qrCode: { userId } },
                _sum: { sizeBytes: true },
              })
              const usedGB = Number(agg._sum.sizeBytes ?? 0) / (1024 ** 3)
              await checkAndNotifyLimit(userId, "storage", Math.round(usedGB * 100) / 100, limits.fileStorageGB, planName)
            }
          } catch (err) {
            logger.warn("Storage limit check failed", { userId, error: String(err) })
          }
        })()
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
      fs.unlink(diskPath, (err) => {
        if (err && err.code !== "ENOENT") {
          logger.warn("Failed to delete uploaded file from disk", { path: diskPath, error: err.message })
        }
      })

      await prisma.qRFile.delete({ where: { id: file.id } })

      res.json({ success: true, message: "File deleted" })
    } catch (err) {
      next(err)
    }
  },
)

export default router
