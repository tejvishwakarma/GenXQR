import { Router, type IRouter } from "express"
import multer from "multer"
import type { Request } from "express"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { requireAuth } from "../middleware/auth.middleware.js"
import { requirePlanFeature } from "../middleware/plan-gate.middleware.js"
import { AppError } from "../middleware/error.middleware.js"
import {
  processBulkCsv,
  streamResultsZip,
  streamCsvTemplate,
} from "../services/bulk.service.js"

const router: IRouter = Router()
const uid = (req: Request) => (req.user as unknown as AccessTokenPayload).sub

// Store uploaded CSV in memory (max 5 MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true)
    } else {
      cb(new AppError(400, "Only CSV files are accepted"))
    }
  },
})

/**
 * GET /api/bulk/template
 * Download a sample CSV template.
 */
router.get("/template", (_req, res) => {
  streamCsvTemplate(res)
})

/**
 * POST /api/bulk/csv
 * Upload a CSV and create QR codes in bulk.
 * Returns per-row results with created QR IDs.
 */
router.post(
  "/csv",
  requireAuth,
  requirePlanFeature("bulkGeneration"),
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) throw new AppError(400, "No CSV file uploaded. Use multipart field name 'file'.")
      const { results, created, failed } = await processBulkCsv(uid(req), req.file.buffer)
      res.status(created > 0 ? 201 : 422).json({
        success: created > 0,
        data: { results, summary: { total: results.length, created, failed } },
      })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * POST /api/bulk/download
 * Body: { results: BulkResult[] } — stream a ZIP of created QRs.
 * Called client-side after /csv to download the export archive.
 */
router.post(
  "/download",
  requireAuth,
  async (req, res, next) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { results } = req.body as { results: any[] }
      if (!Array.isArray(results) || results.length === 0) {
        throw new AppError(400, "No results provided")
      }
      await streamResultsZip(uid(req), results, res)
    } catch (err) {
      next(err)
    }
  },
)

export default router
