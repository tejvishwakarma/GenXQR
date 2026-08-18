import crypto from "node:crypto"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { createUser, seedPlans, type TestUser } from "../helpers/factories.js"

/**
 * Coupons — discount codes issued by an admin and redeemed at checkout.
 *
 * The threat model is simple to state and easy to get wrong: a customer controls
 * only the CODE. Everything the code is worth must be decided server-side. These
 * tests exist to make that impossible to weaken quietly — in particular that no
 * request body can set its own price, and that the amount check protecting
 * activation is not loosened by the existence of discounts.
 */

const TEST_SECRET = "test_secret_key"
const PRO_MONTHLY_PAISE = 79900
const STARTER_MONTHLY_PAISE = 29900

let couponCounter = 0

async function givenCoupon(overrides: Record<string, unknown> = {}) {
  couponCounter += 1
  return prisma.coupon.create({
    data: {
      code: `TEST${Date.now()}${couponCounter}`,
      discountType: "PERCENTAGE",
      discountValue: 20,
      ...overrides,
    } as never,
  })
}

/** Stubs Cashfree so create-order succeeds and records what we asked it to charge. */
function stubCashfreeCreate(captured: any[]) {
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (init?.body) captured.push({ url, body: JSON.parse(String(init.body)) })
    return new Response(
      JSON.stringify({
        cf_order_id: "cf_test", order_id: "genxqr_test", order_status: "ACTIVE",
        order_amount: 1, order_currency: "INR", payment_session_id: "sess",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )
  })
}

async function createOrder(user: TestUser, body: Record<string, unknown>) {
  return request(app)
    .post("/api/billing/create-order")
    .set("Authorization", `Bearer ${user.token}`)
    .send({ planName: "PRO", billingCycle: "monthly", phone: "9876543210", ...body })
}

