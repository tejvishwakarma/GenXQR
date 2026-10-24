import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { createQRCode, createUser, giveSubscription, seedPlans } from "../helpers/factories.js"

/** Deleting a file is owner/admin only, like deleting a code (decided 24 Oct 2026). */
async function setup(role: "ADMIN" | "EDITOR") {
  const owner = await createUser()
  await giveSubscription(owner.id, "PRO")
  const member = await createUser()
  const team = await prisma.team.create({ data: { ownerId: owner.id, name: "Acme" } })
  await prisma.teamMember.create({ data: { teamId: team.id, userId: member.id, role } })
  const qr = await createQRCode(owner.id)
  const file = await prisma.qRFile.create({
    data: { qrId: qr.id, fileType: "PDF", fileName: "menu.pdf", fileUrl: `/uploads/pdf/none-${Date.now()}.pdf`, mimeType: "application/pdf", sizeBytes: BigInt(10) },
  })
  const del = () => request(app).delete(`/api/upload/${file.id}`).set("Authorization", `Bearer ${member.token}`).set("X-Workspace-Id", owner.id)
  return { del, file }
}

describe("who can delete attached files", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should refuse an EDITOR", async () => {
    const { del, file } = await setup("EDITOR")
    expect((await del()).status).toBe(403)
    expect(await prisma.qRFile.count({ where: { id: file.id } })).toBe(1)
  })

  it("should allow a team ADMIN", async () => {
    const { del, file } = await setup("ADMIN")
    expect((await del()).status).toBe(200)
    expect(await prisma.qRFile.count({ where: { id: file.id } })).toBe(0)
  })
})
