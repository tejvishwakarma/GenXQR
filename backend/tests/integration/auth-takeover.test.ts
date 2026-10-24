import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { handleGoogleOAuth } from "../../src/services/auth.service.js"
import { googleProfileToUser } from "../../src/routes/auth.routes.js"
import { signOAuthState, verifyOAuthState } from "../../src/utils/jwt.js"
import { createUser, seedPlans } from "../helpers/factories.js"

/**
 * Account-security fixes from the 22 Oct 2026 audit.
 *
 * 1. Pre-registration takeover. handleGoogleOAuth links a Google sign-in to an
 *    existing account by email. It used to do that to an UNVERIFIED account
 *    and keep its password: register victim@… with your own password, wait for
 *    the victim to sign in with Google and use the account, get them to click
 *    a genuine verification email — then log in as them.
 * 2. The Google Drive OAuth `state` was signed with the access-token secret and
 *    carries `sub`, so it was accepted as a 10-minute login token.
 */

describe("account takeover protections", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  describe("linking Google to an existing account", () => {
    it("should strip an unverified account's password and sessions when its inbox owner signs in with Google", async () => {
      const attacker = await createUser({ emailVerified: false, password: "AttackerPass1!" })
      const attackerSession = await prisma.refreshToken.create({
        data: { id: `rt-${Date.now()}`, userId: attacker.id, tokenHash: `x-${Date.now()}`, expiresAt: new Date(Date.now() + 864e5) },
      })
      await prisma.emailVerificationToken.create({
        data: { userId: attacker.id, tokenHash: `vt-${Date.now()}`, expiresAt: new Date(Date.now() + 864e5) },
      })

      await handleGoogleOAuth({ id: `g-${Date.now()}`, email: attacker.email, name: "Victim" }, "127.0.0.1")

      const after = await prisma.user.findUniqueOrThrow({ where: { id: attacker.id } })
      expect(after.passwordHash).toBeNull()
      expect(after.emailVerified).toBe(true)
      // The registrant's session is revoked (the Google sign-in gets its own new one).
      expect((await prisma.refreshToken.findUniqueOrThrow({ where: { id: attackerSession.id } })).revokedAt).not.toBeNull()
      expect(await prisma.emailVerificationToken.count({ where: { userId: attacker.id } })).toBe(0)

      // The registrant's password no longer opens the account.
      const login = await request(app).post("/api/auth/login").send({ email: attacker.email, password: "AttackerPass1!" })
      expect(login.status).toBe(401)
    })

    it("should keep a verified account's password when Google is linked", async () => {
      const owner = await createUser({ emailVerified: true })
      await handleGoogleOAuth({ id: `g-v-${Date.now()}`, email: owner.email, name: owner.name }, "127.0.0.1")
      const after = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })
      expect(after.passwordHash).not.toBeNull()
      expect(after.googleId).toBeTruthy()
    })

    it("should refuse a Google profile whose email Google has not verified", () => {
      const base = { id: "g1", displayName: "X", photos: [] }
      expect(() => googleProfileToUser({ ...base, emails: [{ value: "a@b.com", verified: false }] })).toThrow(/not verified/)
      expect(() => googleProfileToUser({ ...base, emails: [{ value: "a@b.com" } as never] })).toThrow(/not verified/)
      expect(googleProfileToUser({ ...base, emails: [{ value: "a@b.com", verified: true }] }).email).toBe("a@b.com")
    })
  })

  describe("Google Drive OAuth state", () => {
    it("should not be accepted as an access token", async () => {
      const user = await createUser()
      const state = signOAuthState(user.id)
      await request(app).get("/api/auth/me").set("Authorization", `Bearer ${state}`).expect(401)
      // …while still working for its own flow.
      expect(verifyOAuthState(state).sub).toBe(user.id)
    })

    it("should still accept a real access token", async () => {
      const user = await createUser()
      await request(app).get("/api/auth/me").set("Authorization", `Bearer ${user.token}`).expect(200)
    })
  })
})
