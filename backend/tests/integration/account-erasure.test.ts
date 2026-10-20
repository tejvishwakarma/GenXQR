import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { createAdmin, createQRCode, createUser, seedPlans } from "../helpers/factories.js"

/**
 * Deleting an account deletes its data.
 *
 * qr_codes.userId is ON DELETE SET NULL, so deleting only the users row used to
 * leave every QR code, its content and every scan (raw IPs included) behind,
 * ownerless and still redirecting — while the GDPR page promised erasure.
 */

async function seedOwnedData(userId: string) {
  const qr = await createQRCode(userId)
  await prisma.qRScan.create({ data: { qrId: qr.id, ip: "203.0.113.7", userAgent: "test" } })
  return qr
}

describe("account erasure", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should delete the user's QR codes and scans when they delete their own account", async () => {
    const user = await createUser()
    const other = await createUser()
    const qr = await seedOwnedData(user.id)
    const othersQr = await seedOwnedData(other.id)

    const res = await request(app)
      .delete("/api/auth/me")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ password: user.password })
    expect(res.status).toBe(200)

    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull()
    expect(await prisma.qRCode.findUnique({ where: { id: qr.id } })).toBeNull()
    expect(await prisma.qRScan.count({ where: { qrId: qr.id } })).toBe(0)
    // Someone else's data is untouched.
    expect(await prisma.qRCode.findUnique({ where: { id: othersQr.id } })).not.toBeNull()
    expect(await prisma.qRScan.count({ where: { qrId: othersQr.id } })).toBe(1)
  })

  it("should stop the deleted account's codes from redirecting", async () => {
    const user = await createUser()
    const qr = await seedOwnedData(user.id)

    await request(app).delete("/api/auth/me").set("Authorization", `Bearer ${user.token}`).send({ password: user.password })
    const scan = await request(app).get(`/r/${qr.slug}`)

    expect(scan.status).toBe(302)
    expect(scan.headers["location"]).toContain("/expired")
  })

  it("should record the deletion in the audit log", async () => {
    const user = await createUser()
    await request(app).delete("/api/auth/me").set("Authorization", `Bearer ${user.token}`).send({ password: user.password })

    // Fire-and-forget write; give it a moment.
    await new Promise((r) => setTimeout(r, 200))
    const entry = await prisma.auditLog.findFirst({ where: { action: "auth.account.delete", entityId: user.id } })
    expect(entry).not.toBeNull()
  })

  it("should also erase data when an admin deletes the account", async () => {
    const admin = await createAdmin()
    const user = await createUser()
    const qr = await seedOwnedData(user.id)

    const res = await request(app).delete(`/admin-api/users/${user.id}`).set("Authorization", `Bearer ${admin.token}`)
    expect(res.status).toBe(200)

    expect(await prisma.qRCode.findUnique({ where: { id: qr.id } })).toBeNull()
  })
})
