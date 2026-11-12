import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { handleGoogleOAuth } from "../../src/services/auth.service.js"
import { timeStep, totpAt } from "../../src/utils/totp.util.js"
import { createSuperAdmin, createAdmin, createUser, seedPlans, type TestUser } from "../helpers/factories.js"

/**
 * Two-factor sign-in (7 Nov 2026): after the password (or Google), a code from
 * an authenticator app or a one-time recovery code, before any session exists.
 */
const as = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` })
const code = (secret: string, offset = 0) => totpAt(secret, timeStep() + offset)
const login = (u: TestUser) => request(app).post("/api/auth/login").send({ email: u.email, password: u.password })
const verify = (challenge: string, c: string) => request(app).post("/api/auth/2fa/verify").send({ challenge, code: c })

/** Turns two-factor on for `user`; the setup code is the previous step's, so the current one is still unused. */
async function enable(user: TestUser) {
  const setup = await request(app).post("/api/auth/2fa/setup").set(as(user)).expect(200)
  const secret = setup.body.data.secret as string
  expect(setup.body.data.otpauthUrl).toContain(`secret=${secret}`)
  const on = await request(app).post("/api/auth/2fa/enable").set(as(user)).send({ code: code(secret, -1) })
  expect(on.status, JSON.stringify(on.body)).toBe(200)
  return { secret, recoveryCodes: on.body.data.recoveryCodes as string[] }
}

async function challengeFor(user: TestUser): Promise<string> {
  const res = await login(user).expect(200)
  expect(res.body.data.twoFactorRequired).toBe(true)
  expect(res.body.data.accessToken, "a session was issued before the code").toBeUndefined()
  expect(res.headers["set-cookie"], "a refresh cookie was set before the code").toBeUndefined()
  return res.body.data.challenge as string
}

describe("two-factor sign-in", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should compute RFC 6238 codes", () => {
    // RFC 6238 appendix B, SHA-1: secret "12345678901234567890", T = 59 s → 94287082 (last 6 digits).
    expect(totpAt("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 1)).toBe("287082")
    expect(totpAt("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", Math.floor(1111111109 / 30))).toBe("081804")
  })

  it("should hold back the session until the code, and accept each code only once", async () => {
    const user = await createUser()
    const { secret, recoveryCodes } = await enable(user)
    expect(recoveryCodes).toHaveLength(10)
    expect((await request(app).get("/api/auth/2fa").set(as(user)).expect(200)).body.data).toMatchObject({ enabled: true, recoveryCodesLeft: 10 })
    // Stored encrypted, not as the secret itself.
    const row = await prisma.user.findUnique({ where: { id: user.id }, select: { twoFactorSecret: true } })
    expect(row?.twoFactorSecret).not.toContain(secret)

    const challenge = await challengeFor(user)
    await verify(challenge, "000000").expect(422)
    const current = code(secret)
    const ok = await verify(challenge, current)
    expect(ok.status, JSON.stringify(ok.body)).toBe(200)
    expect(ok.body.data.accessToken).toBeTruthy()
    expect(String(ok.headers["set-cookie"])).toContain("refresh_token=")
    // The challenge is single-use.
    await verify(challenge, code(secret, 1)).expect(401)

    // The same code again, on a new sign-in: refused (replay).
    await verify(await challengeFor(user), current).expect(422)
  })

  it("should accept a recovery code once", async () => {
    const user = await createUser()
    const { recoveryCodes } = await enable(user)
    await verify(await challengeFor(user), recoveryCodes[0]!.toUpperCase()).expect(200)
    await verify(await challengeFor(user), recoveryCodes[0]!).expect(422)
    expect((await request(app).get("/api/auth/2fa").set(as(user)).expect(200)).body.data.recoveryCodesLeft).toBe(9)
  })

  it("should end a sign-in after five wrong codes", async () => {
    const user = await createUser()
    const { secret } = await enable(user)
    const challenge = await challengeFor(user)
    for (let i = 0; i < 4; i++) await verify(challenge, "111111").expect(422)
    await verify(challenge, "111111").expect(401)
    await verify(challenge, code(secret)).expect(401)
  })

  it("should pause the code step after ten wrong codes on the account, across sign-ins", async () => {
    // Five per challenge was the only limit: with the password, a new challenge
    // is one request away, so the six digits could be guessed in weeks.
    const user = await createUser()
    const { secret } = await enable(user)
    let wrong = 0
    for (let round = 0; round < 3 && wrong < 10; round++) {
      const challenge = await challengeFor(user)
      for (let i = 0; i < 4 && wrong < 10; i++, wrong++) {
        expect((await verify(challenge, "000000")).status, `wrong code ${wrong + 1}`).toBe(422)
      }
    }
    const fresh = await challengeFor(user)
    const res = await verify(fresh, code(secret))
    expect(res.status, "REAL BUG: the right code still works after ten wrong ones — nothing limits guesses per account").toBe(429)
    expect(res.body.data?.accessToken).toBeUndefined()
  })

  it("should not bring a used recovery code back when two are used at once", async () => {
    const user = await createUser()
    const { recoveryCodes } = await enable(user)
    const [a, b] = [await challengeFor(user), await challengeFor(user)]
    const [ra, rb] = await Promise.all([verify(a, recoveryCodes[0]!), verify(b, recoveryCodes[1]!)])
    expect([ra.status, rb.status]).toEqual([200, 200])
    const left = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { twoFactorRecoveryHashes: true } })
    expect(left.twoFactorRecoveryHashes.length, "REAL BUG: a used recovery code is back in the list").toBe(8)
  })

  it("should ask Google sign-in for the code too", async () => {
    const user = await createUser()
    await enable(user)
    const result = await handleGoogleOAuth({ id: `g-2fa-${Date.now()}`, email: user.email, name: user.name }, "127.0.0.1")
    expect("accessToken" in result, "Google sign-in skipped two-factor").toBe(false)
    expect(result).toEqual({ twoFactorUserId: user.id })
  })

  it("should need the password and a code to turn it off", async () => {
    const user = await createUser()
    const { secret } = await enable(user)
    await request(app).post("/api/auth/2fa/disable").set(as(user)).send({ code: code(secret), password: "wrong-password" }).expect(422)
    await request(app).post("/api/auth/2fa/disable").set(as(user)).send({ code: "123456", password: user.password }).expect(422)
    await request(app).post("/api/auth/2fa/disable").set(as(user)).send({ code: code(secret), password: user.password }).expect(200)
    const res = await login(user).expect(200)
    expect(res.body.data.accessToken).toBeTruthy()
  })

  it("should let only a SUPER_ADMIN reset someone's two-factor", async () => {
    const user = await createUser()
    await enable(user)
    const admin = await createAdmin()
    await request(app).post(`/admin-api/users/${user.id}/reset-2fa`).set(as(admin)).expect(403)
    const otherAdmin = await createAdmin()
    await enable(otherAdmin)
    const superAdmin = await createSuperAdmin()
    await request(app).post(`/admin-api/users/${otherAdmin.id}/reset-2fa`).set(as(superAdmin)).expect(403)
    await request(app).post(`/admin-api/users/${user.id}/reset-2fa`).set(as(superAdmin)).expect(200)
    expect((await login(user).expect(200)).body.data.accessToken).toBeTruthy()
  })
})
