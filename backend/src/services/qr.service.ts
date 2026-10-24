import { randomBytes } from "crypto"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { Prisma, QRType, QRCategory, FileType, type PlanName } from "@prisma/client"
import { prisma } from "../db/prisma.js"
import { AppError } from "../middleware/error.middleware.js"
import { logger } from "../logger/index.js"
import { getOrCreateSubscription, getUserPlanLimits, PLAN_LIMITS } from "./billing.service.js"
import { safeHttpUrlSchema } from "../utils/safe-url.js"
// Invalidation lives here rather than only in the route because it is a
// correctness requirement of the mutation, not a concern of one caller: the scan
// path reads a 10-minute Redis cache, so a mutation that skips this keeps serving
// the old destination. qr.routes.ts invalidated; v1.routes.ts did not, so every
// integration's "Update Destination" silently took up to 10 minutes to apply and
// a deleted or deactivated QR kept resolving. DEL is idempotent, so the existing
// explicit calls in qr.routes.ts remain harmless.
import { invalidateQRCache } from "./scan.service.js"
import { markAttached, removeUnreferencedFiles, resolveAttachments } from "./uploads.service.js"

/** Library frames (frontend/src/lib/frames/catalog.ts) are stored as "<group>:<file>". */
const LIBRARY_FRAME_PREFIX = /^(shape|premium|occasion):/
const LIBRARY_FRAME_ID = /^(shape|premium|occasion):[a-z0-9-]{1,40}$/
/** The editable text fields a library frame can have. */
const FRAME_FIELD_IDS = ["title", "cta", "brand", "url", "date", "year", "names", "seat", "monogram", "line1", "line2", "line3"] as const

// ─── Validation Schemas ────────────────────────────────────────────────────────

