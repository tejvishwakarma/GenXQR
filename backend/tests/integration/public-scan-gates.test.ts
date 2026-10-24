import bcrypt from "bcryptjs"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { invalidateBlocklistCache } from "../../src/services/blocklist.service.js"
import { resumeCodesPausedForBilling } from "../../src/services/subscription-expiry.service.js"
import { createSuperAdmin, createUser, giveSubscription, seedPlans, type TestUser } from "../helpers/factories.js"

/**
 * Public scan surface (security audit, 23 Oct 2026):
 *  - /api/public/qr/:slug (the /l/<slug> page's content) checked only isActive
 *    and the password, so an expired, used-up or blocked code's content stayed
 *    readable there; links inside content and the fallbackUrl skipped the
 *    destination blocklist.
 *  - A password-protected landing-page code (PDF, vCard, WiFi…) could not be
 *    opened at all: the correct password led to the homepage.
 *  - An admin "Force deactivate" was undone by the owner's own switch.
 */

let slugN = 0
async function makeCode(owner: TestUser, data: Record<string, unknown> = {}, content: Record<string, unknown> = { title: "Free coffee", code: "SECRET-COUPON" }) {
  slugN += 1
  return prisma.qRCode.create({
    data: {
      userId: owner.id, name: "c", slug: `pg${slugN}${Date.now().toString(36)}`.slice(0, 16),
      type: "COUPON", category: "DYNAMIC", isActive: true, ...data,
      content: { create: { data: content } },
    } as never,
  })
}

const publicQR = (slug: string, query = "") => request(app).get(`/api/public/qr/${slug}${query}`)

async function block(type: "domain" | "user", value: string) {
  await prisma.blocklist.create({ data: { type, value, isActive: true, reason: "test" } })
  await invalidateBlocklistCache()
}

describe("public scan gates", () => {
  let owner: TestUser

  beforeAll(async () => {
    await seedPlans()
  })

  beforeEach(async () => {
    owner = await createUser()
    await giveSubscription(owner.id, "PRO")
  })

  describe("landing content", () => {
    it("should not serve the content of an expired code", async () => {
      const qr = await makeCode(owner, { activeUntil: new Date(Date.now() - 60_000) })
      const res = await publicQR(qr.slug).expect(200)
      expect(res.body.data).toMatchObject({ isActive: false, unavailableReason: "expired" })
      expect(JSON.stringify(res.body)).not.toContain("SECRET-COUPON")
    })

    it("should not serve the content of a code over its scan limit", async () => {
      const qr = await makeCode(owner, { scanLimit: 1, scanCount: 1 })
      expect((await publicQR(qr.slug)).body.data.unavailableReason).toBe("limit")
    })

    it("should not serve the content of a blocked owner's code", async () => {
      const qr = await makeCode(owner)
      await block("user", owner.id)
      expect((await publicQR(qr.slug)).body.data.unavailableReason).toBe("blocked")
    })

    it("should not serve content linking to a blocked domain", async () => {
      const qr = await makeCode(owner, { type: "LINKS" }, { links: [{ title: "x", url: "https://blocked-landing.example/phish" }] })
      await block("domain", "blocked-landing.example")
      expect((await publicQR(qr.slug)).body.data.unavailableReason).toBe("blocked")
    })

    it("should still serve a live code's content", async () => {
      const qr = await makeCode(owner)
      const res = await publicQR(qr.slug).expect(200)
      expect(res.body.data.content.code).toBe("SECRET-COUPON")
    })
  })

  it("should not follow a fallback URL on a blocked domain", async () => {
    const qr = await makeCode(owner, { type: "WHATSAPP", isActive: false, fallbackUrl: "https://blocked-fallback.example/x" }, { phone: "919876543210" })
    await block("domain", "blocked-fallback.example")
    const res = await request(app).get(`/r/${qr.slug}`)
    expect(res.status).toBe(302)
    expect(res.headers["location"]).not.toContain("blocked-fallback.example")
  })

  describe("password-protected landing codes", () => {
    it("should open after the correct password, and only with that proof", async () => {
      const qr = await makeCode(owner, { isPasswordProtected: true, passwordHash: await bcrypt.hash("open-sesame", 4) })
      await publicQR(qr.slug).expect(404)

      const unlock = await request(app).post(`/r/${qr.slug}/password`).send({ password: "open-sesame" }).expect(200)
      const destination = new URL(unlock.body.data.destination as string)
      expect(destination.pathname).toBe(`/l/${qr.slug}`)
      const access = destination.searchParams.get("access")
      expect(access).toBeTruthy()

      const res = await publicQR(qr.slug, `?access=${encodeURIComponent(access!)}`).expect(200)
      expect(res.body.data.content.code).toBe("SECRET-COUPON")

      // The proof is bound to its code.
      const other = await makeCode(owner, { isPasswordProtected: true, passwordHash: await bcrypt.hash("x", 4) })
      await publicQR(other.slug, `?access=${encodeURIComponent(access!)}`).expect(404)
      await publicQR(qr.slug, "?access=forged").expect(404)
    })
  })

  describe("admin takedown", () => {
    it("should stay down until an admin reactivates it", async () => {
      const admin = await createSuperAdmin()
      const qr = await makeCode(owner, { type: "WHATSAPP" }, { phone: "919876543210" })
      await request(app).get(`/r/${qr.slug}`).expect(302) // cached as live

      await request(app).patch(`/admin-api/qr-codes/${qr.id}/deactivate`).set("Authorization", `Bearer ${admin.token}`).expect(200)
      // Immediately, not after the 10-minute cache.
      expect((await request(app).get(`/r/${qr.slug}`)).headers["location"]).toContain("reason=blocked")
      // The owner cannot switch it back on…
      expect((await request(app).patch(`/api/qr/${qr.id}/toggle`).set("Authorization", `Bearer ${owner.token}`)).status).toBe(403)
      // …and neither does a renewed plan.
      await prisma.qRCode.update({ where: { id: qr.id }, data: { pausedForBilling: true } })
      await resumeCodesPausedForBilling(owner.id)
      expect((await prisma.qRCode.findUniqueOrThrow({ where: { id: qr.id } })).isActive).toBe(false)

      await request(app).patch(`/admin-api/qr-codes/${qr.id}/reactivate`).set("Authorization", `Bearer ${admin.token}`).expect(200)
      expect((await request(app).get(`/r/${qr.slug}`)).headers["location"]).toContain("wa.me")
    })
  })
})