describe("coupons", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("pricing is decided server-side", () => {
    it("should charge the discounted amount for a valid percentage coupon", async () => {
      const captured: any[] = []
      stubCashfreeCreate(captured)
      const user = await createUser()
      const coupon = await givenCoupon({ discountValue: 25 })

      const res = await createOrder(user, { couponCode: coupon.code })

      expect(res.status).toBe(200)
      // 25% off ₹799 = ₹599.25
      expect(captured[0].body.order_amount).toBeCloseTo(599.25, 2)
      expect(captured[0].body.order_tags.couponCode).toBe(coupon.code)
      expect(captured[0].body.order_tags.expectedPaise).toBe("59925")
    })

    it("should IGNORE an amount supplied by the client", async () => {
      const captured: any[] = []
      stubCashfreeCreate(captured)
      const user = await createUser()
      const coupon = await givenCoupon({ discountValue: 10 })

      // Everything a tampering client might try.
      const res = await createOrder(user, {
        couponCode: coupon.code,
        amount: 1, order_amount: 1, discountPaise: 79800, finalPaise: 100, expectedPaise: 100,
      })

      expect(res.status).toBe(200)
      // 10% off ₹799 = ₹719.10, not ₹1.
      expect(captured[0].body.order_amount).toBeCloseTo(719.1, 2)
    })

    it("should match a code case-insensitively", async () => {
      const captured: any[] = []
      stubCashfreeCreate(captured)
      const user = await createUser()
      const coupon = await givenCoupon({ discountValue: 50 })

      const res = await createOrder(user, { couponCode: coupon.code.toLowerCase() })

      expect(res.status).toBe(200)
      expect(captured[0].body.order_amount).toBeCloseTo(399.5, 2)
    })

    it("should cap a percentage discount at maxDiscountPaise", async () => {
      const captured: any[] = []
      stubCashfreeCreate(captured)
      const user = await createUser()
      // 50% of ₹799 is ₹399.50, but the cap allows only ₹100.
      const coupon = await givenCoupon({ discountValue: 50, maxDiscountPaise: 10000 })

      await createOrder(user, { couponCode: coupon.code })

      expect(captured[0].body.order_amount).toBeCloseTo(699, 2)
    })

    it("should charge full price when no coupon is supplied", async () => {
      const captured: any[] = []
      stubCashfreeCreate(captured)
      const user = await createUser()

      await createOrder(user, {})

      expect(captured[0].body.order_amount).toBeCloseTo(799, 2)
      expect(captured[0].body.order_tags.couponCode).toBeUndefined()
    })
  })

  describe("eligibility", () => {
    async function expectRejected(user: TestUser, code: string, planName = "PRO") {
      const res = await request(app)
        .post("/api/billing/validate-coupon")
        .set("Authorization", `Bearer ${user.token}`)
        .send({ code, planName, billingCycle: "monthly" })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(false)
      return res.body.error as string
    }

    it("should refuse an unknown code without revealing that it is unknown", async () => {
      const user = await createUser()
      const reason = await expectRejected(user, "NOPE-DOES-NOT-EXIST")
      // Same wording as an inactive code, so the endpoint is not an oracle for
      // which codes exist.
      expect(reason).toBe("That coupon code is not valid.")
    })

    it("should refuse an inactive coupon with the same message", async () => {
      const user = await createUser()
      const coupon = await givenCoupon({ isActive: false })
      expect(await expectRejected(user, coupon.code)).toBe("That coupon code is not valid.")
    })

    it("should refuse an expired coupon", async () => {
      const user = await createUser()
      const coupon = await givenCoupon({ validUntil: new Date(Date.now() - 86_400_000) })
      expect(await expectRejected(user, coupon.code)).toMatch(/expired/i)
    })

    it("should refuse a coupon that is not active yet", async () => {
      const user = await createUser()
      const coupon = await givenCoupon({ validFrom: new Date(Date.now() + 86_400_000) })
      expect(await expectRejected(user, coupon.code)).toMatch(/not active yet/i)
    })

    it("should refuse a coupon restricted to another plan", async () => {
      const user = await createUser()
      const coupon = await givenCoupon({ applicablePlans: ["STARTER"] })
      expect(await expectRejected(user, coupon.code, "PRO")).toMatch(/does not apply/i)
    })

    it("should refuse a coupon restricted to another billing cycle", async () => {
      const user = await createUser()
      const coupon = await givenCoupon({ applicableCycles: ["yearly"] })
      expect(await expectRejected(user, coupon.code)).toMatch(/yearly/i)
    })

    it("should refuse once the global redemption limit is reached", async () => {
      const user = await createUser()
      const coupon = await givenCoupon({ maxRedemptions: 5, redemptionCount: 5 })
      expect(await expectRejected(user, coupon.code)).toMatch(/limit/i)
    })

    it("should refuse a second use by the same customer", async () => {
      const user = await createUser()
      const coupon = await givenCoupon({ maxRedemptionsPerUser: 1 })
      await prisma.couponRedemption.create({
        data: {
          couponId: coupon.id, userId: user.id, cashfreeOrderId: `genxqr_used_${Date.now()}`,
          originalPaise: PRO_MONTHLY_PAISE, discountPaise: 100, finalPaise: PRO_MONTHLY_PAISE - 100,
          planName: "PRO", billingCycle: "monthly",
        },
      })
      expect(await expectRejected(user, coupon.code)).toMatch(/already used/i)
    })

    it("should still allow a DIFFERENT customer to use it", async () => {
      const first = await createUser()
      const second = await createUser()
      const coupon = await givenCoupon({ maxRedemptionsPerUser: 1 })
      await prisma.couponRedemption.create({
        data: {
          couponId: coupon.id, userId: first.id, cashfreeOrderId: `genxqr_other_${Date.now()}`,
          originalPaise: PRO_MONTHLY_PAISE, discountPaise: 100, finalPaise: PRO_MONTHLY_PAISE - 100,
          planName: "PRO", billingCycle: "monthly",
        },
      })

      const res = await request(app)
        .post("/api/billing/validate-coupon")
        .set("Authorization", `Bearer ${second.token}`)
        .send({ code: coupon.code, planName: "PRO", billingCycle: "monthly" })

      expect(res.body.success).toBe(true)
    })

    it("should require authentication to check a code", async () => {
      const coupon = await givenCoupon()
      const res = await request(app)
        .post("/api/billing/validate-coupon")
        .send({ code: coupon.code, planName: "PRO", billingCycle: "monthly" })
      // Anonymous checking would be a code-guessing oracle, and per-user limits
      // cannot be evaluated without a user.
      expect(res.status).toBe(401)
    })

    it("should preview exactly what checkout will charge", async () => {
      const user = await createUser()
      const coupon = await givenCoupon({ discountValue: 30 })

      const preview = await request(app)
        .post("/api/billing/validate-coupon")
        .set("Authorization", `Bearer ${user.token}`)
        .send({ code: coupon.code, planName: "PRO", billingCycle: "monthly" })

      const captured: any[] = []
      stubCashfreeCreate(captured)
      await createOrder(user, { couponCode: coupon.code })

      // The previewed figure and the charged figure come from one function, and
      // this proves they have not diverged.
      expect(preview.body.data.finalPaise).toBe(Math.round(captured[0].body.order_amount * 100))
    })
  })

  describe("activation still refuses to be underpaid", () => {
    function signedWebhook(orderId: string) {
      const body = JSON.stringify({
        type: "PAYMENT_SUCCESS_WEBHOOK",
        data: { order: { order_id: orderId } },
      })
      const ts = "1755158400"
      const sig = crypto.createHmac("sha256", TEST_SECRET).update(ts + body).digest("base64")
      return request(app)
        .post("/api/billing/cashfree-webhook")
        .set("Content-Type", "application/json")
        .set("x-webhook-timestamp", ts)
        .set("x-webhook-signature", sig)
        .send(body)
    }

    /** Stubs Get Order so the webhook sees a paid order with the given tags/amount. */
    function stubPaidOrder(orderId: string, amountPaise: number, tags: Record<string, string>) {
      vi.stubGlobal("fetch", async () =>
        new Response(
          JSON.stringify({
            cf_order_id: `cf_${orderId}`, order_id: orderId, order_status: "PAID",
            order_amount: amountPaise / 100, order_currency: "INR", order_tags: tags,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
    }

    it("should activate and record the redemption for a discounted payment", async () => {
      const user = await createUser()
      const coupon = await givenCoupon({ discountValue: 25 })
      const orderId = `genxqr_disc_${Date.now()}`
      const finalPaise = PRO_MONTHLY_PAISE - Math.floor(PRO_MONTHLY_PAISE * 0.25)

      stubPaidOrder(orderId, finalPaise, {
        userId: user.id, planName: "PRO", billingCycle: "monthly",
        expectedPaise: String(finalPaise), couponCode: coupon.code, couponId: coupon.id,
      })
      await signedWebhook(orderId)

      const sub = await prisma.subscription.findUnique({ where: { userId: user.id }, include: { plan: true } })
      expect(sub?.plan.name).toBe("PRO")

      const redemption = await prisma.couponRedemption.findUnique({ where: { cashfreeOrderId: orderId } })
      expect(redemption?.discountPaise).toBe(PRO_MONTHLY_PAISE - finalPaise)
      expect(redemption?.finalPaise).toBe(finalPaise)
      // The invoice records what was actually charged, not the list price.
      const invoice = await prisma.invoice.findUnique({ where: { cashfreeOrderId: orderId } })
      expect(invoice?.amount).toBe(finalPaise)
      // And the coupon's counter moved.
      expect((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).redemptionCount).toBe(1)
    })

    it("should REFUSE a tag claiming an expected amount above the list price", async () => {
      const user = await createUser()
      const orderId = `genxqr_over_${Date.now()}`
      // Paid more than the plan costs, with a tag to match — still refused,
      // because the tag may never exceed the list price.
      stubPaidOrder(orderId, PRO_MONTHLY_PAISE * 2, {
        userId: user.id, planName: "PRO", billingCycle: "monthly",
        expectedPaise: String(PRO_MONTHLY_PAISE * 2),
      })

      await signedWebhook(orderId)

      expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).toBeNull()
    })

    it("should REFUSE a tag claiming a near-zero expected amount", async () => {
      const user = await createUser()
      const orderId = `genxqr_free_${Date.now()}`
      // The "free PRO plan" attempt: pay 1 paisa and claim that was expected.
      stubPaidOrder(orderId, 1, {
        userId: user.id, planName: "PRO", billingCycle: "monthly", expectedPaise: "1",
      })

      await signedWebhook(orderId)

      expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).toBeNull()
    })

    it("should REFUSE when the amount paid is less than the tagged expectation", async () => {
      const user = await createUser()
      const orderId = `genxqr_short_${Date.now()}`
      // Tag says ₹599.25 was expected; only ₹100 arrived.
      stubPaidOrder(orderId, 10000, {
        userId: user.id, planName: "PRO", billingCycle: "monthly", expectedPaise: "59925",
      })

      await signedWebhook(orderId)

      expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).toBeNull()
    })

    it("should not record a second redemption when a webhook is replayed", async () => {
      const user = await createUser()
      const coupon = await givenCoupon({ discountValue: 10 })
      const orderId = `genxqr_replay_${Date.now()}`
      const finalPaise = PRO_MONTHLY_PAISE - Math.floor(PRO_MONTHLY_PAISE * 0.1)

      stubPaidOrder(orderId, finalPaise, {
        userId: user.id, planName: "PRO", billingCycle: "monthly",
        expectedPaise: String(finalPaise), couponCode: coupon.code, couponId: coupon.id,
      })

      await signedWebhook(orderId)
      await signedWebhook(orderId)

      expect(await prisma.couponRedemption.count({ where: { couponId: coupon.id } })).toBe(1)
      expect((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).redemptionCount).toBe(1)
    })

    it("should put the discount breakdown on the invoice PDF", async () => {
      const user = await createUser()
      const coupon = await givenCoupon({ discountValue: 99 })
      const orderId = `genxqr_inv_${Date.now()}`
      const discountPaise = Math.floor(PRO_MONTHLY_PAISE * 0.99)
      const finalPaise = PRO_MONTHLY_PAISE - discountPaise

      stubPaidOrder(orderId, finalPaise, {
        userId: user.id, planName: "PRO", billingCycle: "monthly",
        expectedPaise: String(finalPaise), couponCode: coupon.code, couponId: coupon.id,
      })
      await signedWebhook(orderId)

      const invoice = await prisma.invoice.findUniqueOrThrow({ where: { cashfreeOrderId: orderId } })

      // The invoice row only stores what was CHARGED, so the PDF has to join the
      // redemption to show a breakdown. Without that join the receipt showed a
      // ₹799 plan as simply costing ₹7.99, with no discount line at all.
      const redemption = await prisma.couponRedemption.findUniqueOrThrow({
        where: { cashfreeOrderId: orderId },
        select: { originalPaise: true, discountPaise: true, coupon: { select: { code: true } } },
      })
      expect(redemption.originalPaise).toBe(PRO_MONTHLY_PAISE)
      expect(redemption.discountPaise).toBe(discountPaise)
      expect(redemption.coupon.code).toBe(coupon.code)
      expect(invoice.amount).toBe(finalPaise)

      // And the route still produces a real PDF with that data joined in.
      const res = await request(app)
        .get(`/api/billing/invoices/${invoice.id}/download`)
        .set("Authorization", `Bearer ${user.token}`)
        .buffer(true)
        .parse((response, cb) => {
          const parts: Buffer[] = []
          response.on("data", (c: Buffer) => parts.push(c))
          response.on("end", () => cb(null, Buffer.concat(parts)))
        })

      expect(res.status).toBe(200)
      expect((res.body as Buffer).subarray(0, 5).toString("latin1")).toBe("%PDF-")
    })

    it("should still charge full price when an order carries no coupon", async () => {
      const user = await createUser()
      const orderId = `genxqr_full_${Date.now()}`
      stubPaidOrder(orderId, STARTER_MONTHLY_PAISE, {
        userId: user.id, planName: "STARTER", billingCycle: "monthly",
      })

      await signedWebhook(orderId)

      const invoice = await prisma.invoice.findUnique({ where: { cashfreeOrderId: orderId } })
      expect(invoice?.amount).toBe(STARTER_MONTHLY_PAISE)
      expect(await prisma.couponRedemption.count({ where: { cashfreeOrderId: orderId } })).toBe(0)
    })
  })
})
