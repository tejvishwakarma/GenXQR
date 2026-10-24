import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { releaseStaleCheckoutHolds } from "../../src/services/billing.service.js"
import { createUser, seedPlans, type TestUser } from "../helpers/factories.js"

/**
 * Checkout holds (security audit, 22 Oct 2026).
 *
 * A coupon use and GenXQR credit used to be recorded only when an order was
 * PAID. Pricing only saw recorded uses, so one single-use coupon — or one
 * credit balance — could be priced into any number of open orders, and every
 * one of them paid: 12 months of PRO for 12 × ₹1.
 *
 * Now both are held when the order is created, confirmed when it is paid, and
 * released only once Cashfree says the order can no longer be paid.
 */

const PRO_MONTHLY_PAISE = 79900

type CashfreeStub = {
  created: Array<{ order_id: string; order_amount: number; order_tags: Record<string, string> }>
  /** What PATCH (terminate) reports for each order; default ACTIVE (still payable). */
  terminate: Record<string, string>
  /** What GET reports for each order; default ACTIVE. */
  status: Record<string, string>
  failCreate?: boolean
}

function stubCashfree(): CashfreeStub {
  const stub: CashfreeStub = { created: [], terminate: {}, status: {} }
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? "GET"
    const orderId = decodeURIComponent(url.split("/orders/")[1] ?? "")
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

    if (method === "POST") {
      if (stub.failCreate) return json({ message: "boom" }, 500)
      const body = JSON.parse(String(init?.body))
      stub.created.push(body)
      return json({ cf_order_id: "cf", order_id: body.order_id, order_status: "ACTIVE", order_amount: body.order_amount, order_currency: "INR", payment_session_id: "sess" })
    }
    const order = stub.created.find((o) => o.order_id === orderId)
    const status = method === "PATCH" ? (stub.terminate[orderId] ?? "ACTIVE") : (stub.status[orderId] ?? "ACTIVE")
    return json({
      cf_order_id: "cf", order_id: orderId, order_status: status,
      order_amount: order?.order_amount ?? 0, order_currency: "INR", order_tags: order?.order_tags ?? {},
    })
  })
  return stub
}

let couponCounter = 0
async function givenCoupon(overrides: Record<string, unknown> = {}) {
  couponCounter += 1
  return prisma.coupon.create({
    data: { code: `HOLD${Date.now()}${couponCounter}`, discountType: "PERCENTAGE", discountValue: 20, ...overrides } as never,
  })
}

async function userWithCredit(paise: number) {
  const user = await createUser()
  await prisma.creditEntry.create({ data: { userId: user.id, amountPaise: paise, kind: "ADJUSTMENT", availableAt: new Date(Date.now() - 1000) } })
  return user
}

function createOrder(user: TestUser, body: Record<string, unknown> = {}) {
  return request(app)
    .post("/api/billing/create-order")
    .set("Authorization", `Bearer ${user.token}`)
    .send({ planName: "PRO", billingCycle: "monthly", phone: "9876543210", ...body })
}

async function availableCredit(userId: string) {
  const r = await prisma.creditEntry.aggregate({
    where: { userId, voidedAt: null, availableAt: { lte: new Date() } },
    _sum: { amountPaise: true },
  })
  return r._sum.amountPaise ?? 0
}

/** Makes every hold of this user look older than the order expiry. */
async function ageHolds(userId: string) {
  const old = new Date(Date.now() - 2 * 60 * 60 * 1000)
  await prisma.creditEntry.updateMany({ where: { userId, kind: "REDEMPTION" }, data: { createdAt: old } })
  await prisma.couponRedemption.updateMany({ where: { userId }, data: { redeemedAt: old } })
}

