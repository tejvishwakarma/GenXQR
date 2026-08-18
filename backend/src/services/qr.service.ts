import { randomBytes } from "crypto"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { type Prisma, QRType, QRCategory, FileType, type PlanName } from "@prisma/client"
import { prisma } from "../db/prisma.js"
import { AppError } from "../middleware/error.middleware.js"
import { logger } from "../logger/index.js"
import { getOrCreateSubscription, PLAN_LIMITS } from "./billing.service.js"

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
      backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{3,8}$|^rgba?\(/).max(30).default("#000000"),
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
      frameStyle: z.string().max(50).nullish(),
      frameText: z.string().max(100).nullish(),
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
      fallbackUrl: z.string().url().nullish(),
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
  design: createQRSchema.shape.design.optional(),
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
  backgroundColor: "#000000",
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

function buildDesignCreate(design: DesignInput): Prisma.QRDesignCreateWithoutQrCodeInput {
  const result = {} as Record<WritableDesignField, unknown>
  for (const field of Object.keys(DESIGN_FIELD_DEFAULTS) as WritableDesignField[]) {
    result[field] = design[field] ?? DESIGN_FIELD_DEFAULTS[field]
  }
  return result as Prisma.QRDesignCreateWithoutQrCodeInput
}

/** Same field list as buildDesignCreate, but only including fields the caller actually set (for a partial Prisma update). */
function buildDesignUpdate(design: DesignInput): Prisma.QRDesignUpdateWithoutQrCodeInput {
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

// ─── Service Functions ─────────────────────────────────────────────────────────

/**
 * Create a new QR code with optional content, design, and files.
 */
export async function createQR(userId: string, input: z.infer<typeof createQRSchema>) {
  const { design, settings, content, uploadedFiles, ...qrData } = input

  await validateExpiryDate(userId, settings.activeUntil ?? null)

  const slug = await uniqueSlug()
  const passwordHash = settings.password ? await bcrypt.hash(settings.password, 12) : undefined

  const qr = await prisma.qRCode.create({
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
      design: { create: buildDesignCreate(design) },
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
  })

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
export async function updateQR(id: string, userId: string, input: z.infer<typeof updateQRSchema>) {
  const existing = await prisma.qRCode.findFirst({ where: { id, userId }, select: { id: true } })
  if (!existing) throw new AppError(404, "QR code not found")

  const { design, settings, content, uploadedFiles, ...qrData } = input

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
            create: buildDesignCreate(design),
            update: buildDesignUpdate(design),
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

  logger.info("QR code updated", { qrId: id, userId })
  return serializeQR(qr)
}

/**
 * Permanently delete a QR code and all associated data (cascade in DB).
 */
export async function deleteQR(id: string, userId: string) {
  const existing = await prisma.qRCode.findFirst({ where: { id, userId }, select: { id: true } })
  if (!existing) throw new AppError(404, "QR code not found")
  await prisma.qRCode.delete({ where: { id } })
  logger.info("QR code deleted", { qrId: id, userId })
}

/**
 * Toggle isActive between true and false.
 */
export async function toggleQR(id: string, userId: string) {
  const qr = await prisma.qRCode.findFirst({
    where: { id, userId },
    select: { id: true, isActive: true, slug: true },
  })
  if (!qr) throw new AppError(404, "QR code not found")
  const updated = await prisma.qRCode.update({
    where: { id },
    data: { isActive: !qr.isActive },
    select: { id: true, isActive: true, slug: true },
  })
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

  const newQR = await prisma.qRCode.create({
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
              paletteId: qr.design.paletteId,
              fontTitle: qr.design.fontTitle,
              fontBody: qr.design.fontBody,
              welcomeScreenUrl: qr.design.welcomeScreenUrl,
            },
          }
        : undefined,
    },
    select: qrSelect,
  })

  logger.info("QR code duplicated", { originalId: id, newId: newQR.id, userId })
  return serializeQR(newQR)
}
