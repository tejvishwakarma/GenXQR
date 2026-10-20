import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { getUserPlanLimits } from "../../src/services/billing.service.js"
import {
  enforceSubscriptionExpiry,
  isLapsed,
  resumeCodesPausedForBilling,
} from "../../src/services/subscription-expiry.service.js"
import { createQRCode, createUser, giveSubscription, seedPlans } from "../helpers/factories.js"

/**
 * Subscription expiry.
 *
 * Before this, a paid period ending changed nothing: pay for one month, keep the
 * plan forever. These pin the rule decided on 17 Oct 2026 — no grace period,
 * dynamic codes pause at lapse, payment resumes exactly the codes we paused —
 * and the guarantees that make it safe: a code the owner turned off stays off,
 * static codes are untouched, and a paused code cannot be toggled back on.
 */

const DAY = 86_400_000

async function lapsedPaidUser(planName: "STARTER" | "PRO" = "STARTER") {
  const user = await createUser()
  await giveSubscription(user.id, planName)
  await prisma.subscription.update({
    where: { userId: user.id },
    data: { currentPeriodEnd: new Date(Date.now() - 60_000) },
  })
  return user
}

const planOf = async (userId: string) =>
  (await prisma.subscription.findUniqueOrThrow({ where: { userId }, include: { plan: true } })).plan.name

const codeState = (id: string) =>
  prisma.qRCode.findUniqueOrThrow({ where: { id }, select: { isActive: true, pausedForBilling: true } })