describe("checkout holds", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("coupons", () => {
    it("should not let a single-use coupon be priced into a second open order", async () => {
      const cf = stubCashfree()
      const user = await createUser()
      const coupon = await givenCoupon({ maxRedemptionsPerUser: 1 })

      await createOrder(user, { couponCode: coupon.code }).expect(200)
      // The first order is still payable (terminate is refused → ACTIVE).
      const second = await createOrder(user, { couponCode: coupon.code })
      expect(second.status).toBe(422)
      expect(second.body.error).toMatch(/already used/i)
      expect(cf.created).toHaveLength(1)
    })

    it("should hold a single-use coupon for only one of two checkouts started together", async () => {
      stubCashfree()
      const user = await createUser()
      const coupon = await givenCoupon({ maxRedemptionsPerUser: 1 })
      const results = await Promise.all([1, 2, 3].map(() => createOrder(user, { couponCode: coupon.code })))
      expect(results.filter((r) => r.status === 200)).toHaveLength(1)
      expect(await prisma.couponRedemption.count({ where: { couponId: coupon.id } })).toBe(1)
    })

    it("should not let a capped coupon go over its limit through open orders", async () => {
      stubCashfree()
      const coupon = await givenCoupon({ maxRedemptions: 1 })
      await createOrder(await createUser(), { couponCode: coupon.code }).expect(200)
      const other = await createOrder(await createUser(), { couponCode: coupon.code })
      expect(other.status).toBe(422)
      expect(other.body.error).toMatch(/redemption limit/i)
    })

    it("should release the coupon when the abandoned order is terminated, so the customer can start again", async () => {
      const cf = stubCashfree()
      const user = await createUser()
      const coupon = await givenCoupon({ maxRedemptionsPerUser: 1 })

      await createOrder(user, { couponCode: coupon.code }).expect(200)
      cf.terminate[cf.created[0]!.order_id] = "TERMINATED"

      // The preview already assumes the abandoned order will be released…
      const quote = await request(app).post("/api/billing/quote").set("Authorization", `Bearer ${user.token}`)
        .send({ planName: "PRO", billingCycle: "monthly", couponCode: coupon.code }).expect(200)
      expect(quote.body.couponError).toBeUndefined()

      // …and the new checkout gets the coupon.
      await createOrder(user, { couponCode: coupon.code }).expect(200)
      expect(Number(cf.created[1]!.order_tags.expectedPaise)).toBe(PRO_MONTHLY_PAISE * 0.8)
      expect(await prisma.couponRedemption.count({ where: { couponId: coupon.id } })).toBe(1)
      expect((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).redemptionCount).toBe(1)
    })
  })

  describe("credit", () => {
    it("should not price the same credit into a second open order", async () => {
      const cf = stubCashfree()
      const user = await userWithCredit(30000)

      await createOrder(user).expect(200)
      await createOrder(user).expect(200)
      expect(cf.created[0]!.order_tags.creditPaise).toBe("30000")
      expect(cf.created[1]!.order_tags.creditPaise).toBeUndefined()
      expect(cf.created[1]!.order_amount).toBe(PRO_MONTHLY_PAISE / 100)
    })

    it("should hold credit for only one of two checkouts started together", async () => {
      const cf = stubCashfree()
      const user = await userWithCredit(30000)
      const results = await Promise.all([createOrder(user), createOrder(user)])
      const withCredit = cf.created.filter((o) => o.order_tags.creditPaise)
      expect(withCredit).toHaveLength(1)
      // The loser was priced with credit it no longer had: refused, not charged less.
      expect(results.map((r) => r.status).sort()).toEqual([200, 409])
      expect(await availableCredit(user.id)).toBe(0)
    })

    it("should spend held credit once when the order is paid", async () => {
      const cf = stubCashfree()
      const user = await userWithCredit(30000)
      await createOrder(user).expect(200)
      const orderId = cf.created[0]!.order_id
      cf.status[orderId] = "PAID"

      await ageHolds(user.id)
      await releaseStaleCheckoutHolds() // finds the order PAID → activates it
      await releaseStaleCheckoutHolds() // idempotent
      expect(await prisma.invoice.count({ where: { cashfreeOrderId: orderId } })).toBe(1)
      expect(await prisma.creditEntry.count({ where: { userId: user.id, kind: "REDEMPTION" } })).toBe(1)
      expect(await availableCredit(user.id)).toBe(0)
    })
  })

  describe("releasing", () => {
    it("should release holds when Cashfree refuses to create the order", async () => {
      const cf = stubCashfree()
      cf.failCreate = true
      const user = await userWithCredit(30000)
      const coupon = await givenCoupon({ maxRedemptions: 5 })

      expect((await createOrder(user, { couponCode: coupon.code })).status).toBe(502)
      expect(await availableCredit(user.id)).toBe(30000)
      expect(await prisma.couponRedemption.count({ where: { couponId: coupon.id } })).toBe(0)
      expect((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).redemptionCount).toBe(0)
    })

    it("should release an expired order's holds in the sweep, and keep a still-payable one", async () => {
      const cf = stubCashfree()
      const expiredUser = await userWithCredit(30000)
      const activeUser = await userWithCredit(30000)
      await createOrder(expiredUser).expect(200)
      await createOrder(activeUser).expect(200)
      cf.status[cf.created[0]!.order_id] = "EXPIRED"
      await ageHolds(expiredUser.id)
      await ageHolds(activeUser.id)

      await releaseStaleCheckoutHolds()
      expect(await availableCredit(expiredUser.id)).toBe(30000)
      expect(await availableCredit(activeUser.id)).toBe(0)
    })

    it("should still honour a payment that arrives after its hold was released", async () => {
      const cf = stubCashfree()
      const user = await userWithCredit(30000)
      await createOrder(user).expect(200)
      const orderId = cf.created[0]!.order_id
      cf.status[orderId] = "EXPIRED"
      await ageHolds(user.id)
      await releaseStaleCheckoutHolds()
      expect(await availableCredit(user.id)).toBe(30000)

      // Cashfree later reports it paid after all: the credit it was priced with is spent.
      cf.status[orderId] = "PAID"
      await request(app).post("/api/billing/verify-payment").set("Authorization", `Bearer ${user.token}`)
        .send({ orderId }).expect(200)
      expect(await prisma.invoice.count({ where: { cashfreeOrderId: orderId } })).toBe(1)
      expect(await availableCredit(user.id)).toBe(0)
    })
  })
})
