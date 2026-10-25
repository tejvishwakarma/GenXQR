import crypto from "node:crypto"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { createAdmin, createSuperAdmin, createUser, giveSubscription, seedPlans } from "../helpers/factories.js"
import { reconcileRefunds } from "../../src/services/refund.service.js"

/**
 * Refunds (decided 25 Oct 2026): recorded from the Cashfree webhook or by an
 * admin, netted out of every revenue figure, voiding a referral when a
 * qualifying purchase is fully refunded, optionally pulling access.
 */

const TEST_SECRET = "test_secret_key"
let orderSeq = 0

async function paidInvoice(userId: string, amountPaise: number, opts: { cycle?: "monthly" | "yearly"; periodEndDaysFromNow?: number } = {}) {
  const sub = await giveSubscription(userId, "PRO")
  orderSeq += 1
  const now = new Date()
  const periodEnd = new Date(now.getTime() + (opts.periodEndDaysFromNow ?? 20) * 86_400_000)
  return prisma.invoice.create({
    data: {
      userId, subscriptionId: sub.id, amount: amountPaise, currency: "INR", status: "paid",
      planName: "PRO", billingCycle: opts.cycle ?? "monthly", periodStart: now, periodEnd,
      cashfreeOrderId: `genxqr_ref_${Date.now()}_${orderSeq}`, cashfreePaymentId: `cf_${orderSeq}`,
    },
  })
}

/** Stubs Cashfree's GET refund so the webhook path can re-fetch it. */
function stubRefundFetch(amountRupees: number, status = "SUCCESS", cfRefundId = "cfr_1") {
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes("/refunds/")) {
      return new Response(JSON.stringify({
        cf_refund_id: cfRefundId, refund_id: "r1", order_id: url.split("/orders/")[1]?.split("/")[0],
        refund_amount: amountRupees, refund_status: status,
      }), { status: 200, headers: { "Content-Type": "application/json" } })
    }
    return new Response("{}", { status: 200 })
  })
}

function refundWebhook(orderId: string, refundId = "r1") {
  const body = JSON.stringify({ type: "REFUND_STATUS_WEBHOOK", data: { refund: { order_id: orderId, refund_id: refundId, cf_refund_id: "cfr_1" } } })
  const ts = "1755158400"
  const sig = crypto.createHmac("sha256", TEST_SECRET).update(ts + body).digest("base64")
  return request(app).post("/api/billing/cashfree-webhook")
    .set("Content-Type", "application/json").set("x-webhook-timestamp", ts).set("x-webhook-signature", sig).send(body)
}

beforeAll(async () => { await seedPlans() })
afterEach(() => { vi.unstubAllGlobals() })

describe("recording refunds", () => {
  it("should record a Cashfree refund from the webhook and net it off the invoice", async () => {
    const user = await createUser()
    const inv = await paidInvoice(user.id, 79900)
    stubRefundFetch(799) // full, in rupees

    await refundWebhook(inv.cashfreeOrderId!).expect(200)

    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })
    expect(after.refundedAmount).toBe(79900)
    expect(after.refundedAt).not.toBeNull()
    expect(after.status, "status stays 'paid'; the refund is tracked separately").toBe("paid")
    expect(await prisma.refund.count({ where: { invoiceId: inv.id, source: "cashfree" } })).toBe(1)
  })

  it("should be idempotent — a replayed refund webhook records once", async () => {
    const user = await createUser()
    const inv = await paidInvoice(user.id, 79900)
    stubRefundFetch(799)
    await refundWebhook(inv.cashfreeOrderId!).expect(200)
    await refundWebhook(inv.cashfreeOrderId!).expect(200)
    expect(await prisma.refund.count({ where: { invoiceId: inv.id } })).toBe(1)
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).refundedAmount).toBe(79900)
  })

  it("should not record a refund that is not yet SUCCESS", async () => {
    const user = await createUser()
    const inv = await paidInvoice(user.id, 79900)
    stubRefundFetch(799, "PENDING")
    await refundWebhook(inv.cashfreeOrderId!).expect(200)
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).refundedAmount).toBe(0)
  })

  it("should support partial refunds and cap at the amount paid", async () => {
    const admin = await createSuperAdmin()
    const user = await createUser()
    const inv = await paidInvoice(user.id, 79900)
    const refund = (amountPaise: number) => request(app).post(`/admin-api/payments/${inv.id}/refund`)
      .set("Authorization", `Bearer ${admin.token}`).send({ amountPaise, reason: "partial" })

    await refund(20000).expect(200)
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).refundedAmount).toBe(20000)
    // A second refund that would exceed the total is capped to the remainder.
    await refund(99999).expect(200)
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).refundedAmount).toBe(79900)
    // Now fully refunded: another is refused.
    await refund(100).expect(409)
  })
})

