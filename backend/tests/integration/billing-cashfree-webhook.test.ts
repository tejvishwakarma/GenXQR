import crypto from "node:crypto"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { createUser, seedPlans, type TestUser } from "../helpers/factories.js"

/**
 * Cashfree payment confirmation — /api/billing/cashfree-webhook and
 * /api/billing/verify-payment.
 *
 * The webhook is the highest-stakes unauthenticated endpoint in the app: it is
 * public, and what it accepts becomes a paid subscription. These tests exist to
 * make the signature check and the server-side re-read impossible to weaken
 * silently.
 *
 * The threat model differs from a signed-payload gateway. Cashfree's webhook
 * carries little more than an order id, and the app deliberately does not trust
 * its contents: it re-fetches the order from Cashfree's authenticated API and
 * decides from THAT. So there are two separate things to prove —
 *   1. an unsigned or wrongly-signed request is rejected outright, and
 *   2. even a perfectly signed request grants nothing unless the API says the
 *      order is PAID, for the right amount, on a purchasable plan.
 *
 * Cashfree itself is stubbed at the network boundary (global fetch) rather than
 * by mocking our own service, so the real signature verification, HTTP handling
 * and activation logic all execute.
 */

// Matches .env.test. Production values live in /home/genxqr/genxqr.env.
const TEST_SECRET = "test_secret_key"

const PRO_MONTHLY_INR = 799
const STARTER_MONTHLY_INR = 299
const ENTERPRISE_MONTHLY_INR = 9999

interface StubOrder {
  order_id: string
  order_status: string
  order_amount: number
  order_currency?: string
  cf_order_id?: string
  order_tags?: Record<string, string> | null
}

/** Orders the stubbed Cashfree API will return, keyed by order_id. */
const orders = new Map<string, StubOrder>()

/** Records how many times the app actually called out to Cashfree. */
let fetchCalls: string[] = []

/**
 * Stands in for Cashfree's REST API. Only GET /orders/{id} is needed here —
 * order creation is covered by the checkout tests, not the webhook path.
 */
function stubCashfree(): void {
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString()
    fetchCalls.push(url)

    const match = /\/orders\/([^/?]+)$/.exec(url)
    if (match) {
      const order = orders.get(decodeURIComponent(match[1]!))
      if (!order) {
        return new Response(JSON.stringify({ message: "order not found" }), { status: 404 })
      }
      return new Response(JSON.stringify(order), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }
    return new Response(JSON.stringify({ message: "unexpected call" }), { status: 500 })
  })
}

let orderCounter = 0

/** Registers a paid PRO order for `user` in the stubbed gateway. */
function givenPaidOrder(user: TestUser, overrides: Partial<StubOrder> = {}): StubOrder {
  orderCounter += 1
  const orderId = overrides.order_id ?? `genxqr_test_${Date.now()}_${orderCounter}`
  const order: StubOrder = {
    order_id: orderId,
    order_status: "PAID",
    order_amount: PRO_MONTHLY_INR,
    order_currency: "INR",
    cf_order_id: `cf_${orderId}`,
    order_tags: { userId: user.id, planName: "PRO", billingCycle: "monthly" },
    ...overrides,
  }
  orders.set(order.order_id, order)
  return order
}

/**
 * Signs a webhook body exactly as Cashfree does:
 *   base64(HMAC-SHA256(timestamp + rawBody, secretKey))
 *
 * Written out longhand rather than imported from cashfree.service, so a bug in
 * the app's own signing cannot cancel itself out in the test.
 */
function signWebhook(rawBody: string, timestamp: string, secret = TEST_SECRET): string {
  return crypto.createHmac("sha256", secret).update(timestamp + rawBody).digest("base64")
}

function paymentSuccessBody(orderId: string): string {
  return JSON.stringify({
    type: "PAYMENT_SUCCESS_WEBHOOK",
    event_time: "2026-08-14T12:00:00+05:30",
    data: { order: { order_id: orderId } },
  })
}

/**
 * Posts a webhook. The body is sent as a pre-serialised string so the bytes the
 * signature covers are exactly the bytes Express receives — signing a parsed
 * object and letting supertest re-serialise it would be testing nothing.
 */
