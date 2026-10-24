import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { createSuperAdmin, createUser, seedPlans, type TestUser } from "../helpers/factories.js"

/**
 * Refresh-token rotation (security audit, 23 Oct 2026). A rotated refresh token
 * presented again used to just get a 401 — a stolen copy used first kept a
 * 30-day session while the real user was silently logged out, and two
 * concurrent refreshes both succeeded. Now a replay after a 30 s grace (two
 * tabs refreshing together is normal) ends every session.
 */

function refreshCookie(res: request.Response): string {
  const raw = ([] as string[]).concat(res.headers["set-cookie"] ?? []).find((c) => c.startsWith("refresh_token="))
  if (!raw) throw new Error("no refresh cookie")
  return raw.split(";")[0]!
}

async function login(user: TestUser) {
  const res = await request(app).post("/api/auth/login").send({ email: user.email, password: user.password }).expect(200)
  return refreshCookie(res)
}

const refresh = (cookie: string) => request(app).post("/api/auth/refresh").set("Cookie", cookie)

describe("session refresh", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should rotate the token and accept the new one", async () => {
    const user = await createUser()
    const first = await login(user)
    const res = await refresh(first).expect(200)
    await refresh(refreshCookie(res)).expect(200)
  })

  it("should tolerate two tabs refreshing with the same cookie at once", async () => {
    const user = await createUser()
    const cookie = await login(user)
    await refresh(cookie).expect(200)
    await refresh(cookie).expect(200) // the second tab, within the grace
  })

  it("should end every session when a rotated token is replayed later", async () => {
    const user = await createUser()
    const stolen = await login(user)
    const current = refreshCookie(await refresh(stolen).expect(200))
    // The rotation happened over 30 s ago.
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, rotatedAt: { not: null } },
      data: { rotatedAt: new Date(Date.now() - 60_000) },
    })

    await refresh(stolen).expect(401)
    await refresh(current).expect(401) // the newest session was ended too
  })

  it("should refuse a logged-out token without ending other sessions", async () => {
    const user = await createUser()
    const loggedOut = await login(user)
    const other = await login(user)
    await request(app).post("/api/auth/logout").set("Cookie", loggedOut).expect(200)
    await prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: { not: null } }, data: { revokedAt: new Date(Date.now() - 60_000) } })

    await refresh(loggedOut).expect(401)
    await refresh(other).expect(200)
  })

  describe("admin set-password", () => {
    it("should end the user's existing sessions", async () => {
      const admin = await createSuperAdmin()
      const user = await createUser()
      const cookie = await login(user)
      await request(app).post(`/admin-api/users/${user.id}/password`).set("Authorization", `Bearer ${admin.token}`)
        .send({ password: "BrandNewPass123!" }).expect(200)
      await refresh(cookie).expect(401)
    })

    it("should refuse to set another admin's password", async () => {
      const admin = await createSuperAdmin()
      const other = await createSuperAdmin()
      const res = await request(app).post(`/admin-api/users/${other.id}/password`).set("Authorization", `Bearer ${admin.token}`)
        .send({ password: "BrandNewPass123!" })
      expect(res.status).toBe(403)
    })
  })
})
