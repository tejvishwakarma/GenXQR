import { createHash, randomBytes } from "node:crypto"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { mcpResourceUrl, sweepOAuth } from "../../src/services/oauth.service.js"
import { createUser, giveSubscription, seedPlans, type TestUser } from "../helpers/factories.js"

/**
 * "Sign in with GenXQR" for AI apps (8 Nov 2026): OAuth 2.1 with dynamic
 * client registration and PKCE in front of /v1/mcp — the flow claude.ai and
 * ChatGPT connectors run. Every guard here is one an attacker would probe.
 */
const REDIRECT = "https://claude.ai/api/mcp/auth_callback"
const as = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` })
const pkce = () => {
  const verifier = randomBytes(32).toString("base64url")
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") }
}

function register(redirectUris = [REDIRECT]) {
  return request(app).post("/v1/oauth/register").send({
    client_name: "Claude", redirect_uris: redirectUris, token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
  })
}

/** Runs authorize → consent → code for `user`; returns the code and verifier. */
async function authorize(clientId: string, user: TestUser, opts: { approve?: boolean; resource?: string } = {}) {
  const { verifier, challenge } = pkce()
  const res = await request(app).get("/v1/oauth/authorize").query({
    response_type: "code", client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge,
    code_challenge_method: "S256", state: "st-123", scope: "mcp", resource: opts.resource ?? mcpResourceUrl().href,
  })
  expect(res.status, res.text).toBe(302)
  const requestId = new URL(res.headers["location"]!).searchParams.get("request")!
  expect(requestId, res.headers["location"]).toBeTruthy()
  const answer = await request(app).post(`/api/oauth/requests/${requestId}`).set(as(user)).send({ approve: opts.approve ?? true })
  return { answer, verifier, requestId, code: answer.status === 200 ? new URL(answer.body.data.redirect).searchParams.get("code") : null }
}

const token = (body: Record<string, string>) => request(app).post("/v1/oauth/token").type("form").send(body)
const mcp = (accessToken: string) => request(app).post("/v1/mcp")
  .set("Authorization", `Bearer ${accessToken}`).set("Accept", "application/json, text/event-stream")
  .send({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })

async function proUser() {
  const user = await createUser()
  await giveSubscription(user.id, "PRO")
  return user
}

describe("MCP OAuth", () => {
  beforeAll(async () => {
    await seedPlans()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("should advertise how to sign in, and point an unauthenticated MCP call at it", async () => {
    const as = await request(app).get("/.well-known/oauth-authorization-server").expect(200)
    expect(as.body.code_challenge_methods_supported).toEqual(["S256"])
    expect(as.body.registration_endpoint).toMatch(/\/v1\/oauth\/register$/)
    const prm = await request(app).get("/.well-known/oauth-protected-resource/v1/mcp").expect(200)
    expect(prm.body.resource).toBe(mcpResourceUrl().href)
    expect(prm.body.authorization_servers).toEqual([as.body.issuer])

    const res = await request(app).post("/v1/mcp").send({ jsonrpc: "2.0", id: 1, method: "tools/list" })
    expect(res.status).toBe(401)
    expect(res.headers["www-authenticate"]).toContain('resource_metadata="')
    expect(res.headers["www-authenticate"]).toContain("/.well-known/oauth-protected-resource/v1/mcp")
  })

  it("should refuse redirect URIs a browser would run or read locally", async () => {
    await register(["javascript:alert(1)"]).expect(400)
    await register(["http://evil.example/cb"]).expect(400)
    await register(["https://ok.example/cb#frag"]).expect(400)
    await register(["http://127.0.0.1:33418/callback"]).expect(201)
    await register(["cursor://anysphere.cursor-retrieval/oauth/callback"]).expect(201)
  })

  it("should run the whole flow: register, consent, code with PKCE, MCP, refresh, disconnect", async () => {
    const user = await proUser()
    const client = (await register().expect(201)).body as { client_id: string }

    // A redirect URI the client did not register is refused before anything else.
    await request(app).get("/v1/oauth/authorize").query({
      response_type: "code", client_id: client.client_id, redirect_uri: "https://evil.example/cb", code_challenge: pkce().challenge, code_challenge_method: "S256",
    }).expect(400)

    const describe = await (async () => {
      const { challenge } = pkce()
      const r = await request(app).get("/v1/oauth/authorize").query({ response_type: "code", client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256" })
      const id = new URL(r.headers["location"]!).searchParams.get("request")!
      return (await request(app).get(`/api/oauth/requests/${id}`).set(as(user)).expect(200)).body.data
    })()
    expect(describe).toMatchObject({ clientName: "Claude", redirectHost: "claude.ai", planAllows: true })

    const { answer, verifier, requestId, code } = await authorize(client.client_id, user)
    expect(answer.status, answer.text).toBe(200)
    expect(new URL(answer.body.data.redirect).searchParams.get("state")).toBe("st-123")
    await request(app).post(`/api/oauth/requests/${requestId}`).set(as(user)).send({ approve: true }).expect(404) // used up

    // PKCE: the wrong verifier fails; the code is still there for the right one, which uses it up.
    await token({ grant_type: "authorization_code", client_id: client.client_id, code: code!, code_verifier: pkce().verifier, redirect_uri: REDIRECT }).expect(400)
    const tokens = await token({ grant_type: "authorization_code", client_id: client.client_id, code: code!, code_verifier: verifier, redirect_uri: REDIRECT })
    expect(tokens.status, tokens.text).toBe(200)
    expect(tokens.body.access_token).toMatch(/^gxqr_oat_/)
    await token({ grant_type: "authorization_code", client_id: client.client_id, code: code!, code_verifier: verifier, redirect_uri: REDIRECT }).expect(400)

    // The access token works on MCP — and nowhere else on /v1.
    expect((await mcp(tokens.body.access_token)).status).toBe(200)
    await request(app).get("/v1/qr").set("Authorization", `Bearer ${tokens.body.access_token}`).expect(401)
    // Not stored as given.
    expect(await prisma.oAuthToken.count({ where: { accessHash: tokens.body.access_token } })).toBe(0)

    // Refresh rotates: the new pair works, the old access token does not.
    const refreshed = await token({ grant_type: "refresh_token", client_id: client.client_id, refresh_token: tokens.body.refresh_token })
    expect(refreshed.status, refreshed.text).toBe(200)
    expect((await mcp(tokens.body.access_token)).status).toBe(401)
    expect((await mcp(refreshed.body.access_token)).status).toBe(200)

    // The app is listed, and disconnecting it ends its tokens.
    const list = await request(app).get("/api/oauth/connections").set(as(user)).expect(200)
    expect(list.body.data).toEqual([expect.objectContaining({ clientId: client.client_id, name: "Claude" })])
    await request(app).delete(`/api/oauth/connections/${client.client_id}`).set(as(user)).expect(200)
    expect((await mcp(refreshed.body.access_token)).status).toBe(401)
    await token({ grant_type: "refresh_token", client_id: client.client_id, refresh_token: refreshed.body.refresh_token }).expect(400)
  })

  it("should end the connection when a rotated refresh token is replayed later (a stolen copy)", async () => {
    const user = await proUser()
    const client = (await register().expect(201)).body as { client_id: string }
    const { code, verifier } = await authorize(client.client_id, user)
    const first = (await token({ grant_type: "authorization_code", client_id: client.client_id, code: code!, code_verifier: verifier, redirect_uri: REDIRECT }).expect(200)).body
    const second = (await token({ grant_type: "refresh_token", client_id: client.client_id, refresh_token: first.refresh_token }).expect(200)).body

    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 60_000 })
    await token({ grant_type: "refresh_token", client_id: client.client_id, refresh_token: first.refresh_token }).expect(400)
    vi.useRealTimers()
    expect((await mcp(second.access_token)).status).toBe(401)
  })

  it("should not let another app redeem a code, nor issue tokens for another server", async () => {
    const user = await proUser()
    const client = (await register().expect(201)).body as { client_id: string }
    const thief = (await register().expect(201)).body as { client_id: string }
    const { code, verifier } = await authorize(client.client_id, user)
    await token({ grant_type: "authorization_code", client_id: thief.client_id, code: code!, code_verifier: verifier, redirect_uri: REDIRECT }).expect(400)

    const { verifier: v2, challenge } = pkce()
    const res = await request(app).get("/v1/oauth/authorize").query({
      response_type: "code", client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256",
      state: "s", resource: "https://evil.example/mcp",
    })
    expect(res.status).toBe(302)
    expect(new URL(res.headers["location"]!).searchParams.get("error")).toBe("invalid_target")
    void v2
  })

  it("should need API access on the plan, at consent and at every use", async () => {
    const starter = await createUser()
    await giveSubscription(starter.id, "STARTER")
    const client = (await register().expect(201)).body as { client_id: string }
    const { answer } = await authorize(client.client_id, starter)
    expect(answer.status).toBe(403)

    const pro = await proUser()
    const { code, verifier } = await authorize(client.client_id, pro)
    const t = (await token({ grant_type: "authorization_code", client_id: client.client_id, code: code!, code_verifier: verifier, redirect_uri: REDIRECT }).expect(200)).body
    expect((await mcp(t.access_token)).status).toBe(200)
    await giveSubscription(pro.id, "STARTER")
    expect((await mcp(t.access_token)).status).toBe(403)
  })

  it("should drop registered apps that never connected after a day, keeping connected ones", async () => {
    const user = await proUser()
    const idle = (await register().expect(201)).body as { client_id: string }
    const used = (await register().expect(201)).body as { client_id: string }
    const { code, verifier } = await authorize(used.client_id, user)
    await token({ grant_type: "authorization_code", client_id: used.client_id, code: code!, code_verifier: verifier, redirect_uri: REDIRECT }).expect(200)
    const old = new Date(Date.now() - 2 * 86_400_000)
    await prisma.oAuthClient.updateMany({ where: { id: { in: [idle.client_id, used.client_id] } }, data: { createdAt: old } })
    await sweepOAuth()
    expect(await prisma.oAuthClient.findUnique({ where: { id: idle.client_id } })).toBeNull()
    expect(await prisma.oAuthClient.findUnique({ where: { id: used.client_id } })).not.toBeNull()
  })

  it("should send the app away empty-handed when the person declines", async () => {
    const user = await proUser()
    const client = (await register().expect(201)).body as { client_id: string }
    const { answer } = await authorize(client.client_id, user, { approve: false })
    expect(answer.status).toBe(200)
    const back = new URL(answer.body.data.redirect)
    expect(back.searchParams.get("error")).toBe("access_denied")
    expect(back.searchParams.get("code")).toBeNull()
  })
})
