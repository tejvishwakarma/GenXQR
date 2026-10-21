import crypto from "node:crypto"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { REFERRAL_HOLD_DAYS, REFERRAL_REWARD_PERCENT } from "../../src/services/referral.service.js"
import { createAdmin, createUser, seedPlans, type TestUser } from "../helpers/factories.js"

/**
 * Referral programme (decided 21 Oct 2026): a new account signed up through a
 * referral link qualifies on its FIRST paid purchase; the referee and the
 * referrer then each get 20% of what was ACTUALLY paid as GenXQR credit,
 * usable 15 days later. Credit is spent automatically at checkout.
 *
 * The money paths are what these protect: no reward without a real payment,
 * no second reward, no credit spent twice, and nothing a client sends deciding
 * an amount.
 */

const TEST_SECRET = "test_secret_key"
const PRO_MONTHLY_PAISE = 79900
const STARTER_MONTHLY_PAISE = 29900
const reward = (paidPaise: number) => Math.floor((paidPaise * REFERRAL_REWARD_PERCENT) / 100)

/** Signs up through the API, the way a visitor with a referral link does. */
async function signUp(email: string, referralCode?: string) {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name: "Friend", email, password: "TestPass123!", ...(referralCode ? { referralCode } : {}) })
  expect(res.status, JSON.stringify(res.body)).toBe(201)
  return prisma.user.findUniqueOrThrow({ where: { email } })
}

async function codeFor(user: TestUser): Promise<string> {
  const res = await request(app).get("/api/referrals/me").set("Authorization", `Bearer ${user.token}`).expect(200)
  return res.body.data.code as string
}

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

/** Stubs Cashfree Get Order: a PAID order with these tags and amount. */
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

let orderCounter = 0
async function pay(userId: string, amountPaise: number, extraTags: Record<string, string> = {}, planName = "PRO") {
  orderCounter += 1
  const orderId = `genxqr_ref_${Date.now()}_${orderCounter}`
  stubPaidOrder(orderId, amountPaise, { userId, planName, billingCycle: "monthly", expectedPaise: String(amountPaise), ...extraTags })
  const res = await signedWebhook(orderId)
  expect(res.status).toBe(200)
  vi.unstubAllGlobals()
  return orderId
}

async function balance(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, role: true } })
  const { signAccessToken } = await import("../../src/utils/jwt.js")
  const token = signAccessToken({ sub: user.id, email: user.email, role: user.role })
  const res = await request(app).get("/api/billing/credit").set("Authorization", `Bearer ${token}`).expect(200)
  return res.body.data as { availablePaise: number; pendingPaise: number; nextAvailableAt: string | null }
}

/** Ends the hold now, as if REFERRAL_HOLD_DAYS had passed. */
async function endHold(referralId: string) {
  const past = new Date(Date.now() - 1000)
  await prisma.referral.update({ where: { id: referralId }, data: { availableAt: past } })
  await prisma.creditEntry.updateMany({ where: { referralId }, data: { availableAt: past } })
}

