import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "../db/prisma.js"
import { AppError } from "../middleware/error.middleware.js"

/**
 * Folders (built 7 Nov 2026): a way to file codes — "Diwali 2026", "Client: Blue
 * Cafe". One level, no nesting; a code is in at most one folder. Organisation
 * only: a folder changes nothing about how a code scans. Belongs to the
 * workspace owner, like codes and places.
 */

/** A bound on junk rows; far beyond any real filing system. */
export const MAX_FOLDERS = 1_000

export const folderInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
})

export const moveToFolderSchema = z.object({
  ids: z.array(z.string().min(1).max(40)).min(1, "Choose at least one code.").max(500),
  /** null takes the codes out of their folder. */
  folderId: z.string().min(1).max(40).nullable(),
})

const folderSelect = { id: true, name: true, createdAt: true, updatedAt: true } satisfies Prisma.FolderSelect

/** What a code carries about its folder. */
export const folderSummarySelect = { id: true, name: true } satisfies Prisma.FolderSelect

/** Names are unique per account, ignoring case. */
async function assertUnique(ownerId: string, name: string, exceptId?: string) {
  const clash = await prisma.folder.findFirst({
    where: { userId: ownerId, name: { equals: name, mode: "insensitive" }, ...(exceptId && { id: { not: exceptId } }) },
    select: { id: true },
  })
  if (clash) throw new AppError(409, `You already have a folder called "${name}".`)
}

function rethrowDuplicate(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new AppError(409, "A folder with that name already exists.")
  }
  throw err
}

export async function createFolder(ownerId: string, input: z.infer<typeof folderInputSchema>) {
  await assertUnique(ownerId, input.name)
  if ((await prisma.folder.count({ where: { userId: ownerId } })) >= MAX_FOLDERS) {
    throw new AppError(403, `An account can have up to ${MAX_FOLDERS.toLocaleString("en-US")} folders.`)
  }
  return prisma.folder.create({ data: { userId: ownerId, name: input.name }, select: folderSelect }).catch(rethrowDuplicate)
}

export async function renameFolder(ownerId: string, id: string, input: z.infer<typeof folderInputSchema>) {
  const existing = await prisma.folder.findFirst({ where: { id, userId: ownerId }, select: { id: true } })
  if (!existing) throw new AppError(404, "Folder not found")
  await assertUnique(ownerId, input.name, id)
  return prisma.folder.update({ where: { id }, data: { name: input.name }, select: folderSelect }).catch(rethrowDuplicate)
}

/** The folder goes; its codes stay, unfiled. Returns the ids of those codes (they changed). */
export async function deleteFolder(ownerId: string, id: string) {
  const existing = await prisma.folder.findFirst({ where: { id, userId: ownerId }, select: { id: true, name: true } })
  if (!existing) throw new AppError(404, "Folder not found")
  const codes = await prisma.qRCode.findMany({ where: { folderId: id }, select: { id: true } })
  await prisma.folder.delete({ where: { id } })
  return { ...existing, codeIds: codes.map((c) => c.id) }
}

/** The account's folders, A–Z, with how many codes each holds. */
export async function listFolders(ownerId: string) {
  const folders = await prisma.folder.findMany({
    where: { userId: ownerId },
    select: { ...folderSelect, _count: { select: { qrCodes: true } } },
    orderBy: { name: "asc" },
  })
  return folders.map(({ _count, ...f }) => ({ ...f, codeCount: _count.qrCodes }))
}

/** The folder a code may be filed in: the owner's own. Null clears it; undefined leaves it. */
export async function assertFolderForCode(ownerId: string, folderId: string | null | undefined): Promise<string | null | undefined> {
  if (folderId === undefined || folderId === null) return folderId
  const row = await prisma.folder.findFirst({ where: { id: folderId, userId: ownerId }, select: { id: true } })
  if (!row) throw new AppError(422, "That folder is not on this account.")
  return folderId
}

/**
 * Files the owner's codes in a folder (or takes them out, folderId null).
 * Ids that aren't the owner's, or are already there, are skipped. Returns the
 * ids that moved.
 */
export async function moveCodesToFolder(ownerId: string, input: z.infer<typeof moveToFolderSchema>) {
  const folderId = await assertFolderForCode(ownerId, input.folderId)
  const codes = await prisma.qRCode.findMany({ where: { id: { in: input.ids }, userId: ownerId }, select: { id: true, folderId: true } })
  const ids = codes.filter((c) => c.folderId !== (folderId ?? null)).map((c) => c.id)
  if (ids.length) await prisma.qRCode.updateMany({ where: { id: { in: ids } }, data: { folderId: folderId ?? null } })
  return ids
}
