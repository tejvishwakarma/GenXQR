import crypto from "node:crypto"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { createUser, seedPlans } from "../helpers/factories.js"

/**
 * A paid order must never be acknowledged without being applied (24 Oct 2026).
 *
 * Activation read "no subscription" under the purchase lock, then created one.
 * Rows are also created OUTSIDE that lock — a new account's trial starts in the
 * background at sign-up, getOrCreateSubscription runs on ordinary requests —
 * so the create could hit P2002. The handler took every P2002 for "the other
 * path already activated this order" and answered Cashfree 200: paid, never
 * applied, never retried. Seen as intermittent referral/coupon test failures.
 */

const TEST_SECRET = "test_secret_key"
const PRO_MONTHLY_PAISE = 79900

function signedWebhook(orderId: string) {
  const body = JSON.stringify({ type: "PAYMENT_SUCCESS_WEBHOOK", data: { order: { order_id: orderId } } })
  const ts = "1755158400"
  const sig = crypto.createHmac("sha256", TEST_SECRET).update(ts + body).digest("base64")
  return request(app)
    .post("/api/billing/cashfree-webhook")
    .set("Content-Type", "application/json")
    .set("x-webhook-timestamp", ts)
    .set("x-webhook-signature", sig)
    .send(body)
}

function stubPaidProOrder(orderId: string, userId: string) {
  vi.stubGlobal("fetch", async () =>
    new Response(
      JSON.stringify({
        cf_order_id: `cf_${orderId}`, order_id: orderId, order_status: "PAID",
        order_amount: PRO_MONTHLY_PAISE / 100, order_currency: "INR",
        order_tags: { userId, planName: "PRO", billingCycle: "monthly", expectedPaise: String(PRO_MONTHLY_PAISE) },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  )
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe("payment activation", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("should apply a payment when the account's subscription row appears mid-activation", async () => {
    const user = await createUser()
    const freePlan = await prisma.plan.findUniqueOrThrow({ where: { name: "FREE" } })
    const orderId = `genxqr_race_${Date.now()}`
    stubPaidProOrder(orderId, user.id)

    // Another connection creates the row (as the sign-up trial does) and holds
    // it uncommitted while the payment activates, so activation reads "none"
    // and then meets that row when it writes.
    const now = new Date()
    const other = prisma.$transaction(async (tx) => {
      await tx.subscription.create({
        data: { userId: user.id, planId: freePlan.id, status: "ACTIVE", currentPeriodStart: now, currentPeriodEnd: now },
      })
      await sleep(1000)
    }, { timeout: 10_000 })
    await sleep(200)

    const res = await signedWebhook(orderId)
    await other

    expect(await prisma.invoice.count({ where: { cashfreeOrderId: orderId } }), `REAL BUG: payment acknowledged (${res.status} ${JSON.stringify(res.body)}) but never applied`).toBe(1)
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { userId: user.id }, include: { plan: true } })
    expect(sub.plan.name).toBe("PRO")
    expect(sub.currentPeriodEnd.getTime()).toBeGreaterThan(Date.now() + 27 * 86_400_000)
  })

  it("should answer 500 (so Cashfree retries) when a unique constraint fails but the order was not processed", async () => {
    const user = await createUser()
    const orderId = `genxqr_uniq_${Date.now()}`
    stubPaidProOrder(orderId, user.id)

    // Force a unique violation on this order's invoice insert only, without an
    // invoice existing — what any OTHER constraint failing looks like.
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION genxqr_test_unique_violation() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'duplicate key value violates unique constraint "test_only"' USING ERRCODE = 'unique_violation'; END
      $$ LANGUAGE plpgsql`)
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER genxqr_test_unique_violation BEFORE INSERT ON "invoices" FOR EACH ROW
      WHEN (NEW."cashfreeOrderId" = '${orderId}') EXECUTE FUNCTION genxqr_test_unique_violation()`)
    try {
      const res = await signedWebhook(orderId)
      expect(res.status, `REAL BUG: an unapplied payment was acknowledged: ${JSON.stringify(res.body)}`).toBe(500)
      expect(await prisma.invoice.count({ where: { cashfreeOrderId: orderId } })).toBe(0)
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS genxqr_test_unique_violation ON "invoices"`)
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS genxqr_test_unique_violation()`)
    }
  })
})
