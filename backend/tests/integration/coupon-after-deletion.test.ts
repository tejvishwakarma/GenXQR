import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { deleteUserAndData } from "../../src/services/account-erasure.service.js"
import { createUser, seedPlans } from "../helpers/factories.js"

/**
 * "Once per customer" coupons used to reset when the account was deleted —
 * its redemptions were deleted with it (audit, 24 Oct 2026).
 */
describe("coupon limits across account deletion", () => {
  beforeAll(async () => {
    await seedPlans()
  })
  afterEach(() => vi.unstubAllGlobals())

  it("should still count a use made by a deleted account on the same inbox", async () => {
    const coupon = await prisma.coupon.create({
      data: { code: `ONCE${Date.now()}`, discountType: "PERCENTAGE", discountValue: 100, maxRedemptionsPerUser: 1 },
    })
    const email = `coupon.again.${Date.now()}@gmail.com`
    const first = await createUser({ email })
    vi.stubGlobal("fetch", async () => { throw new Error("a free grant must not call Cashfree") })
    await request(app).post("/api/billing/create-order").set("Authorization", `Bearer ${first.token}`)
      .send({ planName: "PRO", billingCycle: "monthly", couponCode: coupon.code }).expect(200)

    await deleteUserAndData(first.id)
    expect(await prisma.couponRedemption.count({ where: { couponId: coupon.id } })).toBe(1) // kept

    // Same inbox, written differently.
    const second = await createUser({ email: email.replace("coupon.again", "c.o.upon.again").replace("@", "+2@") })
    const res = await request(app).post("/api/billing/validate-coupon").set("Authorization", `Bearer ${second.token}`)
      .send({ code: coupon.code, planName: "PRO", billingCycle: "monthly" })
    expect(res.body.success).toBe(false)
    expect(res.body.error).toMatch(/already used/i)
  })
})
