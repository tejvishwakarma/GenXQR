import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { createAdmin, createSuperAdmin, seedPlans } from "../helpers/factories.js"

/**
 * A coupon that makes a plan free is a plan grant, and granting plans is
 * SUPER_ADMIN only (admin-users changePlan). Any ADMIN could otherwise hand
 * out free Business plans through a 100% code (security audit, 23 Oct 2026).
 */
let n = 0
const coupon = (body: Record<string, unknown>) => ({ code: `AZ${Date.now()}${++n}`, discountType: "PERCENTAGE", discountValue: 20, ...body })

describe("who may issue coupons", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should let an ADMIN create an ordinary discount", async () => {
    const admin = await createAdmin()
    await request(app).post("/admin-api/coupons").set("Authorization", `Bearer ${admin.token}`).send(coupon({})).expect(201)
  })

  it("should not let an ADMIN create a coupon that makes a plan free", async () => {
    const admin = await createAdmin()
    for (const body of [
      { discountValue: 100 },
      // ₹298.50 off ₹299 passes the "below the price" check but leaves < ₹1: free.
      { discountType: "FIXED", discountValue: 29_850, applicablePlans: ["STARTER"], applicableCycles: ["monthly"] },
      { discountValue: 100, applicablePlans: ["STARTER"] },
    ]) {
      const res = await request(app).post("/admin-api/coupons").set("Authorization", `Bearer ${admin.token}`).send(coupon(body))
      expect(res.status, JSON.stringify(body)).toBe(403)
    }
  })

  it("should not let an ADMIN turn an existing coupon into a free one", async () => {
    const admin = await createAdmin()
    const created = await request(app).post("/admin-api/coupons").set("Authorization", `Bearer ${admin.token}`).send(coupon({})).expect(201)
    const id = created.body.data.id as string
    const res = await request(app).put(`/admin-api/coupons/${id}`).set("Authorization", `Bearer ${admin.token}`)
      .send({ ...coupon({ discountValue: 100 }), code: created.body.data.code })
    expect(res.status).toBe(403)
  })

  it("should let a SUPER_ADMIN create a free coupon", async () => {
    const superAdmin = await createSuperAdmin()
    await request(app).post("/admin-api/coupons").set("Authorization", `Bearer ${superAdmin.token}`).send(coupon({ discountValue: 100 })).expect(201)
  })
})
