/**
 * Public Careers Routes — /api/careers/*
 *
 * GET  /api/careers/jobs    — list OPEN jobs for the public careers page
 * POST /api/careers/apply   — submit a job application
 *   • Multipart form-data (candidate fields + CV file)
 *   • CV saved to disk: uploads/cvs/<timestamp>_<sanitized_name>.<ext>
 *   • Application record saved to DB (cvPath, cvFilename, cvMimeType stored)
 *   • Email + CV attachment sent to recruiter
 *   • Rate-limited: 5 submissions / hour per IP
 */

import path from "path"
import fs   from "fs"
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express"
import multer from "multer"
import { z } from "zod"
import { careersApplyLimiter } from "../middleware/rateLimit.middleware.js"
import { sendEmail, buildJobApplicationEmail } from "../services/email.service.js"
import { prisma } from "../db/prisma.js"
import { verifyMagicBytes } from "../utils/verifyMagicBytes.js"

const router: IRouter = Router()

const RECRUITER_EMAIL = "support@genxqr.com"

// ── CV disk storage ────────────────────────────────────────────────────────────
// Mirror the same UPLOAD_BASE pattern used by upload.routes.ts

const UPLOAD_BASE = path.join(process.cwd(), "uploads")
const CV_DIR      = path.join(UPLOAD_BASE, "cvs")

// Ensure directory exists at startup
if (!fs.existsSync(CV_DIR)) fs.mkdirSync(CV_DIR, { recursive: true })

const CV_ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
])

const CV_ALLOWED_EXT = new Set([".pdf", ".doc", ".docx"])

const cvStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, CV_DIR),
  filename: (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase()
    const base = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 80)
    cb(null, `${Date.now()}_${base}${ext}`)
  },
})

const upload = multer({
  storage: cvStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (CV_ALLOWED_MIME.has(file.mimetype) && CV_ALLOWED_EXT.has(ext)) {
      cb(null, true)
    } else {
      cb(new Error("Only PDF, DOC, and DOCX files are accepted for the CV."))
    }
  },
})

// ── Validation ─────────────────────────────────────────────────────────────────
const ApplicationSchema = z.object({
  name:        z.string().min(2, "Name must be at least 2 characters").max(120),
  email:       z.string().email("Invalid email address"),
  phone:       z.string().max(20).optional(),
  linkedin:    z.string().url("Invalid LinkedIn URL").optional().or(z.literal("")),
  experience:  z.string().max(80).optional(),
  jobTitle:    z.string().min(2).max(200),
  coverLetter: z.string().min(50, "Cover letter must be at least 50 characters").max(5000),
})

// ── PUBLIC: GET /api/careers/jobs ─────────────────────────────────────────────
router.get(
  "/jobs",
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const jobs = await prisma.jobPosting.findMany({
        where:   { status: "OPEN" },
        orderBy: { postedAt: "desc" },
        select: {
          id:          true,
          title:       true,
          department:  true,
          location:    true,
          type:        true,
          description: true,
          postedAt:    true,
        },
      })
      res.json({ success: true, data: jobs })
    } catch (err) {
      next(err)
    }
  },
)

// ── PUBLIC: POST /api/careers/apply ───────────────────────────────────────────
router.post(
  "/apply",
  careersApplyLimiter,
  upload.single("cv"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const uploadedFile = req.file // capture before try so we can clean up on error

    try {
      if (!uploadedFile) {
        res.status(400).json({ success: false, error: "CV / resume file is required." })
        return
      }

      const parsed = ApplicationSchema.safeParse(req.body)
      if (!parsed.success) {
        // Delete the uploaded file if validation fails
        fs.unlink(uploadedFile.path, () => undefined)
        const errors = parsed.error.issues.map((i) => i.message).join(", ")
        res.status(400).json({ success: false, error: errors })
        return
      }

      const magicByteCheck = await verifyMagicBytes(
        uploadedFile.path,
        {
          allowedMimes: [
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          ],
          // Legacy .doc (OLE/CFB binary) has no format-specific magic number
          // distinguishable from other MS Office binary formats — accept an
          // undetected signature here rather than block real .doc uploads.
          allowUndetected: true,
        },
        { route: "careers.apply", fileName: uploadedFile.originalname },
      )
      if (!magicByteCheck.ok) {
        fs.unlink(uploadedFile.path, () => undefined)
        res.status(415).json({ success: false, error: magicByteCheck.error })
        return
      }

      const { name, email, phone, linkedin, experience, jobTitle, coverLetter } = parsed.data

      // Link to the job posting (best-effort — job may not exist for speculative apps)
      const matchedJob = await prisma.jobPosting.findFirst({
        where:  { title: jobTitle, status: "OPEN" },
        select: { id: true },
      })

      // Persist application with CV disk path
      await prisma.jobApplication.create({
        data: {
          jobId:      matchedJob?.id ?? null,
          jobTitle,
          name,
          email,
          phone:      phone      ?? null,
          linkedin:   linkedin   || null,
          experience: experience ?? null,
          coverLetter,
          cvFilename: uploadedFile.originalname,
          cvPath:     uploadedFile.path,     // absolute path on disk
          cvMimeType: uploadedFile.mimetype,
          status:     "NEW",
        },
      })

      // Send email with CV attachment so recruiter also gets notified instantly
      const html = buildJobApplicationEmail({
        candidateName:  name,
        candidateEmail: email,
        candidatePhone: phone,
        linkedIn:       linkedin || undefined,
        experience,
        jobTitle,
        coverLetter,
        cvFilename: uploadedFile.originalname,
      })

      // Read file into buffer for email attachment (file already on disk)
      const cvBuffer = fs.readFileSync(uploadedFile.path)

      await sendEmail({
        to:      RECRUITER_EMAIL,
        subject: `[Application] ${name} → ${jobTitle}`,
        html,
        attachments: [{
          filename:    uploadedFile.originalname,
          content:     cvBuffer,
          contentType: uploadedFile.mimetype,
        }],
      })

      res.status(200).json({
        success: true,
        message: "Application submitted! We'll review your profile and be in touch.",
      })
    } catch (err) {
      // Clean up orphaned file on unexpected error
      if (uploadedFile) fs.unlink(uploadedFile.path, () => undefined)
      next(err)
    }
  },
)

export default router
