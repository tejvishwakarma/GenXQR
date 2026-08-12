import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { createAdmin, createSuperAdmin, createUser, seedPlans } from "../helpers/factories.js"

/**
 * Authorization boundaries on /admin-api/*.
 *
 * These are the invariants the manual suite in /tests/07-admin.http and
 * /tests/08-security.http describe, made executable. They also cover the
 * privilege rules that moved into admin-users.service.ts during the service-
 * layer extraction — the checks are now several call frames from the route, so
 * a future refactor could drop one without any type error to catch it.
 */
describe("admin-api authorization", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  describe("role gate on the router itself", () => {
    it("should reject an unauthenticated request with 401", async () => {
      const res = await request(app).get("/admin-api/users")
      expect(res.status).toBe(401)
    })

    it("should reject a plain USER token with 403", async () => {
      const user = await createUser()
      const res = await request(app).get("/admin-api/users").set("Authorization", `Bearer ${user.token}`)
      expect(res.status).toBe(403)
    })

    it("should reject a structurally invalid token with 401", async () => {
      const res = await request(app).get("/admin-api/users").set("Authorization", "Bearer not.a.real.jwt")
      expect(res.status).toBe(401)
    })

    it("should allow an ADMIN to read the user list", async () => {
      const admin = await createAdmin()
      const res = await request(app).get("/admin-api/users").set("Authorization", `Bearer ${admin.token}`)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data)).toBe(true)
    })
  })

  describe("SUPER_ADMIN-only actions rejected for plain ADMIN", () => {
    it("should not let an ADMIN change a user's role", async () => {
      const admin = await createAdmin()
      const target = await createUser()

      const res = await request(app)
        .patch(`/admin-api/users/${target.id}`)
        .set("Authorization", `Bearer ${admin.token}`)
        .send({ role: "SUPER_ADMIN" })

      expect(res.status).toBe(403)

      // The privilege escalation this guards against: confirm nothing changed.
      const after = await prisma.user.findUniqueOrThrow({ where: { id: target.id } })
      expect(after.role).toBe("USER")
    })

    it("should not let an ADMIN change a user's plan", async () => {
      const admin = await createAdmin()
      const target = await createUser()

      const res = await request(app)
        .patch(`/admin-api/users/${target.id}/plan`)
        .set("Authorization", `Bearer ${admin.token}`)
        .send({ planName: "ENTERPRISE" })

      expect(res.status).toBe(403)
      expect(await prisma.subscription.findUnique({ where: { userId: target.id } })).toBeNull()
    })

    it("should not let an ADMIN force-set a user's password", async () => {
      const admin = await createAdmin()
      const target = await createUser()
      const before = await prisma.user.findUniqueOrThrow({ where: { id: target.id } })

      const res = await request(app)
        .post(`/admin-api/users/${target.id}/password`)
        .set("Authorization", `Bearer ${admin.token}`)
        .send({ password: "AttackerControlled123!" })

      expect(res.status).toBe(403)
      const after = await prisma.user.findUniqueOrThrow({ where: { id: target.id } })
      expect(after.passwordHash).toBe(before.passwordHash)
    })

    it("should not let an ADMIN delete another admin", async () => {
      const admin = await createAdmin()
      const otherAdmin = await createAdmin()

      const res = await request(app)
        .delete(`/admin-api/users/${otherAdmin.id}`)
        .set("Authorization", `Bearer ${admin.token}`)

      expect(res.status).toBe(403)
      expect(await prisma.user.findUnique({ where: { id: otherAdmin.id } })).not.toBeNull()
    })

    it("should let an ADMIN delete a plain USER", async () => {
      const admin = await createAdmin()
      const target = await createUser()

      const res = await request(app)
        .delete(`/admin-api/users/${target.id}`)
        .set("Authorization", `Bearer ${admin.token}`)

      expect(res.status).toBe(200)
      expect(await prisma.user.findUnique({ where: { id: target.id } })).toBeNull()
    })
  })

  describe("self-modification guards", () => {
    it("should refuse to let an admin change their own role", async () => {
      const superAdmin = await createSuperAdmin()

      const res = await request(app)
        .patch(`/admin-api/users/${superAdmin.id}`)
        .set("Authorization", `Bearer ${superAdmin.token}`)
        .send({ role: "USER" })

      expect(res.status).toBe(400)
      const after = await prisma.user.findUniqueOrThrow({ where: { id: superAdmin.id } })
      expect(after.role).toBe("SUPER_ADMIN")
    })

    it("should refuse to let an admin delete themselves", async () => {
      const superAdmin = await createSuperAdmin()

      const res = await request(app)
        .delete(`/admin-api/users/${superAdmin.id}`)
        .set("Authorization", `Bearer ${superAdmin.token}`)

      expect(res.status).toBe(400)
      expect(await prisma.user.findUnique({ where: { id: superAdmin.id } })).not.toBeNull()
    })
  })

  /**
   * Regression coverage for the impersonation escalation fixed in 9643480:
   * the endpoint checked the *caller's* role but never the *target's*, so a
   * SUPER_ADMIN could mint a valid token for another admin and have their
   * subsequent actions attributed to that admin in the audit log.
   */
  describe("impersonation", () => {
    it("should issue a token when impersonating a plain USER", async () => {
      const superAdmin = await createSuperAdmin()
      const target = await createUser()

      const res = await request(app)
        .post(`/admin-api/users/${target.id}/impersonate`)
        .set("Authorization", `Bearer ${superAdmin.token}`)

      expect(res.status).toBe(200)
      expect(res.body.data.token).toEqual(expect.any(String))
      expect(res.body.data.expiresInSeconds).toBe(900)
    })

    it("should refuse to impersonate an ADMIN", async () => {
      const superAdmin = await createSuperAdmin()
      const targetAdmin = await createAdmin()

      const res = await request(app)
        .post(`/admin-api/users/${targetAdmin.id}/impersonate`)
        .set("Authorization", `Bearer ${superAdmin.token}`)

      expect(res.status).toBe(403)
      expect(res.body.data?.token).toBeUndefined()
    })

    it("should refuse to impersonate another SUPER_ADMIN", async () => {
      const superAdmin = await createSuperAdmin()
      const targetSuperAdmin = await createSuperAdmin()

      const res = await request(app)
        .post(`/admin-api/users/${targetSuperAdmin.id}/impersonate`)
        .set("Authorization", `Bearer ${superAdmin.token}`)

      expect(res.status).toBe(403)
      expect(res.body.data?.token).toBeUndefined()
    })

    it("should audit-log a denied admin-on-admin impersonation attempt", async () => {
      const superAdmin = await createSuperAdmin()
      const targetAdmin = await createAdmin()

      await request(app)
        .post(`/admin-api/users/${targetAdmin.id}/impersonate`)
        .set("Authorization", `Bearer ${superAdmin.token}`)

      const denial = await prisma.auditLog.findFirst({
        where: { action: "admin.user.impersonate.denied", entityId: targetAdmin.id },
      })
      expect(denial).not.toBeNull()
      expect(denial?.userId).toBe(superAdmin.id)
    })

    it("should refuse impersonation by a plain ADMIN", async () => {
      const admin = await createAdmin()
      const target = await createUser()

      const res = await request(app)
        .post(`/admin-api/users/${target.id}/impersonate`)
        .set("Authorization", `Bearer ${admin.token}`)

      expect(res.status).toBe(403)
    })
  })

  describe("not-found handling", () => {
    it("should return 404 for a user detail request with an unknown id", async () => {
      const admin = await createAdmin()
      const res = await request(app)
        .get("/admin-api/users/clnonexistentid000000000")
        .set("Authorization", `Bearer ${admin.token}`)

      expect(res.status).toBe(404)
    })
  })
})