describe("subscription expiry", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  describe("isLapsed", () => {
    const base = { status: "ACTIVE" as const, trialEndsAt: null, codesPauseAt: null, plan: { name: "PRO" } }
    const past = new Date(Date.now() - DAY)
    const future = new Date(Date.now() + DAY)

    it("should be lapsed once a paid period has ended — no grace", () => {
      expect(isLapsed({ ...base, currentPeriodEnd: past })).toBe(true)
      expect(isLapsed({ ...base, currentPeriodEnd: future })).toBe(false)
    })

    it("should use trialEndsAt for a trial", () => {
      expect(isLapsed({ ...base, status: "TRIALING", trialEndsAt: past, currentPeriodEnd: future })).toBe(true)
    })

    it("should never treat FREE as lapsed", () => {
      expect(isLapsed({ ...base, plan: { name: "FREE" }, currentPeriodEnd: past })).toBe(false)
    })

    it("should hold off while a notice date is still ahead", () => {
      expect(isLapsed({ ...base, currentPeriodEnd: past, codesPauseAt: future })).toBe(false)
      expect(isLapsed({ ...base, currentPeriodEnd: past, codesPauseAt: past })).toBe(true)
    })
  })

  describe("enforceSubscriptionExpiry", () => {
    it("should downgrade a lapsed paid plan, pause active dynamic codes, and leave the rest alone", async () => {
      const user = await lapsedPaidUser()
      const live = await createQRCode(user.id)
      const ownerOff = await createQRCode(user.id, { isActive: false })
      const staticCode = await prisma.qRCode.create({
        data: { userId: user.id, name: "Static", slug: `st${Date.now().toString(36)}`, type: "URL", category: "STATIC" },
      })

      await enforceSubscriptionExpiry()

      expect(await planOf(user.id)).toBe("FREE")
      expect(await codeState(live.id)).toEqual({ isActive: false, pausedForBilling: true })
      // Turned off by the owner: off, but NOT marked as ours to resume.
      expect(await codeState(ownerOff.id)).toEqual({ isActive: false, pausedForBilling: false })
      expect(await codeState(staticCode.id)).toEqual({ isActive: true, pausedForBilling: false })

      const emails = await prisma.renewalReminder.count({ where: { userId: user.id, reminderType: "expired" } })
      expect(emails).toBe(1)
    })

    it("should be idempotent — a second sweep sends no second email", async () => {
      const user = await lapsedPaidUser()
      await createQRCode(user.id)
      await enforceSubscriptionExpiry()
      await enforceSubscriptionExpiry()
      expect(await prisma.renewalReminder.count({ where: { userId: user.id, reminderType: "expired" } })).toBe(1)
    })

    it("should pause a lapsed trial the same way", async () => {
      const user = await createUser()
      const pro = await prisma.plan.findUniqueOrThrow({ where: { name: "PRO" } })
      const ended = new Date(Date.now() - 60_000)
      await prisma.subscription.create({
        data: { userId: user.id, planId: pro.id, status: "TRIALING", trialEndsAt: ended, currentPeriodStart: new Date(Date.now() - 14 * DAY), currentPeriodEnd: ended },
      })
      const code = await createQRCode(user.id)

      await enforceSubscriptionExpiry()

      expect(await planOf(user.id)).toBe("FREE")
      expect((await codeState(code.id)).pausedForBilling).toBe(true)
    })

    it("should not touch a plan that is still paid up", async () => {
      const user = await createUser()
      await giveSubscription(user.id, "PRO")
      const code = await createQRCode(user.id)
      await enforceSubscriptionExpiry()
      expect(await planOf(user.id)).toBe("PRO")
      expect((await codeState(code.id)).isActive).toBe(true)
    })
  })

  describe("first-run notice period", () => {
    it("should send a notice and keep codes live until the notice date, then pause", async () => {
      const user = await lapsedPaidUser()
      const code = await createQRCode(user.id)
      await prisma.subscription.update({
        where: { userId: user.id },
        data: { codesPauseAt: new Date(Date.now() + 7 * DAY) },
      })

      await enforceSubscriptionExpiry()
      expect(await planOf(user.id)).toBe("STARTER")
      expect((await codeState(code.id)).isActive).toBe(true)
      expect(await prisma.renewalReminder.count({ where: { userId: user.id, reminderType: "pause_notice" } })).toBe(1)

      await prisma.subscription.update({ where: { userId: user.id }, data: { codesPauseAt: new Date(Date.now() - 1000) } })
      await enforceSubscriptionExpiry()
      expect(await planOf(user.id)).toBe("FREE")
      expect((await codeState(code.id)).pausedForBilling).toBe(true)
    })

    it("should pause leftover codes on a FREE account once its notice runs out", async () => {
      const user = await createUser()
      await giveSubscription(user.id, "FREE")
      const code = await createQRCode(user.id)
      await prisma.subscription.update({ where: { userId: user.id }, data: { codesPauseAt: new Date(Date.now() - 1000) } })

      await enforceSubscriptionExpiry()

      expect((await codeState(code.id)).pausedForBilling).toBe(true)
      const sub = await prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } })
      expect(sub.codesPauseAt).toBeNull()
    })
  })

  describe("resuming", () => {
    it("should resume only the codes it paused", async () => {
      const user = await lapsedPaidUser()
      const live = await createQRCode(user.id)
      const ownerOff = await createQRCode(user.id, { isActive: false })
      await enforceSubscriptionExpiry()

      await resumeCodesPausedForBilling(user.id)

      expect(await codeState(live.id)).toEqual({ isActive: true, pausedForBilling: false })
      expect(await codeState(ownerOff.id)).toEqual({ isActive: false, pausedForBilling: false })
    })

    it("should resume codes in the sweep once the account has a live paid plan again", async () => {
      const user = await lapsedPaidUser()
      const code = await createQRCode(user.id)
      await enforceSubscriptionExpiry()
      expect((await codeState(code.id)).pausedForBilling).toBe(true)

      await giveSubscription(user.id, "PRO") // e.g. an admin grants a plan
      await enforceSubscriptionExpiry()

      expect(await codeState(code.id)).toEqual({ isActive: true, pausedForBilling: false })
    })
  })

  describe("request path", () => {
    it("should expire a lapsed account the moment its owner makes a request", async () => {
      const user = await lapsedPaidUser("PRO")
      const code = await createQRCode(user.id)

      const limits = await getUserPlanLimits(user.id)

      expect(limits.planName).toBe("FREE")
      expect((await codeState(code.id)).pausedForBilling).toBe(true)
    })

    it("should refuse to toggle a paused code back on", async () => {
      const user = await lapsedPaidUser()
      const code = await createQRCode(user.id)
      await enforceSubscriptionExpiry()

      const res = await request(app)
        .patch(`/api/qr/${code.id}/toggle`)
        .set("Authorization", `Bearer ${user.token}`)

      expect(res.status).toBe(403)
      expect((await codeState(code.id)).isActive).toBe(false)
    })

    it("should report paused codes on GET /api/billing/subscription", async () => {
      const user = await lapsedPaidUser()
      await createQRCode(user.id)
      await createQRCode(user.id)
      await enforceSubscriptionExpiry()

      const res = await request(app).get("/api/billing/subscription").set("Authorization", `Bearer ${user.token}`)

      expect(res.status).toBe(200)
      expect(res.body.data.pausedCodes).toBe(2)
    })
  })
})