describe("revenue reflects refunds", () => {
  it("should subtract refunds from dashboard MRR and the revenue page", async () => {
    const admin = await createSuperAdmin()
    const user = await createUser()
    const inv = await paidInvoice(user.id, 50000, { cycle: "monthly", periodEndDaysFromNow: 20 })

    const mrrBefore = (await request(app).get("/admin-api/dashboard").set("Authorization", `Bearer ${admin.token}`)).body.data.mrr
    const revBefore = (await request(app).get("/admin-api/revenue").set("Authorization", `Bearer ${admin.token}`)).body.data

    await request(app).post(`/admin-api/payments/${inv.id}/refund`).set("Authorization", `Bearer ${admin.token}`)
      .send({ amountPaise: 20000, reason: "goodwill" }).expect(200)

    const mrrAfter = (await request(app).get("/admin-api/dashboard").set("Authorization", `Bearer ${admin.token}`)).body.data.mrr
    const revAfter = (await request(app).get("/admin-api/revenue").set("Authorization", `Bearer ${admin.token}`)).body.data

    expect(mrrBefore - mrrAfter, "₹200 refund lowers MRR by 200").toBe(200)
    expect(revBefore.mrr - revAfter.mrr).toBe(200)
    expect(revAfter.refundedTotal).toBeGreaterThanOrEqual(200)
  })
})

describe("refund side effects", () => {
  it("should void a referral when its qualifying purchase is fully refunded", async () => {
    const referrer = await createUser()
    const referee = await createUser()
    const inv = await paidInvoice(referee.id, 79900)
    const referral = await prisma.referral.create({
      data: {
        referrerId: referrer.id, refereeId: referee.id, refereeEmailHash: "hash",
        qualifyingOrderId: inv.cashfreeOrderId, qualifyingAmountPaise: 79900, rewardPaise: 15980,
        qualifiedAt: new Date(), availableAt: new Date(Date.now() + 15 * 86_400_000),
      },
    })
    await prisma.creditEntry.create({ data: { userId: referrer.id, referralId: referral.id, amountPaise: 15980, kind: "REFERRAL_REWARD", availableAt: new Date() } })
    const admin = await createSuperAdmin()

    // Partial first: referral stays live.
    await request(app).post(`/admin-api/payments/${inv.id}/refund`).set("Authorization", `Bearer ${admin.token}`).send({ amountPaise: 10000, reason: "partial" }).expect(200)
    expect((await prisma.referral.findUniqueOrThrow({ where: { id: referral.id } })).cancelledAt).toBeNull()

    // Finish the refund: now voided, and the reward credit is voided too.
    await request(app).post(`/admin-api/payments/${inv.id}/refund`).set("Authorization", `Bearer ${admin.token}`).send({ amountPaise: 69900, reason: "full" }).expect(200)
    expect((await prisma.referral.findUniqueOrThrow({ where: { id: referral.id } })).cancelledAt).not.toBeNull()
    expect((await prisma.creditEntry.findFirstOrThrow({ where: { referralId: referral.id } })).voidedAt).not.toBeNull()
  })

  it("should pull access to FREE and pause codes when the admin asks", async () => {
    const admin = await createSuperAdmin()
    const user = await createUser()
    await giveSubscription(user.id, "PRO")
    await prisma.qRCode.create({ data: { userId: user.id, name: "c", slug: `rf${Date.now()}`, type: "URL", category: "DYNAMIC", isActive: true, content: { create: { data: { url: "https://x.com" } } } } })
    const inv = await paidInvoice(user.id, 79900)

    await request(app).post(`/admin-api/payments/${inv.id}/refund`).set("Authorization", `Bearer ${admin.token}`)
      .send({ amountPaise: 79900, reason: "chargeback", revokeAccess: true }).expect(200)

    const sub = await prisma.subscription.findUniqueOrThrow({ where: { userId: user.id }, include: { plan: true } })
    expect(sub.plan.name).toBe("FREE")
    expect(await prisma.qRCode.count({ where: { userId: user.id, isActive: true } })).toBe(0)
    expect(await prisma.qRCode.count({ where: { userId: user.id, pausedForBilling: true } })).toBe(1)
  })

  it("should refuse a refund from a non-super-admin", async () => {
    const admin = await createAdmin()
    const user = await createUser()
    const inv = await paidInvoice(user.id, 79900)
    await request(app).post(`/admin-api/payments/${inv.id}/refund`).set("Authorization", `Bearer ${admin.token}`).send({ amountPaise: 100, reason: "x" }).expect(403)
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).refundedAmount).toBe(0)
  })
})