export const createQRSchema = z.object({
  name: z.string().min(1, "Name is required").max(200).trim(),
  type: z.nativeEnum(QRType),
  category: z.nativeEnum(QRCategory).default("DYNAMIC"),
  tags: z.array(z.string().max(50).trim()).max(10).default([]),
  content: z.object({ data: z.record(z.string(), z.unknown()) }).default({ data: {} }),
  design: z
    .object({
      primaryColor: z.string().regex(/^#[0-9A-Fa-f]{3,8}$|^rgba?\(/).max(30).default("#7c3aed"),
      secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{3,8}$|^rgba?\(/).max(30).default("#ffffff"),
      backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{3,8}$|^rgba?\(/).max(30).default("#ffffff"),
      foregroundColor: z.string().regex(/^#[0-9A-Fa-f]{3,8}$|^rgba?\(/).max(30).default("#000000"),
      dotStyle: z.string().max(30).default("rounded"),
      cornerSquareStyle: z.string().max(30).default("square"),
      cornerDotStyle: z.string().max(30).default("square"),
      gradientEnabled: z.boolean().default(false),
      gradientType: z.string().max(20).nullish(),
      gradientColor1: z.string().regex(/^#[0-9A-Fa-f]{3,8}$|^rgba?\(/).max(30).nullish(),
      gradientColor2: z.string().regex(/^#[0-9A-Fa-f]{3,8}$|^rgba?\(/).max(30).nullish(),
      logoUrl: z
        .string()
        .max(2048)
        .refine(
          (v) => v.startsWith("/uploads/") || /^https?:\/\//.test(v),
          "Logo URL must be an uploaded file path or a valid http/https URL",
        )
        .nullish(),
      logoSize: z.coerce.number().int().min(10).max(200).default(40),
      logoMargin: z.coerce.number().int().min(0).max(50).default(5),
      hideBackgroundDots: z.boolean().default(true),
      frameStyle: z
        .string()
        .max(50)
        // Library frames are "<group>:<file>"; anything else is a classic frame id.
        .refine((v) => !LIBRARY_FRAME_PREFIX.test(v) || LIBRARY_FRAME_ID.test(v), "Unknown frame")
        .nullish(),
      frameText: z.string().max(100).nullish(),
      frameFields: z.record(z.enum(FRAME_FIELD_IDS), z.string().max(60)).nullish(),
      frameColor: z.string().regex(/^#[0-9A-Fa-f]{3,8}$|^rgba?\(/).max(30).nullish(),
    })
    .default({}),
  settings: z
    .object({
      // "" is the documented sentinel for "remove the password" (see updateQR
      // below); undefined means "leave it unchanged". Without the empty-string
      // branch here, min(4) rejected "" and that clearing path was unreachable —
      // there was no way to take a password off a QR code at all.
      password: z.union([z.literal(""), z.string().min(4).max(100)]).optional(),
      activeFrom: z.string().datetime({ offset: true }).nullish(),
      activeUntil: z.string().datetime({ offset: true }).nullish(),
      scanLimit: z.coerce.number().int().positive().nullish(),
      fallbackUrl: safeHttpUrlSchema.nullish(),  // http(s)-only (finding #3)
      // Strict format validation prevents stored XSS when these IDs are embedded
      // in the pixel-redirect trampoline page served to QR code scanners.
      fbPixelId: z.string().regex(/^\d{1,20}$/, "FB Pixel ID must be a numeric string (up to 20 digits)").nullish(),
      gaId: z.string().regex(/^(G|UA|AW|DC)-[A-Z0-9-]+$/i, "GA ID must match G-XXXX / UA-XXXX-X / AW-XXXX / DC-XXXX format").nullish(),
      gtmId: z.string().regex(/^GTM-[A-Z0-9]+$/i, "GTM container ID must match GTM-XXXX format").nullish(),
    })
    .default({}),
  uploadedFiles: z
    .array(
      z.object({
        tempUrl: z.string(),
        fileName: z.string().max(500),
        mimeType: z.string().max(100),
        sizeBytes: z.coerce.number().int().nonnegative(),
        fileType: z.nativeEnum(FileType),
      }),
    )
    .max(10)
    .default([]),
})

export const updateQRSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  type: z.nativeEnum(QRType).optional(),
  tags: z.array(z.string().max(50).trim()).max(10).optional(),
  content: z.object({ data: z.record(z.string(), z.unknown()) }).optional(),
  // Partial and WITHOUT the create defaults: an update changes only the design
  // fields it names. Reusing the create schema filled every omitted field with
  // its default, so PATCH {design:{frameStyle}} reset the colours, dot and
  // corner styles of the code (found 20 Oct 2026; the dashboard always sends
  // the whole design, so only /v1 callers hit it). ZodOptional short-circuits
  // on undefined, so the inner .default()s never run.
  design: createQRSchema.shape.design.removeDefault().partial().optional(),
  settings: createQRSchema.shape.settings.optional(),
  uploadedFiles: createQRSchema.shape.uploadedFiles.optional(),
})

export const listQRSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.nativeEnum(QRType).optional(),
  category: z.nativeEnum(QRCategory).optional(),
  search: z.string().max(100).trim().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  /**
   * ISO 8601 timestamp — filters to QR codes modified after this time.
   * Used by Zapier/Make/n8n polling triggers to fetch only newly-updated records.
   */
  updatedSince: z.string().datetime({ offset: true }).optional(),
  /** Sort order — "updatedAt" surfaces polling-friendly changes first. */
  sort: z.enum(["createdAt", "updatedAt"]).default("createdAt"),
})

// ─── Select shape ─────────────────────────────────────────────────────────────

const qrSelect = {
  id: true,
  name: true,
  type: true,
  category: true,
  slug: true,
  tags: true,
  isActive: true,
  scanCount: true,
  isPasswordProtected: true,
  activeFrom: true,
  activeUntil: true,
  scanLimit: true,
  fallbackUrl: true,
  abTestEnabled: true,
  abTestSplitPct: true,
  fbPixelId: true,
  gaId: true,
  gtmId: true,
  createdAt: true,
  updatedAt: true,
  lastScannedAt: true,
  content: { select: { data: true } },
  design: {
    select: {
      primaryColor: true,
      secondaryColor: true,
      backgroundColor: true,
      foregroundColor: true,
      dotStyle: true,
      cornerSquareStyle: true,
      cornerDotStyle: true,
      gradientEnabled: true,
      gradientType: true,
      gradientColor1: true,
      gradientColor2: true,
      logoUrl: true,
      logoSize: true,
      logoMargin: true,
      hideBackgroundDots: true,
      frameStyle: true,
      frameText: true,
      frameColor: true,
      frameFields: true,
      // Not yet settable via createQRSchema/updateQRSchema (no dashboard UI
      // for these), but they're real QRDesign columns already read by the
      // public landing-page endpoint (public.routes.ts) and copied whole by
      // duplicateQR below — omitting them here just means GET/list can't
      // see values that duplication or direct DB writes already set.
      paletteId: true,
      fontTitle: true,
      fontBody: true,
      welcomeScreenUrl: true,
    },
  },
  files: {
    select: {
      id: true,
      fileType: true,
      fileName: true,
      fileUrl: true,
      mimeType: true,
      sizeBytes: true,
      uploadedAt: true,
    },
  },
} satisfies Prisma.QRCodeSelect

// ─── Internal helpers ─────────────────────────────────────────────────────────

function generateSlug(): string {
  // 6 random bytes → 8-char base64url string (48 bits, ~281 trillion combos)
  return randomBytes(6).toString("base64url").slice(0, 8)
}

async function uniqueSlug(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = generateSlug()
    const exists = await prisma.qRCode.findUnique({ where: { slug }, select: { id: true } })
    if (!exists) return slug
  }
  throw new AppError(500, "Failed to generate unique QR slug — please retry")
}

