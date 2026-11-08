import { createHash, randomBytes } from "node:crypto"
import { beforeAll, describe, expect, it, vi } from "vitest"

const notices: Array<{ userId: string; kind: string; app?: string }> = []
vi.mock("../../src/services/email.service.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../src/services/email.service.js")>()
  return { ...orig, sendSecurityNotice: vi.fn(async (userId: string, n: { kind: string; app?: string }) => { notices.push({ userId, ...n }) }) }
})

const { default: app } = await import("../../src/app.js")
const { default: request } = await import("supertest")
const { buildSecurityNoticeEmail } = await import("../../src/services/email.service.js")
const { timeStep, totpAt } = await import("../../src/utils/totp.util.js")
const { mcpResourceUrl } = await import("../../src/services/oauth.service.js")
const { createSuperAdmin, createUser, giveSubscription, seedPlans } = await import("../helpers/factories.js")
type TestUser = Awaited<ReturnType<typeof createUser>>

/**
 * Security notices (8 Nov 2026): the account's owner is emailed when two-factor
 * is turned on or off, recovery codes are remade, support resets two-factor, or
 * an AI app is connected — whoever did it, so a taken-over account is noticed.
 */
const as = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` })
const kindsFor = (id: string) => notices.filter((n) => n.userId === id).map((n) => n.kind)

async function enable2fa(user: TestUser) {
  const secret = (await request(app).post("/api/auth/2fa/setup").set(as(user)).expect(200)).body.data.secret as string
  await request(app).post("/api/auth/2fa/enable").set(as(user)).send({ code: totpAt(secret, timeStep() - 1) }).expect(200)
  return secret
}

describe("security notices", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should tell the owner when two-factor is turned on, remade or turned off", async () => {
    const user = await createUser()
    const secret = await enable2fa(user)
    await request(app).post("/api/auth/2fa/recovery-codes").set(as(user)).send({ code: totpAt(secret, timeStep()) }).expect(200)
    await request(app).post("/api/auth/2fa/disable").set(as(user)).send({ code: totpAt(secret, timeStep() + 1), password: user.password }).expect(200)
    expect(kindsFor(user.id)).toEqual(["2fa_on", "recovery_codes", "2fa_off"])
  })

  it("should tell the owner when support resets their two-factor", async () => {
    const user = await createUser()
    await enable2fa(user)
    await request(app).post(`/admin-api/users/${user.id}/reset-2fa`).set(as(await createSuperAdmin())).expect(200)
    expect(kindsFor(user.id)).toContain("2fa_reset_by_support")
  })

  it("should tell the owner which AI app was connected", async () => {
    const user = await createUser()
    await giveSubscription(user.id, "PRO")
    const redirect = "https://claude.ai/api/mcp/auth_callback"
    const client = (await request(app).post("/v1/oauth/register").send({ client_name: "Claude", redirect_uris: [redirect], token_endpoint_auth_method: "none" }).expect(201)).body
    const challenge = createHash("sha256").update(randomBytes(32).toString("base64url")).digest("base64url")
    const auth = await request(app).get("/v1/oauth/authorize").query({
      response_type: "code", client_id: client.client_id, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: "S256", resource: mcpResourceUrl().href,
    }).expect(302)
    const id = new URL(auth.headers["location"]!).searchParams.get("request")!
    await request(app).post(`/api/oauth/requests/${id}`).set(as(user)).send({ approve: true }).expect(200)
    expect(notices.filter((n) => n.userId === user.id)).toEqual([{ userId: user.id, kind: "ai_app_connected", app: "Claude" }])
  })

  it("should escape the app's name — anyone can register an app and choose it", () => {
    const html = buildSecurityNoticeEmail("Asha", { kind: "ai_app_connected", app: "<a href=\"https://evil.example\">Support</a>" })
    expect(html).not.toContain('<a href="https://evil.example"')
    expect(html).toContain("&lt;a href=")
  })
})
