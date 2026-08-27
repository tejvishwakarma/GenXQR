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
    async function publicQR(): Promise<{ branding: { mode: string }; status: number }> {
      const created = await request(app)
        .post("/api/qr")
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ name: "landing", type: "URL", content: { data: { url: "https://example.com" } } })
        .expect(201)

      const res = await request(app).get(`/api/public/qr/${created.body.data.slug}`)
      return { branding: res.body?.data?.branding, status: res.status }
    }

    it("should show GenXQR branding for a plan without whiteLabel", async () => {
      await giveSubscription(owner.id, "PRO")
      const { status, branding } = await publicQR()
      expect(status).toBe(200)
      expect(branding.mode).toBe("genxqr")
    })

    /**
     * whiteLabel alone is not enough — the account must also have said who it is.
     * The alternative would be an anonymous page, and an anonymous page asking
     * for a password is what Search Console called deceptive.
     */
    it("should still show GenXQR when whiteLabel is on but no brand name is set", async () => {
      await giveSubscription(owner.id, "BUSINESS")
      const { branding } = await publicQR()
      expect(branding.mode).toBe("genxqr")
    })

    it("should show the customer's brand once configured on a whiteLabel plan", async () => {
      await giveSubscription(owner.id, "BUSINESS")
      await prisma.user.update({
        where: { id: owner.id },
        data: { brandName: "Acme Corp", brandLogoUrl: "/uploads/qr-files/acme.png" },
      })
      const { branding } = await publicQR() as { branding: { mode: string; name: string; logoUrl: string } }
      expect(branding.mode).toBe("custom")
      expect(branding.name).toBe("Acme Corp")
      expect(branding.logoUrl).toBe("/uploads/qr-files/acme.png")
    })

    /**
     * A downgrade must stop the branding being USED without destroying what the
     * customer typed, so re-subscribing restores it rather than asking them to
     * enter it again.
     */
    it("should stop honouring branding after a downgrade, without deleting it", async () => {
      await giveSubscription(owner.id, "BUSINESS")
      await prisma.user.update({ where: { id: owner.id }, data: { brandName: "Acme Corp" } })
      expect((await publicQR()).branding.mode).toBe("custom")

      await giveSubscription(owner.id, "PRO")
      expect((await publicQR()).branding.mode, "PRO has no whiteLabel").toBe("genxqr")

      const still = await prisma.user.findUniqueOrThrow({
        where: { id: owner.id },
        select: { brandName: true },
      })
      expect(still.brandName, "the customer's data must survive a downgrade").toBe("Acme Corp")
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
      expect(res.body.data.branding.mode, "no subscription means no whiteLabel").toBe("genxqr")

      const count = await prisma.subscription.count({ where: { userId: owner.id } })
      expect(count, "a public page view must not write to the database").toBe(0)
    })
  })

  /**
   * The branding API and the public endpoint the scan-facing pages call.
   *
   * The password gate and the expired notice cannot use /api/public/qr/:slug —
   * that endpoint 404s for password-protected and inactive codes on purpose, so
   * it never leaks a protected destination. /api/public/branding/:slug answers
   * the narrower question those pages actually have.
   */
  describe("branding API", () => {
    it("should refuse to save branding on a plan without whiteLabel", async () => {
      const user = await createUser()
      await giveSubscription(user.id, "PRO")

      const res = await request(app)
        .patch("/api/branding")
        .set("Authorization", `Bearer ${user.token}`)
        .send({ brandName: "Acme Corp" })
      expect(res.status).toBe(403)

      const row = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { brandName: true },
      })
      expect(row.brandName, "a 403 must not write").toBeNull()
    })

    it("should save branding on a plan with whiteLabel", async () => {
      const user = await createUser()
      await giveSubscription(user.id, "BUSINESS")

      const res = await request(app)
        .patch("/api/branding")
        .set("Authorization", `Bearer ${user.token}`)
        .send({ brandName: "Acme Corp", brandLogoUrl: "/uploads/qr-files/logo.png" })
        .expect(200)

      expect(res.body.data.brandName).toBe("Acme Corp")
      expect(res.body.data.whiteLabelEnabled).toBe(true)
    })

    /**
     * brandLogoUrl is written straight into an <img src> on a public page, so a
     * javascript: or data: URL here is stored XSS against every visitor who
     * scans the customer's code.
     */
    it("should reject a logo URL that is not an upload or https", async () => {
      const user = await createUser()
      await giveSubscription(user.id, "BUSINESS")

      for (const bad of ["javascript:alert(1)", "data:text/html;base64,PHN2Zz4=", "http://insecure.test/x.png"]) {
        const res = await request(app)
          .patch("/api/branding")
          .set("Authorization", `Bearer ${user.token}`)
          .send({ brandName: "Acme", brandLogoUrl: bad })
        expect(res.status, `${bad} must be rejected`).toBe(422)
      }
    })

    it("should let a customer read their branding even without the plan feature", async () => {
      const user = await createUser()
      await giveSubscription(user.id, "PRO")

      const res = await request(app)
        .get("/api/branding")
        .set("Authorization", `Bearer ${user.token}`)
        .expect(200)

      // The dashboard needs this to render the upgrade prompt rather than a 403.
      expect(res.body.data.whiteLabelEnabled).toBe(false)
    })

    it("should require authentication", async () => {
      await request(app).get("/api/branding").expect(401)
      await request(app).patch("/api/branding").send({ brandName: "x" }).expect(401)
    })
  })

  describe("public branding endpoint", () => {
    async function brandingFor(slug: string) {
      const res = await request(app).get(`/api/public/branding/${slug}`).expect(200)
      return res.body.data as { mode: string; name: string | null; logoUrl: string | null }
    }

    async function makeQR(user: TestUser, extra: Record<string, unknown> = {}) {
      const res = await request(app)
        .post("/api/qr")
        .set("Authorization", `Bearer ${user.token}`)
        .send({ name: "q", type: "URL", content: { data: { url: "https://example.com" } }, ...extra })
        .expect(201)
      return res.body.data.slug as string
    }

    it("should return the customer's brand for a white-label owner", async () => {
      const user = await createUser()
      await giveSubscription(user.id, "BUSINESS")
      await prisma.user.update({ where: { id: user.id }, data: { brandName: "Acme Corp" } })
      expect((await brandingFor(await makeQR(user))).name).toBe("Acme Corp")
    })

    /**
     * The whole reason this endpoint exists: the password gate must be able to
     * say who is asking, and /api/public/qr/:slug deliberately 404s for
     * password-protected codes so it cannot leak the destination.
     */
    it("should serve branding for a password-protected QR, which /qr/:slug will not", async () => {
      const user = await createUser()
      await giveSubscription(user.id, "BUSINESS")
      await prisma.user.update({ where: { id: user.id }, data: { brandName: "Acme Corp" } })

      const slug = await makeQR(user, { settings: { password: "s3cret" } })

      await request(app).get(`/api/public/qr/${slug}`).expect(404)
      expect((await brandingFor(slug)).name, "the gate still needs an identity").toBe("Acme Corp")
    })

    it("should fall back to GenXQR for an unknown slug rather than 404", async () => {
      // A 404 here would also make the endpoint an oracle for which slugs exist.
      expect((await brandingFor("nosuchslug")).mode).toBe("genxqr")
    })

    it("should never expose the owner's identity or plan", async () => {
      const user = await createUser()
      await giveSubscription(user.id, "BUSINESS")
      await prisma.user.update({ where: { id: user.id }, data: { brandName: "Acme Corp" } })

      const res = await request(app).get(`/api/public/branding/${await makeQR(user)}`).expect(200)
      const body = JSON.stringify(res.body)
      expect(body).not.toContain("BUSINESS")
      expect(body).not.toContain(user.id)
      expect(body).not.toContain(user.email)
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
