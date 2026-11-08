import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "../db/prisma.js"
import { AppError } from "../middleware/error.middleware.js"
import { createQRSchema } from "./qr.service.js"
import { removeUnreferencedFiles } from "./uploads.service.js"

/**
 * Brand templates (built 8 Nov 2026): a saved QR design — colours, dot and
 * corner styles, frame, logo — applied to new codes in one click. Per workspace
 * owner, names unique ignoring case. A template holds no plan-gated power of
 * its own: a code saved with a template's frame is still checked by
 * assertFrameAllowed like any other.
 */

export const MAX_TEMPLATES = 100

/** The design fields a template keeps — the QR design schema's own rules, none required. */
const designSchema = createQRSchema.shape.design.removeDefault()
  .pick({
    primaryColor: true, secondaryColor: true, backgroundColor: true, foregroundColor: true,
    dotStyle: true, cornerSquareStyle: true, cornerDotStyle: true,
    gradientEnabled: true, gradientType: true, gradientColor1: true, gradientColor2: true,
    logoUrl: true, logoSize: true, logoMargin: true, hideBackgroundDots: true,
    frameStyle: true, frameText: true, frameFields: true, frameColor: true,
  })
  .partial()

export const templateInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  design: designSchema,
})
export const templateRenameSchema = z.object({ name: templateInputSchema.shape.name })

const select = { id: true, name: true, design: true, logoUrl: true, createdAt: true, updatedAt: true } satisfies Prisma.DesignTemplateSelect

/** The stored row as the client sees it: the logo back inside the design. */
function toClient(t: Prisma.DesignTemplateGetPayload<{ select: typeof select }>) {
  const { logoUrl, design, ...rest } = t
  return { ...rest, design: { ...(design as Record<string, unknown>), logoUrl } }
}

async function assertUnique(ownerId: string, name: string, exceptId?: string) {
  const clash = await prisma.designTemplate.findFirst({
    where: { userId: ownerId, name: { equals: name, mode: "insensitive" }, ...(exceptId && { id: { not: exceptId } }) },
    select: { id: true },
  })
  if (clash) throw new AppError(409, `You already have a template called "${name}".`)
}

function rethrowDuplicate(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new AppError(409, "A template with that name already exists.")
  }
  throw err
}

export async function listTemplates(ownerId: string) {
  const rows = await prisma.designTemplate.findMany({ where: { userId: ownerId }, select, orderBy: { name: "asc" } })
  return rows.map(toClient)
}

export async function createTemplate(ownerId: string, input: z.infer<typeof templateInputSchema>) {
  await assertUnique(ownerId, input.name)
  if ((await prisma.designTemplate.count({ where: { userId: ownerId } })) >= MAX_TEMPLATES) {
    throw new AppError(403, `An account can have up to ${MAX_TEMPLATES} templates.`)
  }
  const { logoUrl, ...design } = input.design
  const row = await prisma.designTemplate
    .create({ data: { userId: ownerId, name: input.name, design: design as Prisma.InputJsonValue, logoUrl: logoUrl ?? null }, select })
    .catch(rethrowDuplicate)
  return toClient(row)
}

export async function renameTemplate(ownerId: string, id: string, name: string) {
  const existing = await prisma.designTemplate.findFirst({ where: { id, userId: ownerId }, select: { id: true } })
  if (!existing) throw new AppError(404, "Template not found")
  await assertUnique(ownerId, name, id)
  return toClient(await prisma.designTemplate.update({ where: { id }, data: { name }, select }).catch(rethrowDuplicate))
}

/** Codes made from it keep their design; its logo file goes if nothing else uses it. */
export async function deleteTemplate(ownerId: string, id: string) {
  const existing = await prisma.designTemplate.findFirst({ where: { id, userId: ownerId }, select: { id: true, name: true, logoUrl: true } })
  if (!existing) throw new AppError(404, "Template not found")
  await prisma.designTemplate.delete({ where: { id } })
  if (existing.logoUrl) await removeUnreferencedFiles([existing.logoUrl])
  return existing
}
