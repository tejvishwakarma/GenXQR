import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { createUser, seedPlans, type TestUser } from "../helpers/factories.js"

/**
 * POST /api/auth/change-password.
 *
 * There was no way for a signed-in user to rotate their own password: the
 * Settings page showed a Change Password form wired to nothing, and no endpoint
 * existed. The only routes to a new password were the emailed reset flow and an
 * admin forcing one — so somebody who suspected their password was compromised
 * had to request a reset email while already signed in.
 *
 * The tests worth having here are the ones about what the endpoint refuses and
 * what it invalidates, not that a correct call returns 200.
 */
describe("POST /api/auth/change-password", () => {
  let user: TestUser
  const NEW_PASSWORD = "BrandNewPass123"

  beforeAll(async () => {
    await seedPlans()
  })

  beforeEach(async () => {
    user = await createUser()
  })

  const change = (body: Record<string, unknown>, token = user.token) =>
    request(app).post("/api/auth/change-password").set("Authorization", `Bearer ${token}`).send(body)

  describe("authentication and input", () => {
    it("should reject an unauthenticated request", async () => {
      const res = await request(app)
        .post("/api/auth/change-password")
        .send({ currentPassword: user.password, newPassword: NEW_PASSWORD })
      expect(res.status).toBe(401)
    })

    it("should reject a wrong current password", async () => {
      const res = await change({ currentPassword: "NotMyPassword1", newPassword: NEW_PASSWORD })
      expect(res.status).toBe(403)
      expect(res.body.error).toMatch(/current password is incorrect/i)
    })

    it("should reject a new password that fails the complexity rules", async () => {
      const res = await change({ currentPassword: user.password, newPassword: "alllowercase" })
      expect(res.status).toBe(422)
    })

    it("should reject a new password shorter than 8 characters", async () => {
      const res = await change({ currentPassword: user.password, newPassword: "Ab1" })
      expect(res.status).toBe(422)
    })

    /**
     * A no-op would otherwise revoke every other session and send a "your
     * password changed" security email for a password that did not change.
     */
    it("should reject reusing the current password as the new one", async () => {
      const res = await change({ currentPassword: user.password, newPassword: user.password })
      expect(res.status).toBe(422)
      expect(res.body.error).toMatch(/different/i)
    })

    it("should not change the password when the request is rejected", async () => {
      await change({ currentPassword: "NotMyPassword1", newPassword: NEW_PASSWORD }).expect(403)

      // The original must still work.
      const login = await request(app)
        .post("/api/auth/login")
        .send({ email: user.email, password: user.password })
      expect(login.status).toBe(200)
    })
  })

  describe("a successful change", () => {
    it("should let the user sign in with the new password and not the old", async () => {
      await change({ currentPassword: user.password, newPassword: NEW_PASSWORD }).expect(200)

      const withNew = await request(app)
        .post("/api/auth/login")
        .send({ email: user.email, password: NEW_PASSWORD })
      expect(withNew.status, "the new password should work").toBe(200)

      const withOld = await request(app)
        .post("/api/auth/login")
        .send({ email: user.email, password: user.password })
      expect(withOld.status, "the old password must stop working").toBe(401)
    })

    /**
     * The reason to change a password is often that somebody else has it.
     * Leaving their session alive would defeat the exercise entirely.
     */
    it("should revoke every refresh token the account had", async () => {
      const login = await request(app)
        .post("/api/auth/login")
        .send({ email: user.email, password: user.password })
        .expect(200)
      const oldCookie = login.headers["set-cookie"] as unknown as string[]

      const live = await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } })
      expect(live, "the login above should have created one").toBeGreaterThan(0)

      await change({ currentPassword: user.password, newPassword: NEW_PASSWORD }).expect(200)

      // The pre-existing session's cookie must no longer buy a new access token.
      const refreshed = await request(app).post("/api/auth/refresh").set("Cookie", oldCookie)
      expect(refreshed.status, "the other device's session must be dead").toBe(401)
    })

    /**
     * ...but signing the user out of the tab they just used to change it reads as
     * a failure, so the response carries a working replacement pair.
     */
    it("should keep the calling session alive with a fresh token pair", async () => {
      const res = await change({ currentPassword: user.password, newPassword: NEW_PASSWORD }).expect(200)

      expect(res.body.data.accessToken, "a replacement access token is required").toBeTruthy()

      const setCookie = (res.headers["set-cookie"] ?? []) as unknown as string[]
      expect(setCookie.join(";"), "a replacement refresh cookie is required").toContain("refresh_token")

      // The new access token must actually authenticate.
      const me = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${res.body.data.accessToken}`)
      expect(me.status).toBe(200)

      // And the new refresh cookie must still be exchangeable.
      const refreshed = await request(app).post("/api/auth/refresh").set("Cookie", setCookie)
      expect(refreshed.status, "the caller's own new cookie must survive the revocation").toBe(200)
    })

    it("should write an audit entry", async () => {
      await change({ currentPassword: user.password, newPassword: NEW_PASSWORD }).expect(200)

      // Written fire-and-forget, so give it a moment to land.
      let entry = null
      for (let i = 0; i < 40 && !entry; i++) {
        entry = await prisma.auditLog.findFirst({
          where: { userId: user.id, action: "auth.password.change" },
        })
        if (!entry) await new Promise((r) => setTimeout(r, 25))
      }
      expect(entry, "a password change must be auditable").not.toBeNull()
    })
  })

  /**
   * Google sign-in accounts have no passwordHash. Running verifyPassword against
   * null would report "current password is incorrect", which is both untrue and
   * unactionable — there is no password to get right.
   */
  describe("an account with no password", () => {
    it("should explain that the account signs in with Google", async () => {
      const oauthUser = await createUser()
      await prisma.user.update({ where: { id: oauthUser.id }, data: { passwordHash: null } })

      const res = await change(
        { currentPassword: "anything at all", newPassword: NEW_PASSWORD },
        oauthUser.token,
      )
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/google/i)
      expect(res.body.error).toMatch(/forgot password/i)
    })
  })

  describe("account isolation", () => {
    it("should only ever change the caller's own password", async () => {
      const victim = await createUser()

      await change({ currentPassword: user.password, newPassword: NEW_PASSWORD }).expect(200)

      const victimLogin = await request(app)
        .post("/api/auth/login")
        .send({ email: victim.email, password: victim.password })
      expect(victimLogin.status, "another account must be untouched").toBe(200)
    })
  })
})