describe("reconciliation sweep (no webhook needed)", () => {
  /** Stubs Cashfree's list-refunds call per order id; records which orders were asked. */
  function stubOrderRefunds(byOrder: Record<string, unknown[] | "error">) {
    const asked: string[] = []
    vi.stubGlobal("fetch", async (input: string | URL | Request) => {
      const url = String(input)
      const m = url.match(/\/orders\/([^/]+)\/refunds$/)
      if (m) {
        const orderId = decodeURIComponent(m[1]!)
        asked.push(orderId)
        const r = byOrder[orderId]
        if (r === "error") return new Response(JSON.stringify({ message: "boom" }), { status: 500 })
        return new Response(JSON.stringify(r ?? []), { status: 200, headers: { "Content-Type": "application/json" } })
      }
      return new Response("{}", { status: 200 })
    })
    return asked
  }
  const refund = (orderId: string, cfId: string, rupees: number, status = "SUCCESS") =>
    ({ cf_refund_id: cfId, refund_id: `r_${cfId}`, order_id: orderId, refund_amount: rupees, refund_status: status })

  it("should record a refund made in the Cashfree dashboard, once, and skip pending ones", async () => {
    const user = await createUser()
    const inv = await paidInvoice(user.id, 79900)
    const id = inv.cashfreeOrderId!
    stubOrderRefunds({ [id]: [refund(id, "cf_a", 200), refund(id, "cf_b", 100, "PENDING")] })

    expect((await reconcileRefunds()).recorded).toBe(1)
    let after = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })
    expect(after.refundedAmount).toBe(20000)
    expect(after.refundCheckedAt).not.toBeNull()

    // Next run: the same refund is not counted again.
    await reconcileRefunds()
    after = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })
    expect(after.refundedAmount, "REAL BUG: a refund was recorded twice").toBe(20000)
    expect(await prisma.refund.count({ where: { invoiceId: inv.id } })).toBe(1)
  })

  it("should not ask about free grants, old orders or fully refunded invoices", async () => {
    const user = await createUser()
    const recent = await paidInvoice(user.id, 79900)
    const old = await paidInvoice(user.id, 79900)
    await prisma.invoice.update({ where: { id: old.id }, data: { createdAt: new Date(Date.now() - 90 * 86_400_000) } })
    const full = await paidInvoice(user.id, 79900)
    await prisma.invoice.update({ where: { id: full.id }, data: { refundedAmount: 79900 } })
    const free = await paidInvoice(user.id, 0)
    await prisma.invoice.update({ where: { id: free.id }, data: { cashfreeOrderId: `genxqr_free_${Date.now()}` } })

    const asked = stubOrderRefunds({})
    await reconcileRefunds()
    expect(asked).toEqual([recent.cashfreeOrderId])
  })

  it("should carry on past an order Cashfree errors on", async () => {
    const user = await createUser()
    const bad = await paidInvoice(user.id, 79900)
    const good = await paidInvoice(user.id, 79900)
    const gid = good.cashfreeOrderId!
    stubOrderRefunds({ [bad.cashfreeOrderId!]: "error", [gid]: [refund(gid, "cf_g", 799)] })

    await reconcileRefunds()
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: good.id } })).refundedAmount).toBe(79900)
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: bad.id } })).refundCheckedAt, "a failing order is still stamped so it cannot block the queue").not.toBeNull()
  })
})