function postWebhook(rawBody: string, signature: string, timestamp = "1755158400") {
  return request(app)
    .post("/api/billing/cashfree-webhook")
    .set("Content-Type", "application/json")
    .set("x-webhook-timestamp", timestamp)
    .set("x-webhook-signature", signature)
    .send(rawBody)
}

/** Posts a correctly signed PAYMENT_SUCCESS webhook for an order. */
function postSignedSuccess(orderId: string) {
  const body = paymentSuccessBody(orderId)
  const ts = "1755158400"
  return postWebhook(body, signWebhook(body, ts), ts)
}

describe("Cashfree payment confirmation", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    orders.clear()
    fetchCalls = []
  })

  describe("webhook signature verification", () => {
    it("should activate the subscription for a correctly signed success webhook", async () => {
      stubCashfree()
      const user = await createUser()
      const order = givenPaidOrder(user)

      const res = await postSignedSuccess(order.order_id)

      expect(res.status).toBe(200)

      const sub = await prisma.subscription.findUnique({
        where: { userId: user.id },
        include: { plan: true },
      })
      expect(sub?.status).toBe("ACTIVE")
      expect(sub?.plan.name).toBe("PRO")

      const invoice = await prisma.invoice.findUnique({ where: { cashfreeOrderId: order.order_id } })
      expect(invoice?.userId).toBe(user.id)
      // Recorded in paise, from OUR price table — not from the gateway payload.
      expect(invoice?.amount).toBe(PRO_MONTHLY_INR * 100)
    })

    it("should reject a forged signature and activate nothing", async () => {
      stubCashfree()
      const user = await createUser()
      const order = givenPaidOrder(user)
      const body = paymentSuccessBody(order.order_id)

      const res = await postWebhook(body, "not-a-real-signature")

      expect(res.status).toBe(401)
      expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).toBeNull()
      // The order must never even be looked up when the signature fails.
      expect(fetchCalls).toHaveLength(0)
    })

    it("should reject a signature computed with the wrong secret", async () => {
      stubCashfree()
      const user = await createUser()
      const order = givenPaidOrder(user)
      const body = paymentSuccessBody(order.order_id)
      const ts = "1755158400"

      // Exactly what an attacker who knows the algorithm but not the key sends.
      const res = await postWebhook(body, signWebhook(body, ts, "attacker_guessed_secret"), ts)

      expect(res.status).toBe(401)
      expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).toBeNull()
    })

    it("should reject a valid signature replayed against a different timestamp", async () => {
      stubCashfree()
      const user = await createUser()
      const order = givenPaidOrder(user)
      const body = paymentSuccessBody(order.order_id)

      // Signature is valid for ts=1755158400 but the header claims another time,
      // so the recomputed HMAC covers different bytes.
      const res = await postWebhook(body, signWebhook(body, "1755158400"), "1755159999")

      expect(res.status).toBe(401)
      expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).toBeNull()
    })

    it("should reject a body tampered with after signing", async () => {
      stubCashfree()
      const payer = await createUser()
      const victim = await createUser()
      const payerOrder = givenPaidOrder(payer)
      const victimOrder = givenPaidOrder(victim)

      const ts = "1755158400"
      const signedBody = paymentSuccessBody(payerOrder.order_id)
      const signature = signWebhook(signedBody, ts)

      // Re-point a validly signed webhook at another order.
      const res = await postWebhook(paymentSuccessBody(victimOrder.order_id), signature, ts)

      expect(res.status).toBe(401)
      expect(await prisma.subscription.findUnique({ where: { userId: victim.id } })).toBeNull()
    })

    it("should reject a signature of the wrong length without crashing", async () => {
      stubCashfree()
      const user = await createUser()
      const order = givenPaidOrder(user)

      // timingSafeEqual throws on a length mismatch; the check must catch it.
      const res = await postWebhook(paymentSuccessBody(order.order_id), "abc")

      expect(res.status).toBe(401)
      expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).toBeNull()
    })

    it("should reject a webhook with no signature headers at all", async () => {
      stubCashfree()
      const user = await createUser()
      const order = givenPaidOrder(user)

      const res = await request(app)
        .post("/api/billing/cashfree-webhook")
        .set("Content-Type", "application/json")
        .send(paymentSuccessBody(order.order_id))

      expect(res.status).toBe(401)
      expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).toBeNull()
    })
  })

  describe("server-side order verification", () => {
    it("should NOT activate when the gateway says the order is not paid", async () => {
      stubCashfree()
      const user = await createUser()
      // A correctly signed webhook for an order that was never actually paid.
      const order = givenPaidOrder(user, { order_status: "ACTIVE" })

      const res = await postSignedSuccess(order.order_id)

      expect(res.status).toBe(200) // acknowledged, so Cashfree stops retrying
      expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).toBeNull()
      expect(await prisma.invoice.findUnique({ where: { cashfreeOrderId: order.order_id } })).toBeNull()
    })

    it("should NOT activate when the amount paid is less than the plan price", async () => {
      stubCashfree()
      const user = await createUser()
      // Claims PRO but only ₹1 was collected.
      const order = givenPaidOrder(user, { order_amount: 1 })

      await postSignedSuccess(order.order_id)

      expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).toBeNull()
    })

    it("should NOT grant a more expensive plan than was paid for", async () => {
      stubCashfree()
      const user = await createUser()
      // STARTER money, BUSINESS tag.
      const order = givenPaidOrder(user, {
        order_amount: STARTER_MONTHLY_INR,
        order_tags: { userId: user.id, planName: "BUSINESS", billingCycle: "monthly" },
      })

      await postSignedSuccess(order.order_id)

      expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).toBeNull()
    })

    it("should reject a plan that is not purchasable via self-serve checkout", async () => {
      stubCashfree()
      const user = await createUser()
      // ENTERPRISE is sales-assisted; only STARTER/PRO/BUSINESS may self-serve.
      //
      // The amount MUST be ENTERPRISE's real price. With any other figure the
      // amount check rejects this first and the test passes without ever
      // exercising the plan check — confirmed by mutation testing, where
      // deleting the plan check left the suite green.
      const order = givenPaidOrder(user, {
        order_amount: ENTERPRISE_MONTHLY_INR,
        order_tags: { userId: user.id, planName: "ENTERPRISE", billingCycle: "monthly" },
      })

      await postSignedSuccess(order.order_id)

      expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).toBeNull()
    })

    it("should not activate when the order is missing its identifying tags", async () => {
      stubCashfree()
      const user = await createUser()
      const order = givenPaidOrder(user, { order_tags: null })

      await postSignedSuccess(order.order_id)

      expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).toBeNull()
    })
  })

  describe("event handling", () => {
    it("should ignore a signed webhook that is not a payment success", async () => {
      stubCashfree()
      const user = await createUser()
      const order = givenPaidOrder(user)

      const body = JSON.stringify({
        type: "PAYMENT_FAILED_WEBHOOK",
        data: { order: { order_id: order.order_id } },
      })
      const ts = "1755158400"
      const res = await postWebhook(body, signWebhook(body, ts), ts)

      // Acknowledged so Cashfree stops retrying, but nothing is granted — and
      // the order is not even fetched.
      expect(res.status).toBe(200)
      expect(fetchCalls).toHaveLength(0)
      expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).toBeNull()
    })

    it("should not fall over on a signed but empty body", async () => {
      stubCashfree()
      const body = JSON.stringify({})
      const ts = "1755158400"

      const res = await postWebhook(body, signWebhook(body, ts), ts)

      expect(res.status).toBe(200)
    })
  })

  describe("invoice PDF download", () => {
    /** Pays for a plan so there is a real invoice row to download. */
    async function givenPaidInvoice(user: TestUser) {
      const order = givenPaidOrder(user)
      await postSignedSuccess(order.order_id)
      return prisma.invoice.findUniqueOrThrow({ where: { cashfreeOrderId: order.order_id } })
    }

    it("should return a real PDF to the invoice's owner", async () => {
      stubCashfree()
      const user = await createUser()
      const invoice = await givenPaidInvoice(user)

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
      expect(res.headers["content-type"]).toContain("application/pdf")
      // %PDF- magic bytes: proves an actual PDF, not an error page with the
      // right Content-Type.
      expect((res.body as Buffer).subarray(0, 5).toString("latin1")).toBe("%PDF-")
      expect((res.body as Buffer).length).toBeGreaterThan(1000)
    })

    it("should refuse to hand one user another user's invoice", async () => {
      stubCashfree()
      const owner = await createUser()
      const attacker = await createUser()
      const invoice = await givenPaidInvoice(owner)

      const res = await request(app)
        .get(`/api/billing/invoices/${invoice.id}/download`)
        .set("Authorization", `Bearer ${attacker.token}`)

      expect(res.status).toBe(403)
    })

    it("should require authentication", async () => {
      stubCashfree()
      const user = await createUser()
      const invoice = await givenPaidInvoice(user)

      const res = await request(app).get(`/api/billing/invoices/${invoice.id}/download`)

      expect(res.status).toBe(401)
    })
  })

  describe("billing period arithmetic", () => {
    it("should EXTEND the paid period when renewing early, not discard the remainder", async () => {
      stubCashfree()
      const user = await createUser()

      // First payment establishes a period.
      const first = givenPaidOrder(user)
      await postSignedSuccess(first.order_id)
      const afterFirst = await prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } })

      // Renew while ~a month still remains. The new end date must be a further
      // period beyond the existing one — computing it from "now" would silently
      // destroy the time already paid for.
      const second = givenPaidOrder(user)
      await postSignedSuccess(second.order_id)
      const afterSecond = await prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } })

      expect(afterSecond.currentPeriodEnd.getTime()).toBeGreaterThan(afterFirst.currentPeriodEnd.getTime())

      // Roughly two months out, not one. Compared loosely because calendar
      // months vary in length.
      const daysFromNow = (afterSecond.currentPeriodEnd.getTime() - Date.now()) / 86_400_000
      expect(daysFromNow).toBeGreaterThan(50)
    })

    it("should start a fresh period when changing plan rather than carrying days over", async () => {
      stubCashfree()
      const user = await createUser()

      await postSignedSuccess(givenPaidOrder(user).order_id)

      // Now buy a DIFFERENT plan. Carrying the cheaper plan's remaining days onto
      // this one would be unpaid time on the more expensive tier.
      const upgrade = givenPaidOrder(user, {
        order_amount: STARTER_MONTHLY_INR,
        order_tags: { userId: user.id, planName: "STARTER", billingCycle: "monthly" },
      })
      await postSignedSuccess(upgrade.order_id)

      const sub = await prisma.subscription.findUniqueOrThrow({
        where: { userId: user.id },
        include: { plan: true },
      })
      expect(sub.plan.name).toBe("STARTER")
      const daysFromNow = (sub.currentPeriodEnd.getTime() - Date.now()) / 86_400_000
      expect(daysFromNow).toBeLessThan(40)
    })

    it("should refuse a payment collected in a currency other than INR", async () => {
      stubCashfree()
      const user = await createUser()
      // Same number, wrong money.
      const order = givenPaidOrder(user, { order_currency: "USD" })

      await postSignedSuccess(order.order_id)

      expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).toBeNull()
      expect(await prisma.invoice.findUnique({ where: { cashfreeOrderId: order.order_id } })).toBeNull()
    })
  })

  describe("order creation registers the webhook", () => {
    // Cashfree's dashboard entry is a NOTIFY_URL policy: the webhook is
    // delivered to whatever order_meta.notify_url each order carries, not to a
    // fixed endpoint. Forget to send it and the account looks correctly
    // configured while this app silently receives no webhooks at all.
    it("should send notify_url pointing at our webhook when BACKEND_URL is https", async () => {
      const captured: Array<{ url: string; body: any }> = []
      vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
        captured.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null })
        return new Response(
          JSON.stringify({
            cf_order_id: "cf_x", order_id: "genxqr_x", order_status: "ACTIVE",
            order_amount: PRO_MONTHLY_INR, order_currency: "INR",
            payment_session_id: "session_abc",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      })

      const user = await createUser()
      const res = await request(app)
        .post("/api/billing/create-order")
        .set("Authorization", `Bearer ${user.token}`)
        // Checkout requires a mobile number; supplied here so this test exercises
        // notify_url rather than tripping the phone requirement.
        .send({ planName: "PRO", billingCycle: "monthly", phone: "9876543210" })

      expect(res.status).toBe(200)

      const created = captured.find((c) => c.url.endsWith("/orders"))
      expect(created).toBeDefined()

      // .env.test sets BACKEND_URL to an https origin, so the webhook must be
      // registered on the order.
      const notifyUrl: string | undefined = created!.body.order_meta?.notify_url
      expect(notifyUrl).toBeDefined()
      expect(notifyUrl!.startsWith("https://")).toBe(true)
      expect(notifyUrl).toContain("/api/billing/cashfree-webhook")
      // Cashfree's documented ceiling.
      expect(notifyUrl!.length).toBeLessThanOrEqual(250)
    })

    it("should refuse checkout without a usable mobile number", async () => {
      const calls: string[] = []
      vi.stubGlobal("fetch", async (input: string | URL | Request) => {
        calls.push(String(input))
        return new Response("{}", { status: 200 })
      })

      const user = await createUser() // no phone on record
      const res = await request(app)
        .post("/api/billing/create-order")
        .set("Authorization", `Bearer ${user.token}`)
        .send({ planName: "PRO", billingCycle: "monthly" })

      // A placeholder number is not acceptable: it is shown to the customer at
      // checkout, may receive their payment notifications, and every order
      // sharing one number is what gateway risk systems flag.
      expect(res.status).toBe(422)
      expect(calls).toHaveLength(0)
    })

    it("should store the supplied number and reuse it on the next order", async () => {
      const bodies: any[] = []
      vi.stubGlobal("fetch", async (_i: string | URL | Request, init?: RequestInit) => {
        bodies.push(init?.body ? JSON.parse(String(init.body)) : null)
        return new Response(
          JSON.stringify({
            cf_order_id: "cf_p", order_id: "genxqr_p", order_status: "ACTIVE",
            order_amount: PRO_MONTHLY_INR, order_currency: "INR",
            payment_session_id: "session_phone",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      })

      const user = await createUser()

      const first = await request(app)
        .post("/api/billing/create-order")
        .set("Authorization", `Bearer ${user.token}`)
        .send({ planName: "PRO", billingCycle: "monthly", phone: "9876543210" })
      expect(first.status).toBe(200)
      expect(bodies[0].customer_details.customer_phone).toBe("9876543210")

      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).phone).toBe("9876543210")

      // Second order sends no phone — the stored one must be used rather than
      // the request failing or a placeholder being substituted.
      const second = await request(app)
        .post("/api/billing/create-order")
        .set("Authorization", `Bearer ${user.token}`)
        .send({ planName: "PRO", billingCycle: "monthly" })
      expect(second.status).toBe(200)
      expect(bodies[1].customer_details.customer_phone).toBe("9876543210")
    })

    it("should price the order server-side regardless of what the client sends", async () => {
      const captured: Array<any> = []
      vi.stubGlobal("fetch", async (_input: string | URL | Request, init?: RequestInit) => {
        captured.push(init?.body ? JSON.parse(String(init.body)) : null)
        return new Response(
          JSON.stringify({
            cf_order_id: "cf_y", order_id: "genxqr_y", order_status: "ACTIVE",
            order_amount: PRO_MONTHLY_INR, order_currency: "INR",
            payment_session_id: "session_def",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      })

      const user = await createUser()
      await request(app)
        .post("/api/billing/create-order")
        .set("Authorization", `Bearer ${user.token}`)
        // A tampered client trying to buy PRO for one rupee.
        .send({ planName: "PRO", billingCycle: "monthly", phone: "9876543210", amount: 1, order_amount: 1 })

      expect(captured[0].order_amount).toBe(PRO_MONTHLY_INR)
    })
  })

  describe("shared merchant account", () => {
    // Cashfree issues one production key pair per merchant account and registers
    // webhooks per account, so this endpoint legitimately receives payments made
    // on another site sharing the account.
    it("should ignore an order belonging to another site without calling the API", async () => {
      stubCashfree()
      const user = await createUser()
      // No genxqr_ prefix — someone else's order on the same Cashfree account.
      orders.set("othersite_order_991", {
        order_id: "othersite_order_991",
        order_status: "PAID",
        order_amount: 4999,
        order_tags: null,
      })

      const res = await postSignedSuccess("othersite_order_991")

      // Acknowledged, so Cashfree stops retrying...
      expect(res.status).toBe(200)
      // ...without spending an API call on someone else's order...
      expect(fetchCalls).toHaveLength(0)
      // ...and without touching our data.
      expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).toBeNull()
      expect(await prisma.invoice.count()).toBe(0)
    })

    it("should acknowledge rather than endlessly retry an unprocessable own order", async () => {
      stubCashfree()
      const user = await createUser()
      // Our prefix, but the tags are gone — a permanent fault. Retrying would
      // redeliver identical bad data forever, so it must NOT return 5xx.
      const order = givenPaidOrder(user, { order_tags: null })

      const res = await postSignedSuccess(order.order_id)

      expect(res.status).toBe(200)
      expect(res.body.retry).toBe(false)
      expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).toBeNull()
    })

    it("should return 5xx so Cashfree retries when the gateway itself is unreachable", async () => {
      // A transient fault, which is exactly when a retry is worth something.
      vi.stubGlobal("fetch", async () => {
        throw new Error("ECONNREFUSED")
      })
      const user = await createUser()
      const orderId = `genxqr_test_transient_${Date.now()}`

      const body = paymentSuccessBody(orderId)
      const ts = "1755158400"
      const res = await postWebhook(body, signWebhook(body, ts), ts)

      expect(res.status).toBe(500)
      expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).toBeNull()
    })
  })

  describe("replay protection", () => {
    it("should ignore a replayed webhook and not create a second invoice", async () => {
      stubCashfree()
      const user = await createUser()
      const order = givenPaidOrder(user)

      await postSignedSuccess(order.order_id)
      expect(await prisma.invoice.findMany({ where: { userId: user.id } })).toHaveLength(1)

      // A captured webhook is fully static, so a replay must be a no-op.
      const res = await postSignedSuccess(order.order_id)

      expect(res.status).toBe(200)
      expect(await prisma.invoice.findMany({ where: { userId: user.id } })).toHaveLength(1)
    })

    it("should not extend the billing period twice for one payment", async () => {
      stubCashfree()
      const user = await createUser()
      const order = givenPaidOrder(user)

      await postSignedSuccess(order.order_id)
      const first = await prisma.subscription.findUnique({ where: { userId: user.id } })

      await postSignedSuccess(order.order_id)
      const second = await prisma.subscription.findUnique({ where: { userId: user.id } })

      expect(second?.currentPeriodEnd.toISOString()).toBe(first?.currentPeriodEnd.toISOString())
    })
  })

  describe("POST /api/billing/verify-payment", () => {
    it("should activate the subscription for the order's owner", async () => {
      stubCashfree()
      const user = await createUser()
      const order = givenPaidOrder(user)

      const res = await request(app)
        .post("/api/billing/verify-payment")
        .set("Authorization", `Bearer ${user.token}`)
        .send({ orderId: order.order_id })

      expect(res.status).toBe(200)
      expect(res.body.status).toBe("activated")

      const sub = await prisma.subscription.findUnique({
        where: { userId: user.id },
        include: { plan: true },
      })
      expect(sub?.plan.name).toBe("PRO")
    })

    it("should refuse to let one user claim another user's payment", async () => {
      stubCashfree()
      const payer = await createUser()
      const attacker = await createUser()
      const order = givenPaidOrder(payer)

      const res = await request(app)
        .post("/api/billing/verify-payment")
        .set("Authorization", `Bearer ${attacker.token}`)
        .send({ orderId: order.order_id })

      expect(res.status).toBe(403)
      expect(await prisma.subscription.findUnique({ where: { userId: attacker.id } })).toBeNull()
      // And the rightful payer must not be activated by the attacker's request.
      expect(await prisma.subscription.findUnique({ where: { userId: payer.id } })).toBeNull()
    })

    it("should require authentication", async () => {
      stubCashfree()
      const user = await createUser()
      const order = givenPaidOrder(user)

      const res = await request(app)
        .post("/api/billing/verify-payment")
        .send({ orderId: order.order_id })

      expect(res.status).toBe(401)
      expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).toBeNull()
    })

    it("should report an unpaid order without activating anything", async () => {
      stubCashfree()
      const user = await createUser()
      const order = givenPaidOrder(user, { order_status: "ACTIVE" })

      const res = await request(app)
        .post("/api/billing/verify-payment")
        .set("Authorization", `Bearer ${user.token}`)
        .send({ orderId: order.order_id })

      expect(res.status).toBe(202)
      expect(res.body.status).toBe("not_paid")
      expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).toBeNull()
    })
  })
})
