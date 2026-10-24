import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { createUser, seedPlans } from "../helpers/factories.js"

/**
 * verify-payment looked up ANY order id on the (shared) Cashfree account and
 * let an order with no userId tag through the ownership check (security audit,
 * 23 Oct 2026).
 */
describe("verify-payment scope", () => {
  beforeAll(async () => {
    await seedPlans()
  })
  afterEach(() => vi.unstubAllGlobals())

  it("should not look up another site's order at all", async () => {
    const user = await createUser()
    vi.stubGlobal("fetch", async () => { throw new Error("must not call Cashfree") })
    const res = await request(app).post("/api/billing/verify-payment").set("Authorization", `Bearer ${user.token}`).send({ orderId: "othersite_12345" })
    expect(res.status).toBe(404)
  })

  it("should refuse one of our orders that is not tagged with this user", async () => {
    const user = await createUser()
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({
      cf_order_id: "cf", order_id: "genxqr_untagged_1", order_status: "PAID", order_amount: 799, order_currency: "INR", order_tags: {},
    }), { status: 200, headers: { "Content-Type": "application/json" } }))
    const res = await request(app).post("/api/billing/verify-payment").set("Authorization", `Bearer ${user.token}`).send({ orderId: "genxqr_untagged_1" })
    expect(res.status).toBe(403)
  })
})