/** Convert BigInt sizeBytes to Number for JSON serialisation */
function serializeQR<T extends { files?: Array<{ sizeBytes: bigint | number }> }>(qr: T): T {
  return {
    ...qr,
    files: (qr.files ?? []).map((f) => ({ ...f, sizeBytes: Number(f.sizeBytes) })),
  }
}

// Single source of truth for the QRDesign fields settable via the API (the
// four read-only extras — paletteId/fontTitle/fontBody/welcomeScreenUrl —
// are handled separately in duplicateQR, since they have no Zod schema or
// defaults here). Previously this same 18-field list was hand-enumerated
// four separate times across this file; any new design field only needs to
// be added here plus the Zod schema above, not four coordinated edits.
const DESIGN_FIELD_DEFAULTS = {
  primaryColor: "#7c3aed",
  secondaryColor: "#ffffff",
  backgroundColor: "#ffffff",
  foregroundColor: "#000000",
  dotStyle: "rounded",
  cornerSquareStyle: "square",
  cornerDotStyle: "square",
  gradientEnabled: false,
  gradientType: null,
  gradientColor1: null,
  gradientColor2: null,
  logoUrl: null,
  logoSize: 40,
  logoMargin: 5,
  hideBackgroundDots: true,
  frameStyle: null,
  frameText: null,
  frameColor: null,
} as const

type WritableDesignField = keyof typeof DESIGN_FIELD_DEFAULTS
type DesignInput = z.infer<typeof createQRSchema>["design"]

function buildDesignCreate(design: Partial<NonNullable<DesignInput>>): Prisma.QRDesignCreateWithoutQrCodeInput {
  const result = {} as Record<WritableDesignField, unknown>
  for (const field of Object.keys(DESIGN_FIELD_DEFAULTS) as WritableDesignField[]) {
    result[field] = design[field] ?? DESIGN_FIELD_DEFAULTS[field]
  }
  return result as Prisma.QRDesignCreateWithoutQrCodeInput
}

/** Same field list as buildDesignCreate, but only including fields the caller actually set (for a partial Prisma update). */
function buildDesignUpdate(design: Partial<NonNullable<DesignInput>>): Prisma.QRDesignUpdateWithoutQrCodeInput {
  const result: Partial<Record<WritableDesignField, unknown>> = {}
  for (const field of Object.keys(DESIGN_FIELD_DEFAULTS) as WritableDesignField[]) {
    if (design[field] !== undefined) result[field] = design[field]
  }
  return result as Prisma.QRDesignUpdateWithoutQrCodeInput
}

