import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { PLAN_LIMITS } from "../../src/services/billing.service.js"
import { createUser, giveSubscription, seedPlans, type TestUser } from "../helpers/factories.js"

/**
 * Two plan features that were sold and never enforced.
 *
 * whiteLabel and prioritySupport were both in PLAN_LIMITS, both listed on the
 * pricing page, both in the plan-gate middleware's type union — and both checked
 * in exactly zero places. Business and Enterprise customers paid for them and
 * received what the free tier received.
 *
 * That is the failure these tests exist to prevent recurring: a flag that reads
 * as implemented because it is declared everywhere except where it matters. Each
 * test asserts the OBSERVABLE difference between a plan that has the feature and
 * one that does not, so a regression cannot hide behind the flag still existing.
 */
describe("plan features that gate behaviour", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  /**
   * Guards the premise. If someone moves whiteLabel or prioritySupport onto every
   * plan, the tests below would still pass while testing nothing — both sides of
   * each comparison would be identical.
   */
  describe("the plan matrix these tests depend on", () => {
    it("should grant whiteLabel to BUSINESS but not to PRO", () => {
      expect(PLAN_LIMITS.BUSINESS.whiteLabel).toBe(true)
      expect(PLAN_LIMITS.PRO.whiteLabel).toBe(false)
    })

    it("should grant prioritySupport to BUSINESS but not to PRO", () => {
      expect(PLAN_LIMITS.BUSINESS.prioritySupport).toBe(true)
      expect(PLAN_LIMITS.PRO.prioritySupport).toBe(false)
    })
  })

  describe("whiteLabel — landing page attribution", () => {
    let owner: TestUser

    beforeEach(async () => {
      owner = await createUser()
    })

    /** A landing-page QR, fetched the way the public /l/:slug page fetches it. */
    async function publicQR(): Promise<{ showBranding: boolean; status: number }> {
      const created = await request(app)
        .post("/api/qr")
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ name: "landing", type: "URL", content: { data: { url: "https://example.com" } } })
        .expect(201)

      const res = await request(app).get(`/api/public/qr/${created.body.data.slug}`)
      return { showBranding: res.body?.data?.showBranding, status: res.status }
    }

    it("should show branding for a plan without whiteLabel", async () => {
      await giveSubscription(owner.id, "PRO")
      const { status, showBranding } = await publicQR()
      expect(status).toBe(200)
      expect(showBranding).toBe(true)
    })

    it("should hide branding for a plan with whiteLabel", async () => {
      await giveSubscription(owner.id, "BUSINESS")
      const { status, showBranding } = await publicQR()
      expect(status).toBe(200)
      expect(showBranding, "BUSINESS pays for white-label; the badge must go").toBe(false)
    })

    /**
     * The endpoint is public and reachable by anyone holding a slug printed on a
     * poster. It must answer the rendering question without disclosing what the
     * owner pays, or who they are.
     */
    it("should not leak the owner's plan or identity", async () => {
      await giveSubscription(owner.id, "BUSINESS")
      const created = await request(app)
        .post("/api/qr")
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ name: "landing", type: "URL", content: { data: { url: "https://example.com" } } })
        .expect(201)

      const res = await request(app).get(`/api/public/qr/${created.body.data.slug}`).expect(200)
      const body = JSON.stringify(res.body)

      expect(body).not.toContain("BUSINESS")
      expect(body).not.toContain(owner.id)
      expect(body).not.toContain(owner.email)
      expect(res.body.data).not.toHaveProperty("userId")
    })

    /**
     * The lookup runs on an unauthenticated endpoint hit by every landing view.
     * If it went through getUserPlanLimits — which calls getOrCreateSubscription
     * and lazily writes a downgrade — an anonymous visitor could drive
     * subscription writes for the owner just by loading the page.
     */
    it("should not create a subscription for an owner who has none", async () => {
      // A plan is needed to create the QR at all — FREE has dynamicQRLimit 0, so
      // requireQRSlot answers 403. The subscription is removed immediately after,
      // which is the state under test: a QR whose owner has no subscription row.
      await giveSubscription(owner.id, "PRO")

      const created = await request(app)
        .post("/api/qr")
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ name: "landing", type: "URL", content: { data: { url: "https://example.com" } } })
        .expect(201)

      await prisma.subscription.deleteMany({ where: { userId: owner.id } })

      const res = await request(app).get(`/api/public/qr/${created.body.data.slug}`).expect(200)
      expect(res.body.data.showBranding, "no subscription means no whiteLabel").toBe(true)

      const count = await prisma.subscription.count({ where: { userId: owner.id } })
      expect(count, "a public page view must not write to the database").toBe(0)
    })
  })

  describe("prioritySupport — support ticket priority", () => {
    async function openTicket(user: TestUser) {
      const res = await request(app)
        .post("/api/support/tickets")
        .set("Authorization", `Bearer ${user.token}`)
        .send({
          subject: "Something is wrong",
          message: "A description long enough to satisfy the minimum length rule.",
          category: "technical",
        })
      expect(res.status, JSON.stringify(res.body)).toBe(201)
      return prisma.supportTicket.findFirstOrThrow({
        where: { userId: user.id },
        select: { priority: true },
      })
    }

    it("should open a ticket at MEDIUM for a plan without prioritySupport", async () => {
      const user = await createUser()
      await giveSubscription(user.id, "PRO")
      expect((await openTicket(user)).priority).toBe("MEDIUM")
    })

    it("should open a ticket at HIGH for a plan with prioritySupport", async () => {
      const user = await createUser()
      await giveSubscription(user.id, "BUSINESS")
      expect((await openTicket(user)).priority).toBe("HIGH")
    })

    /**
     * Ordering is the whole feature. A ticket marked HIGH that still sits below
     * older MEDIUM ones is indistinguishable, to an agent, from not having the
     * feature at all.
     */
    it("should list a later high-priority ticket above earlier normal ones", async () => {
      const admin = await createUser({ role: "ADMIN" })

      const normalA = await createUser()
      await giveSubscription(normalA.id, "PRO")
      await openTicket(normalA)

      const normalB = await createUser()
      await giveSubscription(normalB.id, "PRO")
      await openTicket(normalB)

      // Opened LAST, so createdAt alone would put it at the bottom.
      const priority = await createUser()
      await giveSubscription(priority.id, "BUSINESS")
      await openTicket(priority)

      const res = await request(app)
        .get("/admin-api/support/tickets")
        .set("Authorization", `Bearer ${admin.token}`)
        .expect(200)

      const list = res.body.data as Array<{ priority: string }>
      expect(list.length).toBeGreaterThanOrEqual(3)
      expect(list[0]!.priority, "the paying customer's ticket must be first").toBe("HIGH")
    })
  })
})
