import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { createSuperAdmin, createUser, giveSubscription, seedPlans } from "../helpers/factories.js"

/**
 * Impersonation sessions (audit, 24 Oct 2026): the token was an ordinary login
 * for the customer, so actions taken while impersonating looked like theirs
 * and the admin could mint API keys that outlived the session.
 */
async function impersonate() {
  const admin = await createSuperAdmin()
  const user = await createUser()
  await giveSubscription(user.id, "PRO")
  const res = await request(app).post(`/admin-api/users/${user.id}/impersonate`).set("Authorization", `Bearer ${admin.token}`).expect(200)
  return { admin, user, token: res.body.data.token as string }
}

describe("impersonation sessions", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should refuse actions that outlive the session or touch money and credentials", async () => {
    const { token } = await impersonate()
    const as = (r: request.Test) => r.set("Authorization", `Bearer ${token}`)
    expect((await as(request(app).post("/api/apikeys")).send({ name: "k" })).status).toBe(403)
    expect((await as(request(app).post("/api/webhooks")).send({ name: "w", url: "https://example.com/h", events: ["test"] })).status).toBe(403)
    expect((await as(request(app).post("/api/billing/create-order")).send({ planName: "BUSINESS", billingCycle: "monthly" })).status).toBe(403)
    expect((await as(request(app).post("/api/auth/change-password")).send({ currentPassword: "x", newPassword: "NewPass123!x" })).status).toBe(403)
    // Reading still works — that is how support helps.
    expect((await as(request(app).get("/api/qr"))).status).toBe(200)
  })

  it("should name the admin on audit entries written while impersonating", async () => {
    const { admin, user, token } = await impersonate()
    const created = await request(app).post("/api/qr").set("Authorization", `Bearer ${token}`)
      .send({ name: "made by support", type: "URL", content: { data: { url: "https://example.com" } } }).expect(201)
    let row = null
    for (let i = 0; i < 40 && !row; i++) {
      row = await prisma.auditLog.findFirst({ where: { userId: user.id, action: "qr.create", entityId: created.body.data.id } })
      if (!row) await new Promise((r) => setTimeout(r, 25))
    }
    expect((row?.metadata as Record<string, unknown> | null)?.impersonatedBy).toBe(admin.id)
  })

  it("should not mark the customer's own actions", async () => {
    const user = await createUser()
    await giveSubscription(user.id, "PRO")
    const created = await request(app).post("/api/qr").set("Authorization", `Bearer ${user.token}`)
      .send({ name: "mine", type: "URL", content: { data: { url: "https://example.com" } } }).expect(201)
    let row = null
    for (let i = 0; i < 40 && !row; i++) {
      row = await prisma.auditLog.findFirst({ where: { userId: user.id, action: "qr.create", entityId: created.body.data.id } })
      if (!row) await new Promise((r) => setTimeout(r, 25))
    }
    expect((row?.metadata as Record<string, unknown> | null)?.impersonatedBy).toBeUndefined()
  })
})
