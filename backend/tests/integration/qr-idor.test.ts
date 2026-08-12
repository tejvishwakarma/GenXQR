import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { createQRCode, createUser, giveSubscription, seedPlans, type TestUser } from "../helpers/factories.js"

/**
 * Object-level authorization on /api/qr/*.
 *
 * Every one of these endpoints takes an :id straight from the URL. The
 * ownership filter lives inside qr.service.ts as `where: { id, userId }` —
 * a single dropped `userId` in any one of them silently turns that route into
 * a full read/write handle on another tenant's QR codes, with nothing in the
 * type system to notice.
 *
 * The expected result is 404, not 403: replying 403 would confirm the id
 * exists and leak the fact that some other account owns it.
 */
describe("QR code IDOR protection", () => {
  let owner: TestUser
  let attacker: TestUser
  let victimQR: { id: string; slug: string }

  beforeAll(async () => {
    await seedPlans()
  })

  // Not beforeAll: setup.ts truncates between tests, so fixtures must be
  // recreated per test rather than created once for the file.
  const setupTwoTenants = async () => {
    owner = await createUser()
    attacker = await createUser()
    await giveSubscription(owner.id, "PRO")
    await giveSubscription(attacker.id, "PRO")
    victimQR = await createQRCode(owner.id, { name: "Victim QR" })
  }

  const asAttacker = () => `Bearer ${attacker.token}`

  describe("reads", () => {
    it("should 404 when reading another user's QR by id", async () => {
      await setupTwoTenants()

      const res = await request(app).get(`/api/qr/${victimQR.id}`).set("Authorization", asAttacker())

      expect(res.status).toBe(404)
    })

    it("should not include another user's QR in the list endpoint", async () => {
      await setupTwoTenants()

      const res = await request(app).get("/api/qr").set("Authorization", asAttacker())

      expect(res.status).toBe(200)
      const ids = (res.body.data as Array<{ id: string }>).map((q) => q.id)
      expect(ids).not.toContain(victimQR.id)
    })

    it("should 404 when reading another user's analytics", async () => {
      await setupTwoTenants()

      const res = await request(app)
        .get(`/api/analytics/qr/${victimQR.id}`)
        .set("Authorization", asAttacker())

      expect(res.status).toBe(404)
    })
  })

  describe("writes", () => {
    it("should 404 when updating another user's QR, and leave it unchanged", async () => {
      await setupTwoTenants()

      const res = await request(app)
        .put(`/api/qr/${victimQR.id}`)
        .set("Authorization", asAttacker())
        .send({ name: "Hijacked" })

      expect(res.status).toBe(404)

      const after = await prisma.qRCode.findUniqueOrThrow({ where: { id: victimQR.id } })
      expect(after.name).toBe("Victim QR")
      expect(after.userId).toBe(owner.id)
    })

    it("should 404 when toggling another user's QR, and leave it active", async () => {
      await setupTwoTenants()

      const res = await request(app)
        .patch(`/api/qr/${victimQR.id}/toggle`)
        .set("Authorization", asAttacker())

      expect(res.status).toBe(404)

      const after = await prisma.qRCode.findUniqueOrThrow({ where: { id: victimQR.id } })
      expect(after.isActive).toBe(true)
    })

    it("should 404 when deleting another user's QR, and not delete it", async () => {
      await setupTwoTenants()

      const res = await request(app)
        .delete(`/api/qr/${victimQR.id}`)
        .set("Authorization", asAttacker())

      expect(res.status).toBe(404)
      expect(await prisma.qRCode.findUnique({ where: { id: victimQR.id } })).not.toBeNull()
    })

    it("should 404 when duplicating another user's QR, and not copy it", async () => {
      await setupTwoTenants()

      const res = await request(app)
        .post(`/api/qr/${victimQR.id}/duplicate`)
        .set("Authorization", asAttacker())

      expect(res.status).toBe(404)

      // The real risk here isn't the status code — it's a copy of someone
      // else's QR (and its destination URL) landing in the attacker's account.
      const attackerQRs = await prisma.qRCode.findMany({ where: { userId: attacker.id } })
      expect(attackerQRs).toHaveLength(0)
    })
  })

  describe("owner still has access", () => {
    it("should let the owner read their own QR", async () => {
      await setupTwoTenants()

      const res = await request(app)
        .get(`/api/qr/${victimQR.id}`)
        .set("Authorization", `Bearer ${owner.token}`)

      expect(res.status).toBe(200)
      expect(res.body.data.id).toBe(victimQR.id)
    })

    it("should let the owner rename their own QR", async () => {
      await setupTwoTenants()

      const res = await request(app)
        .put(`/api/qr/${victimQR.id}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ name: "Renamed By Owner" })

      expect(res.status).toBe(200)
      const after = await prisma.qRCode.findUniqueOrThrow({ where: { id: victimQR.id } })
      expect(after.name).toBe("Renamed By Owner")
    })
  })

  describe("unauthenticated access", () => {
    it("should 401 on the QR list without a token", async () => {
      const res = await request(app).get("/api/qr")
      expect(res.status).toBe(401)
    })

    it("should 401 when reading a specific QR without a token", async () => {
      await setupTwoTenants()

      const res = await request(app).get(`/api/qr/${victimQR.id}`)

      expect(res.status).toBe(401)
    })
  })
})
