import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { createAdmin, createQRCode, createSuperAdmin, createUser, giveSubscription, seedPlans } from "../helpers/factories.js"

/** Admin-panel findings from the 23 Oct 2026 audit. */
describe("admin moderation hardening", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should not let an ADMIN blocklist a super admin's account", async () => {
    const admin = await createAdmin()
    const superAdmin = await createSuperAdmin()
    for (const body of [{ type: "user", value: superAdmin.id }, { type: "email", value: superAdmin.email.toUpperCase() }]) {
      const res = await request(app).post("/admin-api/abuse/blocklist").set("Authorization", `Bearer ${admin.token}`).send({ ...body, reason: "x" })
      expect(res.status, JSON.stringify(body)).toBe(403)
    }
  })

  it("should record who blocklisted an account", async () => {
    const admin = await createAdmin()
    const user = await createUser()
    await request(app).post("/admin-api/abuse/blocklist").set("Authorization", `Bearer ${admin.token}`).send({ type: "user", value: user.id, reason: "spam" }).expect(201)
    await new Promise((r) => setTimeout(r, 100)) // logAudit is fire-and-forget
    expect(await prisma.auditLog.count({ where: { userId: admin.id, action: "admin.blocklist.add" } })).toBe(1)
  })

  it("should pause an account's codes when an admin moves it to FREE, and resume them on a paid plan", async () => {
    const superAdmin = await createSuperAdmin()
    const user = await createUser()
    await giveSubscription(user.id, "PRO")
    const qr = await createQRCode(user.id)

    await request(app).patch(`/admin-api/users/${user.id}/plan`).set("Authorization", `Bearer ${superAdmin.token}`).send({ planName: "FREE" }).expect(200)
    expect(await prisma.qRCode.findUniqueOrThrow({ where: { id: qr.id }, select: { isActive: true, pausedForBilling: true } })).toEqual({ isActive: false, pausedForBilling: true })

    await request(app).patch(`/admin-api/users/${user.id}/plan`).set("Authorization", `Bearer ${superAdmin.token}`).send({ planName: "PRO" }).expect(200)
    expect((await prisma.qRCode.findUniqueOrThrow({ where: { id: qr.id } })).isActive).toBe(true)
  })
})