// ─── Expiry date validator ─────────────────────────────────────────────────────

/**
 * Validates that a requested activeUntil date is:
 *   1. Allowed by the user's plan (qrExpiry feature flag)
 *   2. Not beyond the user's current subscription period end
 *
 * Passing null/undefined is always valid (clearing the expiry).
 */
async function validateExpiryDate(userId: string, activeUntil: string | null | undefined): Promise<void> {
  if (!activeUntil) return

  const sub = await getOrCreateSubscription(userId)
  const limits = PLAN_LIMITS[sub.plan.name as PlanName] ?? PLAN_LIMITS["FREE"]

  if (!limits.qrExpiry) {
    throw new AppError(403, "QR expiry dates require a paid plan. Please upgrade to STARTER or above.")
  }

  const requested = new Date(activeUntil)
  if (requested > sub.currentPeriodEnd) {
    const cap = sub.currentPeriodEnd.toISOString().slice(0, 10)
    throw new AppError(
      400,
      `Expiry date cannot exceed your current subscription period (${cap}). Choose an earlier date or renew your plan first.`,
    )
  }
}

// ─── Frame library gate ───────────────────────────────────────────────────────

/**
 * Whether a design change puts or alters a library frame on a code.
 *
 * Adding a frame, switching to another one, or changing its text or colour
 * needs `premiumFrames`; keeping the frame a code already has does not — an
 * account whose plan lapsed can still rename the code or edit its content
 * without being forced to strip the frame it printed with.
 */
function changesLibraryFrame(
  design: Partial<NonNullable<DesignInput>> | undefined,
  existing: { frameStyle: string | null; frameColor: string | null; frameFields: Prisma.JsonValue | null } | null,
) {
  if (!design) return false
  const style = design.frameStyle !== undefined ? design.frameStyle : existing?.frameStyle ?? null
  if (!style || !LIBRARY_FRAME_PREFIX.test(style)) return false
  if (style !== (existing?.frameStyle ?? null)) return true
  if (design.frameColor !== undefined && design.frameColor !== existing?.frameColor) return true
  if (design.frameFields !== undefined && !sameFields(design.frameFields, existing?.frameFields ?? null)) return true
  return false
}

