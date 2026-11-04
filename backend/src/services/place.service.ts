import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "../db/prisma.js"
import { AppError } from "../middleware/error.middleware.js"

/**
 * Places (decided 4 Nov 2026): the physical spots an account prints codes for —
 * "Millennium City Centre Metro", store DEL-MCC-01. A printed image cannot tell
 * its copies apart, so a place is tracked through its OWN code: one code per
 * place, many codes per place allowed (different campaigns there).
 *
 * Each scan records the code's place at scan time (QRScan.placeId, scan.worker),
 * so moving a code later does not rewrite where its earlier scans happened.
 * Belongs to the workspace owner, like codes.
 */

/** Enough for any real estate of print locations, and a bound on junk rows. */
export const MAX_PLACES = 10_000

const optionalText = (max: number) =>
  z.string().trim().max(max).nullish().transform((v) => (v ? v : null))

export const placeInputSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120),
    code: optionalText(40),
    address: optionalText(300),
    city: optionalText(100),
    lat: z.coerce.number().min(-90).max(90).nullish(),
    lng: z.coerce.number().min(-180).max(180).nullish(),
  })
  .refine((p) => (p.lat == null) === (p.lng == null), { message: "Give both latitude and longitude, or neither", path: ["lat"] })

export const placeUpdateSchema = placeInputSchema.innerType().partial()
  .refine((p) => p.lat === undefined || p.lng === undefined || (p.lat == null) === (p.lng == null), {
    message: "Give both latitude and longitude, or neither", path: ["lat"],
  })

export type PlaceInput = z.infer<typeof placeInputSchema>

const placeSelect = {
  id: true, name: true, code: true, address: true, city: true, lat: true, lng: true, createdAt: true, updatedAt: true,
} satisfies Prisma.PlaceSelect

/** What a code or scan carries about its place. */
export const placeSummarySelect = { id: true, name: true, code: true, city: true } satisfies Prisma.PlaceSelect

/** Names and codes are unique per account, ignoring case ("MCC metro" = "MCC Metro"). */
async function assertUnique(ownerId: string, p: { name?: string; code?: string | null }, exceptId?: string) {
  const not = exceptId ? { id: { not: exceptId } } : {}
  if (p.name) {
    const clash = await prisma.place.findFirst({ where: { userId: ownerId, name: { equals: p.name, mode: "insensitive" }, ...not }, select: { id: true } })
    if (clash) throw new AppError(409, `You already have a place called "${p.name}".`)
  }
  if (p.code) {
    const clash = await prisma.place.findFirst({ where: { userId: ownerId, code: { equals: p.code, mode: "insensitive" }, ...not }, select: { id: true } })
    if (clash) throw new AppError(409, `Location ID "${p.code}" is already used by another place.`)
  }
}

/** A unique-index race lost to a parallel request reads as the same 409. */
function rethrowDuplicate(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new AppError(409, "A place with that name or location ID already exists.")
  }
  throw err
}

export async function createPlace(ownerId: string, input: PlaceInput) {
  await assertUnique(ownerId, input)
  if ((await prisma.place.count({ where: { userId: ownerId } })) >= MAX_PLACES) {
    throw new AppError(403, `An account can have up to ${MAX_PLACES.toLocaleString("en-US")} places.`)
  }
  return prisma.place.create({ data: { userId: ownerId, ...input, lat: input.lat ?? null, lng: input.lng ?? null }, select: placeSelect })
    .catch(rethrowDuplicate)
}

export async function updatePlace(ownerId: string, id: string, input: z.infer<typeof placeUpdateSchema>) {
  const existing = await prisma.place.findFirst({ where: { id, userId: ownerId }, select: { id: true } })
  if (!existing) throw new AppError(404, "Place not found")
  await assertUnique(ownerId, input, id)
  return prisma.place.update({ where: { id }, data: input, select: placeSelect }).catch(rethrowDuplicate)
}

/**
 * Codes at the place keep working, without a place; its scans keep their
 * counts but no longer show under any place.
 */
export async function deletePlace(ownerId: string, id: string) {
  const existing = await prisma.place.findFirst({ where: { id, userId: ownerId }, select: { id: true, name: true } })
  if (!existing) throw new AppError(404, "Place not found")
  await prisma.place.delete({ where: { id } })
  return existing
}

/**
 * The account's places with how many codes each has and how many scans each
 * got — in the last `days` days and in all.
 */
export async function listPlaces(ownerId: string, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000)
  const places = await prisma.place.findMany({
    where: { userId: ownerId },
    select: { ...placeSelect, _count: { select: { qrCodes: true } } },
    orderBy: { name: "asc" },
  })
  if (places.length === 0) return []
  const ids = places.map((p) => p.id)
  const [all, recent] = await Promise.all([
    prisma.qRScan.groupBy({ by: ["placeId"], where: { placeId: { in: ids } }, _count: { id: true } }),
    prisma.qRScan.groupBy({ by: ["placeId"], where: { placeId: { in: ids }, scannedAt: { gte: since } }, _count: { id: true } }),
  ])
  const total = new Map(all.map((r) => [r.placeId, r._count.id]))
  const inRange = new Map(recent.map((r) => [r.placeId, r._count.id]))
  return places.map(({ _count, ...p }) => ({
    ...p,
    codeCount: _count.qrCodes,
    totalScans: total.get(p.id) ?? 0,
    scansInRange: inRange.get(p.id) ?? 0,
  }))
}

/** The place a code may be put at: the owner's own. Null clears it; undefined leaves it. */
export async function assertPlaceForCode(ownerId: string, placeId: string | null | undefined): Promise<string | null | undefined> {
  if (placeId === undefined || placeId === null) return placeId
  const row = await prisma.place.findFirst({ where: { id: placeId, userId: ownerId }, select: { id: true } })
  if (!row) throw new AppError(422, "That place is not on this account.")
  return placeId
}

/**
 * A code that had no place gets one: its scans so far get it too, since they
 * happened wherever it was printed. Moving a code from one place to another
 * leaves the old place's scans where they were.
 */
export async function attributeUnplacedScans(qrId: string, placeId: string): Promise<void> {
  await prisma.qRScan.updateMany({ where: { qrId, placeId: null }, data: { placeId } })
}

/**
 * A place for a bulk-upload row: matched by location ID, else by name (both
 * ignoring case), else created. A match is used as it is — the row's city or
 * address never edits an existing place. Cached per batch so a place repeated over many
 * rows is looked up once.
 */
export function placeResolver(ownerId: string) {
  const cache = new Map<string, string>()
  return async (ref: { name?: string; code?: string; city?: string; address?: string }): Promise<string | null> => {
    const name = ref.name?.trim().slice(0, 120) || ""
    const code = ref.code?.trim().slice(0, 40) || ""
    if (!name && !code) return null
    const key = code ? `code:${code.toLowerCase()}` : `name:${name.toLowerCase()}`
    const hit = cache.get(key)
    if (hit) return hit

    const byCode = code
      ? await prisma.place.findFirst({ where: { userId: ownerId, code: { equals: code, mode: "insensitive" } }, select: { id: true } })
      : null
    const found = byCode ?? (name
      ? await prisma.place.findFirst({ where: { userId: ownerId, name: { equals: name, mode: "insensitive" } }, select: { id: true } })
      : null)
    const id = found?.id ?? (await createPlace(ownerId, placeInputSchema.parse({
      name: name || code,
      code: code || null,
      city: ref.city,
      address: ref.address,
    }))).id
    cache.set(key, id)
    return id
  }
}
