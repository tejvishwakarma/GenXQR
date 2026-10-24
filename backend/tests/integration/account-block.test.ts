import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { invalidateBlocklistCache } from "../../src/services/blocklist.service.js"
import { createApiKey } from "../../src/services/apikeys.service.js"
import { createUser, giveSubscription, seedPlans } from "../helpers/factories.js"

/**
 * A blocked account (decided 24 Oct 2026): a "user" or "email" block used to
 * stop only the account's scans — its owner kept signing in, editing
 * destinations and using the API.
 */
async function block(type: "user" | "email", value: string) {
  await prisma.blocklist.create({ data: { type, value, isActive: true, reason: "test" } })
  await invalidateBlocklistCache()
}

function refreshCookie(res: request.Response): string {
  return ([] as string[]).concat(res.headers["set-cookie"] ?? []).find((c) => c.startsWith("refresh_token="))!.split(";")[0]!
}

describe("blocked accounts", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should stop sign-in, the current session, refresh and API keys", async () => {
    const user = await createUser()
    await giveSubscription(user.id, "PRO")
    const login = await request(app).post("/api/auth/login").send({ email: user.email, password: user.password }).expect(200)
    const cookie = refreshCookie(login)
    const { rawKey } = await createApiKey(user.id, "k")

    await block("user", user.id)

    expect((await request(app).post("/api/auth/login").send({ email: user.email, password: user.password })).status).toBe(403)
    expect((await request(app).get("/api/auth/me").set("Authorization", `Bearer ${user.token}`)).status).toBe(403)
    expect((await request(app).post("/api/auth/refresh").set("Cookie", cookie)).status).toBe(403)
    expect((await request(app).get("/v1/qr").set("Authorization", `Bearer ${rawKey}`)).status).toBe(403)
  })

  it("should apply an email block the same way, whatever its letter case", async () => {
    const user = await createUser()
    await block("email", user.email.toUpperCase())
    expect((await request(app).post("/api/auth/login").send({ email: user.email, password: user.password })).status).toBe(403)
  })

  it("should let the account back in once unblocked", async () => {
    const user = await createUser()
    await block("user", user.id)
    await prisma.blocklist.updateMany({ where: { value: user.id }, data: { isActive: false } })
    await invalidateBlocklistCache()
    await request(app).get("/api/auth/me").set("Authorization", `Bearer ${user.token}`).expect(200)
  })
})