function sameFields(a: Record<string, string> | null | undefined, b: Prisma.JsonValue | null) {
  const norm = (v: unknown) =>
    JSON.stringify(
      Object.entries(v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
        .filter(([, x]) => typeof x === "string" && x !== "")
        .sort(([p], [q]) => p.localeCompare(q)),
    )
  return norm(a) === norm(b)
}

async function assertFrameAllowed(
  userId: string,
  design: Partial<NonNullable<DesignInput>> | undefined,
  existing: Parameters<typeof changesLibraryFrame>[1],
) {
  if (!changesLibraryFrame(design, existing)) return
  const { limits } = await getUserPlanLimits(userId)
  if (!limits.premiumFrames) {
    throw new AppError(403, "QR frames are included in every paid plan. Upgrade to use them.")
  }
}

/** frameFields for Prisma: a Json column takes DbNull, not null, to clear. */
function frameFieldsValue(v: Record<string, string> | null | undefined) {
  if (v === undefined) return undefined
  const kept = Object.fromEntries(Object.entries(v ?? {}).filter(([, x]) => x.trim() !== ""))
  return Object.keys(kept).length > 0 ? (kept as Prisma.InputJsonValue) : Prisma.DbNull
}

// ─── Service Functions ─────────────────────────────────────────────────────────

/**
 * Create a new QR code with optional content, design, and files.
 */
/**
 * Runs a code-creating write under the owner's QR limit, serialised per owner.
 *
 * requireQRSlot (middleware) counts and the handler creates later, so parallel
 * requests all passed the count: with 49 of 50 codes, twenty concurrent creates
 * made ~69 (security audit, 23 Oct 2026). Here the count and the insert share a
 * transaction behind a per-owner advisory lock, so only the slots that exist
 * can be taken. The middleware stays for its friendlier early message and the
 * usage emails.
 */
export async function createWithinQRLimit<T>(ownerId: string, create: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const { limits, planName } = await getUserPlanLimits(ownerId)
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`qrslot:${ownerId}`}))`
    if (limits.dynamicQRLimit !== -1) {
      if (limits.dynamicQRLimit === 0) throw new AppError(403, "trial_expired_subscribe_required")
      const count = await tx.qRCode.count({ where: { userId: ownerId } })
      if (count >= limits.dynamicQRLimit) {
        throw new AppError(403, `Your ${planName} plan allows up to ${limits.dynamicQRLimit} dynamic QR codes. Please upgrade to create more.`)
      }
    }
    return create(tx)
  })
}

export async function createQR(userId: string, input: z.infer<typeof createQRSchema>, actorId: string = userId) {
  const { design, settings, content, uploadedFiles: requestedFiles, ...qrData } = input

  // tempUrl is client-supplied: only the caller's own uploads (finding #1), and
  // with the size/type the SERVER recorded, never the request's (uploads.service).
  const uploadedFiles = requestedFiles.length > 0 ? await resolveAttachments(userId, requestedFiles, actorId) : []

  await validateExpiryDate(userId, settings.activeUntil ?? null)
  await assertFrameAllowed(userId, design, null)

  const slug = await uniqueSlug()
  const passwordHash = settings.password ? await bcrypt.hash(settings.password, 12) : undefined

  const qr = await createWithinQRLimit(userId, (tx) => tx.qRCode.create({
    data: {
      ...qrData,
      userId,
      slug,
      isPasswordProtected: !!settings.password,
      passwordHash,
      activeFrom: settings.activeFrom ? new Date(settings.activeFrom) : undefined,
      activeUntil: settings.activeUntil ? new Date(settings.activeUntil) : undefined,
      scanLimit: settings.scanLimit ?? undefined,
      fallbackUrl: settings.fallbackUrl ?? undefined,
      fbPixelId: settings.fbPixelId ?? undefined,
      gaId: settings.gaId ?? undefined,
      gtmId: settings.gtmId ?? undefined,
      content: { create: { data: content.data as Prisma.InputJsonValue } },
      design: { create: { ...buildDesignCreate(design), frameFields: frameFieldsValue(design.frameFields) } },
      files:
        uploadedFiles.length > 0
          ? {
              create: uploadedFiles.map((f) => ({
                fileType: f.fileType,
                fileName: f.fileName,
                fileUrl: f.tempUrl,
                mimeType: f.mimeType,
                sizeBytes: BigInt(f.sizeBytes),
              })),
            }
          : undefined,
    },
    select: qrSelect,
  }))

  await markAttached(uploadedFiles.map((f) => f.tempUrl))
  logger.info("QR code created", { qrId: qr.id, userId, type: qr.type, slug })
  return serializeQR(qr)
}

/**
 * List a user's QR codes with pagination and optional filters.
 */
export async function listQRs(userId: string, query: z.infer<typeof listQRSchema>) {
  const { page, limit, type, category, search, status, updatedSince, sort } = query
  const skip = (page - 1) * limit

  const where: Prisma.QRCodeWhereInput = {
    userId,
    ...(type && { type }),
    ...(category && { category }),
    ...(status === "active" && { isActive: true }),
    ...(status === "inactive" && { isActive: false }),
    ...(updatedSince && { updatedAt: { gte: new Date(updatedSince) } }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { tags: { hasSome: [search] } },
      ],
    }),
  }

  const orderBy: Prisma.QRCodeOrderByWithRelationInput =
    sort === "updatedAt" ? { updatedAt: "desc" } : { createdAt: "desc" }

  const [total, qrCodes] = await prisma.$transaction([
    prisma.qRCode.count({ where }),
    prisma.qRCode.findMany({
      where,
      select: qrSelect,
      orderBy,
      skip,
      take: limit,
    }),
  ])

  return {
    data: qrCodes.map(serializeQR),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  }
}

/**
 * Get a single QR code by ID, limited to the requesting user's own QRs.
 */
export async function getQR(id: string, userId: string) {
  const qr = await prisma.qRCode.findFirst({ where: { id, userId }, select: qrSelect })
  if (!qr) throw new AppError(404, "QR code not found")
  return serializeQR(qr)
}

/**
 * Update QR code fields selectively. All fields are optional.
 */
export async function updateQR(id: string, userId: string, input: z.infer<typeof updateQRSchema>, actorId: string = userId) {
  const existing = await prisma.qRCode.findFirst({
    where: { id, userId },
    select: { id: true, design: { select: { frameStyle: true, frameColor: true, frameFields: true } } },
  })
  if (!existing) throw new AppError(404, "QR code not found")

  const { design, settings, content, uploadedFiles: requestedFiles, ...qrData } = input

  await assertFrameAllowed(userId, design, existing.design)

  const uploadedFiles = requestedFiles && requestedFiles.length > 0
    ? await resolveAttachments(userId, requestedFiles, actorId)
    : undefined

  // Validate expiry only when the caller explicitly provides a new activeUntil value
  if (settings?.activeUntil !== undefined) {
    await validateExpiryDate(userId, settings.activeUntil ?? null)
  }

  // A provided empty string clears the password; undefined means "no change"
  const passwordHash =
    settings?.password !== undefined
      ? settings.password
        ? await bcrypt.hash(settings.password, 12)
        : null
      : undefined

  const qr = await prisma.qRCode.update({
    where: { id },
    data: {
      ...(qrData.name !== undefined && { name: qrData.name }),
      ...(qrData.type !== undefined && { type: qrData.type }),
      ...(qrData.tags !== undefined && { tags: qrData.tags }),
      ...(settings?.password !== undefined && {
        isPasswordProtected: !!settings.password,
        passwordHash,
      }),
      ...(settings?.activeFrom !== undefined && {
        activeFrom: settings.activeFrom ? new Date(settings.activeFrom) : null,
      }),
      ...(settings?.activeUntil !== undefined && {
        activeUntil: settings.activeUntil ? new Date(settings.activeUntil) : null,
      }),
      ...(settings?.scanLimit !== undefined && { scanLimit: settings.scanLimit }),
      ...(settings?.fallbackUrl !== undefined && { fallbackUrl: settings.fallbackUrl }),
      ...(settings?.fbPixelId !== undefined && { fbPixelId: settings.fbPixelId }),
      ...(settings?.gaId !== undefined && { gaId: settings.gaId }),
      ...(settings?.gtmId !== undefined && { gtmId: settings.gtmId }),
      ...(content !== undefined && {
        content: {
          upsert: {
            create: { data: content.data as Prisma.InputJsonValue },
            update: { data: content.data as Prisma.InputJsonValue },
          },
        },
      }),
      ...(design !== undefined && {
        design: {
          upsert: {
            create: { ...buildDesignCreate(design), frameFields: frameFieldsValue(design.frameFields) },
            update: { ...buildDesignUpdate(design), frameFields: frameFieldsValue(design.frameFields) },
          },
        },
      }),
      ...(uploadedFiles && uploadedFiles.length > 0 && {
        files: {
          create: uploadedFiles.map((f) => ({
            fileType: f.fileType,
            fileName: f.fileName,
            fileUrl: f.tempUrl,
            mimeType: f.mimeType,
            sizeBytes: BigInt(f.sizeBytes),
          })),
        },
      }),
    },
    select: qrSelect,
  })

  if (uploadedFiles) await markAttached(uploadedFiles.map((f) => f.tempUrl))
  await invalidateQRCache(qr.slug)
  logger.info("QR code updated", { qrId: id, userId })
  return serializeQR(qr)
}

/**
 * Permanently delete a QR code and all associated data (cascade in DB).
 */
export async function deleteQR(id: string, userId: string) {
  // slug is selected so the cache entry can be dropped after the row is gone —
  // without it a deleted QR keeps redirecting until the cache expires.
  const existing = await prisma.qRCode.findFirst({
    where: { id, userId },
    select: { id: true, slug: true, files: { select: { fileUrl: true, thumbnailUrl: true } } },
  })
  if (!existing) throw new AppError(404, "QR code not found")
  await prisma.qRCode.delete({ where: { id } })
  await invalidateQRCache(existing.slug)
  // The rows cascade; the bytes did not, so a deleted code's files stayed on
  // disk forever. Kept if another code still uses the same file.
  await removeUnreferencedFiles(existing.files.flatMap((f) => [f.fileUrl, ...(f.thumbnailUrl ? [f.thumbnailUrl] : [])]))
    .catch((err) => logger.warn("Deleting a code's files failed", { qrId: id, error: String(err) }))
  logger.info("QR code deleted", { qrId: id, userId })
}

/**
 * Toggle isActive between true and false.
 */
export async function toggleQR(id: string, userId: string) {
  const qr = await prisma.qRCode.findFirst({
    where: { id, userId },
    select: { id: true, isActive: true, slug: true, pausedForBilling: true, disabledByAdminAt: true },
  })
  if (!qr) throw new AppError(404, "QR code not found")
  // Paused because the plan lapsed: only payment switches it back on
  // (subscription-expiry.service.ts). Otherwise the pause is one click away
  // from meaningless, for the dashboard and the /v1 API alike.
  // Taken down by an admin: only an admin can switch it back on.
  if (qr.disabledByAdminAt) {
    throw new AppError(403, "This QR code was disabled by GenXQR. Contact support if you think this is a mistake.")
  }
  if (qr.pausedForBilling) {
    throw new AppError(403, "This QR code was paused because your plan ended. Renew your plan to switch it back on.")
  }
  const updated = await prisma.qRCode.update({
    where: { id },
    data: { isActive: !qr.isActive },
    select: { id: true, isActive: true, slug: true },
  })
  await invalidateQRCache(updated.slug)
  logger.info("QR code toggled", { qrId: id, userId, isActive: updated.isActive })
  return updated
}

/**
 * Clone a QR code (new slug, same content + design, inactive by default).
 */
export async function duplicateQR(id: string, userId: string) {
  const qr = await prisma.qRCode.findFirst({
    where: { id, userId },
    include: { content: true, design: true },
  })
  if (!qr) throw new AppError(404, "QR code not found")

  const slug = await uniqueSlug()

  const newQR = await createWithinQRLimit(userId, (tx) => tx.qRCode.create({
    data: {
      userId,
      type: qr.type,
      category: qr.category,
      name: `${qr.name} (Copy)`,
      slug,
      tags: qr.tags,
      isActive: false,
      scanCount: 0,
      isPasswordProtected: qr.isPasswordProtected,
      passwordHash: qr.passwordHash,
      activeFrom: qr.activeFrom,
      activeUntil: qr.activeUntil,
      scanLimit: qr.scanLimit,
      fallbackUrl: qr.fallbackUrl,
      content: qr.content
        ? { create: { data: qr.content.data as Prisma.InputJsonValue } }
        : undefined,
      design: qr.design
        ? {
            create: {
              ...(Object.fromEntries(
                (Object.keys(DESIGN_FIELD_DEFAULTS) as WritableDesignField[]).map((field) => [
                  field,
                  qr.design![field],
                ]),
              ) as Prisma.QRDesignCreateWithoutQrCodeInput),
              frameFields: qr.design.frameFields ?? Prisma.DbNull,
              paletteId: qr.design.paletteId,
              fontTitle: qr.design.fontTitle,
              fontBody: qr.design.fontBody,
              welcomeScreenUrl: qr.design.welcomeScreenUrl,
            },
          }
        : undefined,
    },
    select: qrSelect,
  }))

  logger.info("QR code duplicated", { originalId: id, newId: newQR.id, userId })
  return serializeQR(newQR)
}