describe("referrals", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("sign-up", () => {
    it("should record who referred a new account", async () => {
      const referrer = await createUser()
      const friend = await signUp(`friend.${Date.now()}@test.local`, await codeFor(referrer))
      const referral = await prisma.referral.findUnique({ where: { refereeId: friend.id } })
      expect(referral?.referrerId).toBe(referrer.id)
    })

    it("should accept the code in any letter case", async () => {
      const referrer = await createUser()
      const friend = await signUp(`case.${Date.now()}@test.local`, (await codeFor(referrer)).toLowerCase())
      expect(await prisma.referral.count({ where: { refereeId: friend.id } })).toBe(1)
    })

    it("should still sign up, with no referral, for an unknown code", async () => {
      const friend = await signUp(`unknown.${Date.now()}@test.local`, "NOSUCHCODE")
      expect(await prisma.referral.count({ where: { refereeId: friend.id } })).toBe(0)
    })

    it("should refuse a self-referral through an alias of the same inbox", async () => {
      const stamp = Date.now()
      const referrerEmail = `self.${stamp}@gmail.com`
      const referrerUser = await signUp(referrerEmail)
      const { signAccessToken } = await import("../../src/utils/jwt.js")
      const token = signAccessToken({ sub: referrerUser.id, email: referrerEmail, role: "USER" })
      const code = (await request(app).get("/api/referrals/me").set("Authorization", `Bearer ${token}`)).body.data.code
      const alias = await signUp(`self.${stamp}+again@gmail.com`, code)
      expect(await prisma.referral.count({ where: { refereeId: alias.id } })).toBe(0)
    })

    it("should give each user one stable code", async () => {
      const user = await createUser()
      const first = await codeFor(user)
      expect(first).toMatch(/^[A-Z2-9]{8}$/)
      expect(await codeFor(user)).toBe(first)
    })

    it("should let one referrer refer many people", async () => {
      const referrer = await createUser()
      const code = await codeFor(referrer)
      const stamp = Date.now()
      for (const n of [1, 2, 3]) await signUp(`many${n}.${stamp}@gmail.com`, code)
      expect(await prisma.referral.count({ where: { referrerId: referrer.id } })).toBe(3)
    })

    it("should not record the same person twice through an alias of their inbox", async () => {
      const referrer = await createUser()
      const code = await codeFor(referrer)
      const stamp = Date.now()
      await signUp(`twice.${stamp}@gmail.com`, code)
      const alias = await signUp(`t.wice.${stamp}+2@gmail.com`, code)
      expect(await prisma.referral.count({ where: { refereeId: alias.id } })).toBe(0)
      expect(await prisma.referral.count({ where: { referrerId: referrer.id } })).toBe(1)
    })

    it("should not record the same person again after they delete and re-create their account", async () => {
      const referrer = await createUser()
      const code = await codeFor(referrer)
      const email = `again.${Date.now()}@test.local`
      const first = await signUp(email, code)
      const { deleteUserAndData } = await import("../../src/services/account-erasure.service.js")
      await deleteUserAndData(first.id)

      const second = await signUp(email, code)
      expect(await prisma.referral.count({ where: { refereeId: second.id } })).toBe(0)
      // The original row stays, without the deleted account, and the referrer sees it as such.
      const res = await request(app).get("/api/referrals/me").set("Authorization", `Bearer ${referrer.token}`).expect(200)
      expect(res.body.data.referrals).toHaveLength(1)
      expect(res.body.data.referrals[0].friend).toBe("Deleted account")
    })

    it("should record only one of two simultaneous sign-ups by the same person", async () => {
      const referrer = await createUser()
      const code = await codeFor(referrer)
      const stamp = Date.now()
      await Promise.all([signUp(`race.${stamp}+a@gmail.com`, code), signUp(`race.${stamp}+b@gmail.com`, code)])
      expect(await prisma.referral.count({ where: { referrerId: referrer.id } })).toBe(1)
    })
  })

  describe("rewards", () => {
    it(`should give both people ${REFERRAL_REWARD_PERCENT}% of the friend's first payment, held for ${REFERRAL_HOLD_DAYS} days`, async () => {
      const referrer = await createUser()
      const friend = await signUp(`paid.${Date.now()}@test.local`, await codeFor(referrer))

      const orderId = await pay(friend.id, PRO_MONTHLY_PAISE)

      const referral = await prisma.referral.findUniqueOrThrow({ where: { refereeId: friend.id } })
      expect(referral.qualifyingOrderId).toBe(orderId)
      expect(referral.rewardPaise).toBe(reward(PRO_MONTHLY_PAISE))
      const heldFor = referral.availableAt!.getTime() - referral.qualifiedAt!.getTime()
      expect(heldFor).toBe(REFERRAL_HOLD_DAYS * 24 * 60 * 60 * 1000)

      // Held: earned but not spendable yet.
      for (const id of [referrer.id, friend.id]) {
        const b = await balance(id)
        expect(b.availablePaise).toBe(0)
        expect(b.pendingPaise).toBe(reward(PRO_MONTHLY_PAISE))
      }

      await endHold(referral.id)
      for (const id of [referrer.id, friend.id]) {
        expect((await balance(id)).availablePaise).toBe(reward(PRO_MONTHLY_PAISE))
      }
    })

    it("should base the reward on what was actually paid after a coupon", async () => {
      const referrer = await createUser()
      const friend = await signUp(`coupon.${Date.now()}@test.local`, await codeFor(referrer))
      const coupon = await prisma.coupon.create({ data: { code: `REF${Date.now()}`, discountType: "PERCENTAGE", discountValue: 50 } })
      const paid = PRO_MONTHLY_PAISE - Math.floor(PRO_MONTHLY_PAISE / 2)

      await pay(friend.id, paid, { couponCode: coupon.code, couponId: coupon.id })

      const referral = await prisma.referral.findUniqueOrThrow({ where: { refereeId: friend.id } })
      expect(referral.qualifyingAmountPaise).toBe(paid)
      expect(referral.rewardPaise).toBe(reward(paid))
    })

    it("should reward only the FIRST paid purchase", async () => {
      const referrer = await createUser()
      const friend = await signUp(`twice.${Date.now()}@test.local`, await codeFor(referrer))

      await pay(friend.id, STARTER_MONTHLY_PAISE, {}, "STARTER")
      await pay(friend.id, PRO_MONTHLY_PAISE)

      const rewards = await prisma.creditEntry.findMany({ where: { kind: "REFERRAL_REWARD", userId: { in: [referrer.id, friend.id] } } })
      expect(rewards).toHaveLength(2)
      expect(rewards.every((r) => r.amountPaise === reward(STARTER_MONTHLY_PAISE))).toBe(true)
    })

    it("should reward nothing for a purchase that was free", async () => {
      const referrer = await createUser()
      const friend = await signUp(`free.${Date.now()}@test.local`, await codeFor(referrer))
      const coupon = await prisma.coupon.create({ data: { code: `FREE${Date.now()}`, discountType: "PERCENTAGE", discountValue: 100 } })
      const { signAccessToken } = await import("../../src/utils/jwt.js")
      const token = signAccessToken({ sub: friend.id, email: friend.email, role: "USER" })
      vi.stubGlobal("fetch", async () => { throw new Error("must not call Cashfree") })

      const res = await request(app).post("/api/billing/create-order").set("Authorization", `Bearer ${token}`)
        .send({ planName: "PRO", billingCycle: "monthly", couponCode: coupon.code })
      expect(res.body.data.free).toBe(true)

      const referral = await prisma.referral.findUniqueOrThrow({ where: { refereeId: friend.id } })
      expect(referral.qualifiedAt).toBeNull()
      expect(await prisma.creditEntry.count({ where: { referralId: referral.id } })).toBe(0)
    })

    it("should not count a replayed payment notification twice", async () => {
      const referrer = await createUser()
      const friend = await signUp(`replay.${Date.now()}@test.local`, await codeFor(referrer))
      const orderId = await pay(friend.id, PRO_MONTHLY_PAISE)

      stubPaidOrder(orderId, PRO_MONTHLY_PAISE, { userId: friend.id, planName: "PRO", billingCycle: "monthly", expectedPaise: String(PRO_MONTHLY_PAISE) })
      await signedWebhook(orderId)

      expect(await prisma.creditEntry.count({ where: { kind: "REFERRAL_REWARD", userId: { in: [referrer.id, friend.id] } } })).toBe(2)
    })

    it("should void both rewards when an admin cancels the referral", async () => {
      const referrer = await createUser()
      const friend = await signUp(`cancel.${Date.now()}@test.local`, await codeFor(referrer))
      await pay(friend.id, PRO_MONTHLY_PAISE)
      const referral = await prisma.referral.findUniqueOrThrow({ where: { refereeId: friend.id } })
      const admin = await createAdmin()

      await request(app)
        .post(`/admin-api/referrals/${referral.id}/cancel`)
        .set("Authorization", `Bearer ${admin.token}`)
        .send({ reason: "Qualifying purchase refunded" })
        .expect(200)

      await endHold(referral.id)
      for (const id of [referrer.id, friend.id]) {
        const b = await balance(id)
        expect(b.availablePaise).toBe(0)
        expect(b.pendingPaise).toBe(0)
      }
    })
  })

  describe("spending credit", () => {
    /** A user with `paise` of available credit (an admin adjustment, for brevity). */
    async function userWithCredit(paise: number) {
      const user = await createUser()
      await prisma.creditEntry.create({ data: { userId: user.id, amountPaise: paise, kind: "ADJUSTMENT", availableAt: new Date(Date.now() - 1000) } })
      return user
    }

    it("should apply available credit at checkout and charge only the rest", async () => {
      const credit = 15000
      const user = await userWithCredit(credit)
      const captured: Array<{ body: { order_amount: number; order_tags: Record<string, string> } }> = []
      vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
        if (init?.body) captured.push({ body: JSON.parse(String(init.body)) })
        return new Response(JSON.stringify({ cf_order_id: "cf", order_id: "x", order_status: "ACTIVE", order_amount: 1, order_currency: "INR", payment_session_id: "sess" }), { status: 200, headers: { "Content-Type": "application/json" } })
      })

      const quote = await request(app).post("/api/billing/quote").set("Authorization", `Bearer ${user.token}`)
        .send({ planName: "PRO", billingCycle: "monthly" }).expect(200)
      expect(quote.body.data).toMatchObject({ listPaise: PRO_MONTHLY_PAISE, creditAppliedPaise: credit, finalPaise: PRO_MONTHLY_PAISE - credit })

      await request(app).post("/api/billing/create-order").set("Authorization", `Bearer ${user.token}`)
        .send({ planName: "PRO", billingCycle: "monthly", phone: "9876543210" }).expect(200)
      expect(captured[0]!.body.order_amount).toBeCloseTo((PRO_MONTHLY_PAISE - credit) / 100, 2)
      expect(captured[0]!.body.order_tags.creditPaise).toBe(String(credit))
      expect(captured[0]!.body.order_tags.expectedPaise).toBe(String(PRO_MONTHLY_PAISE - credit))
    })

    it("should spend the credit when that order is paid, once", async () => {
      const credit = 15000
      const user = await userWithCredit(credit)
      const orderId = await pay(user.id, PRO_MONTHLY_PAISE - credit, { creditPaise: String(credit) })

      expect((await balance(user.id)).availablePaise).toBe(0)
      stubPaidOrder(orderId, PRO_MONTHLY_PAISE - credit, { userId: user.id, planName: "PRO", billingCycle: "monthly", expectedPaise: String(PRO_MONTHLY_PAISE - credit), creditPaise: String(credit) })
      await signedWebhook(orderId)
      expect((await balance(user.id)).availablePaise).toBe(0)
    })

    it("should refuse an order tag claiming more credit than the list price", async () => {
      const user = await userWithCredit(1000)
      orderCounter += 1
      const orderId = `genxqr_ref_bad_${Date.now()}_${orderCounter}`
      stubPaidOrder(orderId, 100, { userId: user.id, planName: "PRO", billingCycle: "monthly", expectedPaise: "100", creditPaise: String(PRO_MONTHLY_PAISE + 1) })
      await signedWebhook(orderId)
      expect(await prisma.invoice.count({ where: { cashfreeOrderId: orderId } })).toBe(0)
    })

    it("should grant the plan free when credit covers it all, without calling Cashfree", async () => {
      const user = await userWithCredit(PRO_MONTHLY_PAISE + 5000)
      vi.stubGlobal("fetch", async () => { throw new Error("must not call Cashfree") })

      const res = await request(app).post("/api/billing/create-order").set("Authorization", `Bearer ${user.token}`)
        .send({ planName: "PRO", billingCycle: "monthly" })
      expect(res.status).toBe(200)
      expect(res.body.data.free).toBe(true)
      expect((await balance(user.id)).availablePaise).toBe(5000)
      const sub = await prisma.subscription.findUniqueOrThrow({ where: { userId: user.id }, include: { plan: true } })
      expect(sub.plan.name).toBe("PRO")
    })

    it("should not let two free checkouts spend the same credit", async () => {
      const user = await userWithCredit(PRO_MONTHLY_PAISE)
      vi.stubGlobal("fetch", async () => { throw new Error("must not call Cashfree") })
      const order = () => request(app).post("/api/billing/create-order").set("Authorization", `Bearer ${user.token}`)
        .send({ planName: "PRO", billingCycle: "monthly" })

      const results = await Promise.all([order(), order()])
      const granted = results.filter((r) => r.status === 200 && r.body.data?.free)
      expect(granted).toHaveLength(1)
      expect((await balance(user.id)).availablePaise).toBe(0)
      expect(await prisma.creditEntry.count({ where: { userId: user.id, kind: "REDEMPTION" } })).toBe(1)
    })

    it("should show a coupon that does not apply, with the total still priced", async () => {
      const user = await userWithCredit(1000)
      const res = await request(app).post("/api/billing/quote").set("Authorization", `Bearer ${user.token}`)
        .send({ planName: "PRO", billingCycle: "monthly", couponCode: "NOPE" }).expect(200)
      expect(res.body.couponError).toBe("That coupon code is not valid.")
      expect(res.body.data).toMatchObject({ coupon: null, creditAppliedPaise: 1000, finalPaise: PRO_MONTHLY_PAISE - 1000 })
    })
  })
})
