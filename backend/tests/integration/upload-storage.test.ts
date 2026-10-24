import fs from "node:fs"
import path from "node:path"
import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { sweepPendingUploads } from "../../src/services/uploads.service.js"
import { createUser, giveSubscription, seedPlans, type TestUser } from "../helpers/factories.js"

/**
 * Storage abuse (security audit, 22 Oct 2026). The quota summed QRFile.sizeBytes
 * — a number the client sent when attaching — and ignored uploads that were
 * never attached; nothing ever deleted those bytes. Any trial account could
 * fill the disk Postgres and Redis share.
 */

const PNG_1PX = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001" +
    "0d0a2db40000000049454e44ae426082",
  "hex",
)

const onDisk = (url: string) => fs.existsSync(path.join(process.cwd(), url))

async function proUser(): Promise<TestUser> {
  const user = await createUser()
  await giveSubscription(user.id, "PRO")
  return user
}

async function upload(user: TestUser) {
  const res = await request(app).post("/api/upload/image").set("Authorization", `Bearer ${user.token}`).attach("file", PNG_1PX, "x.png")
  expect(res.status, JSON.stringify(res.body)).toBe(201)
  return res.body.data as { tempUrl: string; fileName: string; mimeType: string; sizeBytes: number; fileType: string }
}

function createWithFile(user: TestUser, file: Record<string, unknown>) {
  return request(app).post("/api/qr").set("Authorization", `Bearer ${user.token}`).send({
    name: "with file", type: "IMAGE_GALLERY", content: { data: {} }, uploadedFiles: [file],
  })
}

describe("upload storage", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should record the size the server measured, not the one the client sends", async () => {
    const user = await proUser()
    const up = await upload(user)
    const res = await createWithFile(user, { ...up, sizeBytes: 0, mimeType: "text/html" })
    expect(res.status, JSON.stringify(res.body)).toBe(201)

    const file = await prisma.qRFile.findFirstOrThrow({ where: { fileUrl: up.tempUrl } })
    expect(Number(file.sizeBytes)).toBe(PNG_1PX.length)
    expect(file.mimeType).toBe("image/png")
    expect(await prisma.pendingUpload.count({ where: { path: up.tempUrl } })).toBe(0)
  })

  it("should count uploads that were never attached against the quota", async () => {
    const user = await proUser() // PRO: 5 GB
    await upload(user)
    // Another upload of this owner, still pending, filling the plan.
    await prisma.pendingUpload.create({
      data: {
        path: `/uploads/image/filler-${Date.now()}.png`, ownerId: user.id, uploaderId: user.id,
        sizeBytes: BigInt(5 * 1024 ** 3), mimeType: "image/png", fileType: "IMAGE",
      },
    })
    const res = await request(app).post("/api/upload/image").set("Authorization", `Bearer ${user.token}`).attach("file", PNG_1PX, "x.png")
    expect(res.status).toBe(413)
  })

  it("should delete uploads still unattached after a day, and keep attached ones", async () => {
    const user = await proUser()
    const stale = await upload(user)
    const attached = await upload(user)
    expect((await createWithFile(user, attached)).status).toBe(201)

    await prisma.pendingUpload.updateMany({
      where: { path: { in: [stale.tempUrl, attached.tempUrl] } },
      data: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    })
    await sweepPendingUploads()

    expect(onDisk(stale.tempUrl)).toBe(false)
    expect(await prisma.pendingUpload.count({ where: { path: stale.tempUrl } })).toBe(0)
    expect(onDisk(attached.tempUrl)).toBe(true)
  })

  it("should keep a stale upload that is used as a design logo, in content, or as a brand logo", async () => {
    const user = await proUser()
    const designLogo = await upload(user)
    const vcardPhoto = await upload(user)
    const brandLogo = await upload(user)

    const res = await request(app).post("/api/qr").set("Authorization", `Bearer ${user.token}`).send({
      name: "vcard", type: "VCARD",
      content: { data: { firstName: "A", profileImage: vcardPhoto.tempUrl } },
      design: { logoUrl: designLogo.tempUrl },
    })
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    await prisma.user.update({ where: { id: user.id }, data: { brandLogoUrl: brandLogo.tempUrl } })

    const all = [designLogo.tempUrl, vcardPhoto.tempUrl, brandLogo.tempUrl]
    await prisma.pendingUpload.updateMany({
      where: { path: { in: all } },
      data: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    })
    await sweepPendingUploads()

    for (const url of all) expect(onDisk(url), url).toBe(true)
    expect(await prisma.pendingUpload.count({ where: { path: { in: all } } })).toBe(0)
  })

  it("should delete a code's files from disk when the code is deleted", async () => {
    const user = await proUser()
    const up = await upload(user)
    const qr = await createWithFile(user, up)
    expect(onDisk(up.tempUrl)).toBe(true)

    await request(app).delete(`/api/qr/${qr.body.data.id}`).set("Authorization", `Bearer ${user.token}`).expect(200)
    expect(onDisk(up.tempUrl)).toBe(false)
  })

  it("should delete the old avatar file when it is replaced", async () => {
    const user = await createUser()
    const first = await request(app).patch("/api/auth/me/avatar").set("Authorization", `Bearer ${user.token}`).attach("avatar", PNG_1PX, "a.png")
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    const oldUrl = first.body.data.avatarUrl as string
    expect(onDisk(oldUrl)).toBe(true)

    await new Promise((r) => setTimeout(r, 5)) // distinct timestamped filename
    const second = await request(app).patch("/api/auth/me/avatar").set("Authorization", `Bearer ${user.token}`).attach("avatar", PNG_1PX, "b.png")
    expect(second.status).toBe(200)
    expect(onDisk(oldUrl)).toBe(false)
    expect(onDisk(second.body.data.avatarUrl)).toBe(true)
  })

  it("should refuse to attach someone else's upload", async () => {
    const owner = await proUser()
    const other = await proUser()
    const up = await upload(owner)
    expect((await createWithFile(other, up)).status).toBe(403)
  })
})
