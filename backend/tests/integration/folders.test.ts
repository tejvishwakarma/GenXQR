import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { createApiKey } from "../../src/services/apikeys.service.js"
import { createQRCode, createUser, giveSubscription, seedPlans, type TestUser } from "../helpers/factories.js"

/**
 * Folders (7 Nov 2026): one level per workspace owner, a code in at most one.
 * Every guard here is about ownership: no account may file into, see, rename or
 * empty another's folder, or move another's codes.
 */
const as = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` })

async function proUser() {
  const user = await createUser()
  await giveSubscription(user.id, "PRO")
  return user
}

async function addFolder(user: TestUser, name: string) {
  const res = await request(app).post("/api/folders").set(as(user)).send({ name })
  expect(res.status, JSON.stringify(res.body)).toBe(201)
  return res.body.data as { id: string; name: string }
}

describe("folders", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should keep folder names unique per account, ignoring case", async () => {
    const user = await proUser()
    const folder = await addFolder(user, "Diwali 2026")
    await request(app).post("/api/folders").set(as(user)).send({ name: "diwali 2026" }).expect(409)
    await request(app).post("/api/folders").set(as(user)).send({ name: "  " }).expect(422)
    const other = await addFolder(user, "Clients")
    await request(app).patch(`/api/folders/${other.id}`).set(as(user)).send({ name: "DIWALI 2026" }).expect(409)
    await request(app).patch(`/api/folders/${folder.id}`).set(as(user)).send({ name: "Diwali 2026 — print" }).expect(200)
    await addFolder(await proUser(), "Diwali 2026")
  })

  it("should file codes, filter by folder, and leave codes unfiled when the folder is deleted", async () => {
    const user = await proUser()
    const folder = await addFolder(user, "Menus")
    const a = await createQRCode(user.id)
    const b = await createQRCode(user.id)
    const c = await createQRCode(user.id)

    const moved = await request(app).post("/api/folders/move").set(as(user)).send({ ids: [a.id, b.id], folderId: folder.id }).expect(200)
    expect(moved.body.data.moved.sort()).toEqual([a.id, b.id].sort())
    // Already there: nothing moves.
    expect((await request(app).post("/api/folders/move").set(as(user)).send({ ids: [a.id], folderId: folder.id }).expect(200)).body.data.moved).toEqual([])

    const inFolder = await request(app).get(`/api/qr?folderId=${folder.id}`).set(as(user)).expect(200)
    expect(inFolder.body.data.map((q: { id: string }) => q.id).sort()).toEqual([a.id, b.id].sort())
    expect(inFolder.body.data[0].folder).toEqual({ id: folder.id, name: "Menus" })
    const unfiled = await request(app).get("/api/qr?folderId=none").set(as(user)).expect(200)
    expect(unfiled.body.data.map((q: { id: string }) => q.id)).toEqual([c.id])

    const list = await request(app).get("/api/folders").set(as(user)).expect(200)
    expect(list.body.data).toEqual([expect.objectContaining({ id: folder.id, codeCount: 2 })])

    // Taking one out, then deleting the folder: codes stay, unfiled.
    await request(app).post("/api/folders/move").set(as(user)).send({ ids: [b.id], folderId: null }).expect(200)
    await request(app).delete(`/api/folders/${folder.id}`).set(as(user)).expect(200)
    const left = await prisma.qRCode.findMany({ where: { id: { in: [a.id, b.id, c.id] } }, select: { folderId: true } })
    expect(left).toHaveLength(3)
    expect(left.every((q) => q.folderId === null)).toBe(true)
  })

  it("should not let one account use, see or change another's folder, or move another's codes", async () => {
    const owner = await proUser()
    const other = await proUser()
    const folder = await addFolder(owner, "Private")
    const ownerCode = await createQRCode(owner.id)

    // Filing into someone else's folder: create, update, move, /v1.
    await request(app).post("/api/qr").set(as(other))
      .send({ name: "x", type: "URL", folderId: folder.id, content: { data: { url: "https://example.com" } } })
      .expect(422)
    const mine = await createQRCode(other.id)
    await request(app).put(`/api/qr/${mine.id}`).set(as(other)).send({ folderId: folder.id }).expect(422)
    await request(app).post("/api/folders/move").set(as(other)).send({ ids: [mine.id], folderId: folder.id }).expect(422)
    const { rawKey } = await createApiKey(other.id, "test")
    await request(app).patch(`/v1/qr/${mine.id}`).set("Authorization", `Bearer ${rawKey}`).send({ folderId: folder.id }).expect(422)

    // Moving someone else's code into one's own folder does nothing.
    const otherFolder = await addFolder(other, "Mine")
    const res = await request(app).post("/api/folders/move").set(as(other)).send({ ids: [ownerCode.id], folderId: otherFolder.id }).expect(200)
    expect(res.body.data.moved).toEqual([])
    expect((await prisma.qRCode.findUnique({ where: { id: ownerCode.id }, select: { folderId: true } }))?.folderId).toBeNull()

    // Their folder is invisible and untouchable.
    await request(app).patch(`/api/folders/${folder.id}`).set(as(other)).send({ name: "Taken" }).expect(404)
    await request(app).delete(`/api/folders/${folder.id}`).set(as(other)).expect(404)
    const list = await request(app).get("/api/folders").set(as(other)).expect(200)
    expect(list.body.data.map((f: { id: string }) => f.id)).toEqual([otherFolder.id])
    const filtered = await request(app).get(`/api/qr?folderId=${folder.id}`).set(as(other)).expect(200)
    expect(filtered.body.data).toEqual([])
    expect((await prisma.folder.findUnique({ where: { id: folder.id } }))?.name).toBe("Private")
  })

  it("should file bulk CSV rows into folders by name, creating them once", async () => {
    const user = await proUser()
    const existing = await addFolder(user, "Menus")
    const csv = [
      "name,url,folder",
      "A,https://example.com/a,menus",
      "B,https://example.com/b,Diwali 2026",
      "C,https://example.com/c,DIWALI 2026",
      "D,https://example.com/d,",
    ].join("\n")
    const res = await request(app).post("/api/bulk/csv").set(as(user)).attach("file", Buffer.from(csv), "codes.csv")
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    const codes = await prisma.qRCode.findMany({ where: { userId: user.id }, select: { name: true, folder: { select: { id: true, name: true } } } })
    const folderOf = Object.fromEntries(codes.map((c) => [c.name, c.folder]))
    expect(folderOf["A"]?.id).toBe(existing.id)
    expect(folderOf["B"]?.name).toBe("Diwali 2026")
    expect(folderOf["C"]?.id).toBe(folderOf["B"]?.id)
    expect(folderOf["D"]).toBeNull()
    expect(await prisma.folder.count({ where: { userId: user.id } })).toBe(2)
  })

  it("should list folders on /v1 and accept folderId there", async () => {
    const user = await proUser()
    const folder = await addFolder(user, "API")
    const { rawKey } = await createApiKey(user.id, "test")
    const key = { Authorization: `Bearer ${rawKey}` }
    const list = await request(app).get("/v1/folders").set(key).expect(200)
    expect(list.body.data.map((f: { id: string }) => f.id)).toEqual([folder.id])
    const created = await request(app).post("/v1/qr").set(key)
      .send({ name: "api", type: "URL", folderId: folder.id, content: { data: { url: "https://example.com" } } })
      .expect(201)
    expect(created.body.data.folderId).toBe(folder.id)
  })
})
