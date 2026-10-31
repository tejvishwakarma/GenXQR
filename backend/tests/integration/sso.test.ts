import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import request from "supertest"
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from "jose"
import app from "../../src/app.js"
import { env } from "../../src/config/env.js"
import { prisma } from "../../src/db/prisma.js"
import { handleGoogleOAuth } from "../../src/services/auth.service.js"
import { _setKeySetForTests } from "../../src/services/oidc.service.js"
import { _setTxtResolverForTests } from "../../src/services/sso.service.js"
import { getOrCreateOwnedTeam } from "../../src/services/team.service.js"
import { hashToken, generateSecureToken } from "../../src/utils/crypto.js"
import { createSuperAdmin, createUser, giveSubscription, seedPlans } from "../helpers/factories.js"

/**
 * Single sign-on (31 Oct 2026). Google and Microsoft are stubbed at their token
 * endpoints and ID tokens are signed with a test key, so everything GenXQR
 * decides — who may sign in, to which account, joining which team, and who is
 * forced to use SSO — runs for real.
 */

const GOOGLE_ID = "google-client.apps.example"
const MS_ID = "11111111-2222-3333-4444-555555555555"
const TENANT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
const OTHER_TENANT = "ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee"

let signingKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"]
let strangerKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"]
/** The ID token the stubbed provider hands back next (nonce/aud/iss filled in). */
let nextClaims: Record<string, unknown> = {}
let nextKey: "trusted" | "stranger" = "trusted"
let txt: Record<string, string[][]> = {}
let seq = 0

const domainFor = () => `acme${++seq}${Date.now().toString(36)}.example`

function setEnv(on: boolean) {
  const e = env as Record<string, unknown>
  e.GOOGLE_CLIENT_ID = on ? GOOGLE_ID : undefined
  e.GOOGLE_CLIENT_SECRET = on ? "g-secret" : undefined
  e.MICROSOFT_CLIENT_ID = on ? MS_ID : undefined
  e.MICROSOFT_CLIENT_SECRET = on ? "m-secret" : undefined
}

async function idToken(provider: "google" | "microsoft", nonce: string) {
  const tid = (nextClaims.tid as string | undefined) ?? TENANT
  return new SignJWT({ nonce, ...nextClaims })
    .setProtectedHeader({ alg: "RS256", kid: nextKey === "trusted" ? "test" : "other" })
    .setIssuer(provider === "google" ? "https://accounts.google.com" : `https://login.microsoftonline.com/${tid}/v2.0`)
    .setAudience(provider === "google" ? GOOGLE_ID : MS_ID)
    .setSubject(`sub-${seq}`)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(nextKey === "trusted" ? signingKey : strangerKey)
}

let lastNonce = ""
function stubProviders() {
  const real = globalThis.fetch
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const provider = url.includes("googleapis.com") ? "google" : url.includes("microsoftonline.com") ? "microsoft" : null
    if (!provider) return real(input, init)
    return new Response(JSON.stringify({ id_token: await idToken(provider, lastNonce) }), { status: 200, headers: { "Content-Type": "application/json" } })
  })
}

/** Follows the provider round trip; returns the callback's redirect target. */
async function roundTrip(startUrl: string, cookie: string, provider: "google" | "microsoft", opts: { cookieState?: string } = {}) {
  const u = new URL(startUrl)
  const state = u.searchParams.get("state")!
  lastNonce = u.searchParams.get("nonce")!
  const cb = await request(app)
    .get(`/api/auth/sso/callback/${provider}?code=abc&state=${state}`)
    .set("Cookie", `sso_state=${opts.cookieState ?? state}`)
  expect(cb.status, cb.text).toBe(302)
  return { location: cb.headers.location as string, setCookie: cb.headers["set-cookie"], state, cookie }
}

async function ssoLogin(email: string, provider: "google" | "microsoft", claims: Record<string, unknown>) {
  nextClaims = claims
  const start = await request(app).post("/api/auth/sso/start").send({ email })
  if (start.status !== 200) return { status: start.status, body: start.body, location: "" }
  const cookie = (start.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("sso_state="))!
  const r = await roundTrip(start.body.data.url, cookie, provider)
  return { status: 200, body: start.body, location: r.location }
}

/** A Business owner with a ready connection for a fresh domain. */
async function ownerWithConnection(provider: "google" | "microsoft", opts: { defaultRole?: "EDITOR" | "VIEWER"; plan?: "BUSINESS" | "PRO" } = {}) {
  const domain = domainFor()
  const owner = await createUser({ email: `boss@${domain}` })
  await giveSubscription(owner.id, opts.plan ?? "BUSINESS")
  const saved = await request(app).put("/api/sso").set("Authorization", `Bearer ${owner.token}`)
    .send({ domain, provider, defaultRole: opts.defaultRole ?? "EDITOR" })
  expect(saved.status, JSON.stringify(saved.body)).toBe(200)
  txt[`_genxqr.${domain}`] = [[saved.body.data.dns.value]]
  const verified = await request(app).post("/api/sso/verify").set("Authorization", `Bearer ${owner.token}`)
  expect(verified.status, JSON.stringify(verified.body)).toBe(200)
  if (provider === "microsoft") {
    const link = await request(app).post("/api/sso/link").set("Authorization", `Bearer ${owner.token}`)
    expect(link.status, JSON.stringify(link.body)).toBe(200)
    nextClaims = { email: `boss@${domain}`, tid: TENANT, oid: "owner-oid" }
    const r = await roundTrip(link.body.data.url, "", "microsoft")
    expect(r.location).toContain("/app/sso?linked=1")
  }
  return { owner, domain }
}

const expectLoginError = (location: string, code: string) => expect(new URL(location).searchParams.get("error")).toBe(code)

describe("single sign-on", () => {
  beforeAll(async () => {
    await seedPlans()
    const a = await generateKeyPair("RS256"); signingKey = a.privateKey
    const b = await generateKeyPair("RS256"); strangerKey = b.privateKey
    const jwk: JWK = { ...(await exportJWK(a.publicKey)), kid: "test", alg: "RS256" }
    // The stranger's key is NOT published: a token it signs must fail.
    _setKeySetForTests(createLocalJWKSet({ keys: [jwk] }))
    _setTxtResolverForTests(async (name) => {
      const r = txt[name]
      if (!r) throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" })
      return r
    })
  })
  beforeEach(() => { setEnv(true); stubProviders(); nextKey = "trusted" })
  afterEach(() => { vi.unstubAllGlobals(); setEnv(false) })
  afterAll(() => { _setKeySetForTests(null); _setTxtResolverForTests(null) })

  describe("Google Workspace", () => {
    it("should create the account and add it to the owner's team with the default role", async () => {
      const { owner, domain } = await ownerWithConnection("google", { defaultRole: "EDITOR" })
      const r = await ssoLogin(`ana@${domain}`, "google", { email: `ana@${domain}`, email_verified: true, hd: domain, name: "Ana" })
      const code = new URL(r.location).searchParams.get("oauth_code")
      expect(code, r.location).toBeTruthy()
      const ex = await request(app).post("/api/auth/oauth-token").send({ code })
      expect(ex.status).toBe(200)
      const ana = await prisma.user.findUniqueOrThrow({ where: { email: `ana@${domain}` } })
      expect(ana.emailVerified).toBe(true)
      expect(ana.passwordHash).toBeNull()
      const team = await prisma.team.findFirstOrThrow({ where: { ownerId: owner.id } })
      const m = await prisma.teamMember.findFirstOrThrow({ where: { teamId: team.id, userId: ana.id } })
      expect(m.role).toBe("EDITOR")
    })

    it("should refuse an account Google does not place in that Workspace", async () => {
      const { domain } = await ownerWithConnection("google")
      const r = await ssoLogin(`eve@${domain}`, "google", { email: `eve@${domain}`, email_verified: true, hd: null })
      expectLoginError(r.location, "sso_wrong_account")
      expect(await prisma.user.count({ where: { email: `eve@${domain}` } })).toBe(0)
    })

    it("should refuse an address outside the domain even from the same Workspace", async () => {
      const { domain } = await ownerWithConnection("google")
      const r = await ssoLogin(`ana@${domain}`, "google", { email: "ana@elsewhere.example", email_verified: true, hd: domain })
      expectLoginError(r.location, "sso_wrong_account")
    })

    it("should refuse a token not signed by the provider, or for another sign-in", async () => {
      const { domain } = await ownerWithConnection("google")
      nextKey = "stranger"
      const forged = await ssoLogin(`ana@${domain}`, "google", { email: `ana@${domain}`, email_verified: true, hd: domain })
      expectLoginError(forged.location, "sso_failed")
      nextKey = "trusted"
      const wrongNonce = await ssoLogin(`ana@${domain}`, "google", { email: `ana@${domain}`, email_verified: true, hd: domain, nonce: "replayed" })
      expectLoginError(wrongNonce.location, "sso_failed")
      expect(await prisma.user.count({ where: { email: `ana@${domain}` } })).toBe(0)
    })

    it("should only accept the browser that started it, once", async () => {
      const { domain } = await ownerWithConnection("google")
      nextClaims = { email: `ana@${domain}`, email_verified: true, hd: domain }
      const start = await request(app).post("/api/auth/sso/start").send({ email: `ana@${domain}` }).expect(200)
      const other = await roundTrip(start.body.data.url, "", "google", { cookieState: "someone-else" })
      expectLoginError(other.location, "sso_state")
      const first = await roundTrip(start.body.data.url, "", "google")
      expect(first.location).toContain("oauth_code=")
      const replay = await roundTrip(start.body.data.url, "", "google")
      expectLoginError(replay.location, "sso_state")
    })

    it("should say when a domain has no SSO", async () => {
      expect((await request(app).post("/api/auth/sso/start").send({ email: "x@nosso.example" })).status).toBe(404)
    })
  })

  describe("Microsoft Entra ID", () => {
    it("should sign in only people from the linked directory", async () => {
      const { domain } = await ownerWithConnection("microsoft")
      const outsider = await ssoLogin(`bob@${domain}`, "microsoft", { email: `bob@${domain}`, tid: OTHER_TENANT, oid: "o1" })
      expectLoginError(outsider.location, "sso_wrong_account")
      const insider = await ssoLogin(`bob@${domain}`, "microsoft", { email: `bob@${domain}`, tid: TENANT, oid: "o2" })
      expect(insider.location).toContain("oauth_code=")
    })

    it("should not link a directory whose account is outside the domain", async () => {
      const domain = domainFor()
      const owner = await createUser({ email: `boss@${domain}` })
      await giveSubscription(owner.id, "BUSINESS")
      const saved = await request(app).put("/api/sso").set("Authorization", `Bearer ${owner.token}`).send({ domain, provider: "microsoft" }).expect(200)
      txt[`_genxqr.${domain}`] = [[saved.body.data.dns.value]]
      await request(app).post("/api/sso/verify").set("Authorization", `Bearer ${owner.token}`).expect(200)
      const link = await request(app).post("/api/sso/link").set("Authorization", `Bearer ${owner.token}`).expect(200)
      nextClaims = { email: "admin@attacker.example", tid: OTHER_TENANT }
      const r = await roundTrip(link.body.data.url, "", "microsoft")
      expect(r.location).toContain("/app/sso?error=sso_link_wrong_account")
      expect((await prisma.ssoConnection.findUniqueOrThrow({ where: { ownerId: owner.id } })).tenantId).toBeNull()
      // ...and until it is linked, nobody can sign in with it.
      expect((await request(app).post("/api/auth/sso/start").send({ email: `x@${domain}` })).status).toBe(404)
    })
  })

  describe("domain ownership", () => {
    it("should need the TXT record, and one verified owner per domain", async () => {
      const domain = domainFor()
      const a = await createUser(); await giveSubscription(a.id, "BUSINESS")
      const b = await createUser(); await giveSubscription(b.id, "BUSINESS")
      const savedA = await request(app).put("/api/sso").set("Authorization", `Bearer ${a.token}`).send({ domain, provider: "google" }).expect(200)
      const savedB = await request(app).put("/api/sso").set("Authorization", `Bearer ${b.token}`).send({ domain, provider: "google" }).expect(200)
      expect((await request(app).post("/api/sso/verify").set("Authorization", `Bearer ${a.token}`)).status).toBe(422)
      txt[`_genxqr.${domain}`] = [[savedA.body.data.dns.value], [savedB.body.data.dns.value]]
      expect((await request(app).post("/api/sso/verify").set("Authorization", `Bearer ${a.token}`)).status).toBe(200)
      expect((await request(app).post("/api/sso/verify").set("Authorization", `Bearer ${b.token}`)).status).toBe(409)
    })

    it("should be a Business feature, and stop working when the plan does", async () => {
      const pro = await createUser(); await giveSubscription(pro.id, "PRO")
      expect((await request(app).put("/api/sso").set("Authorization", `Bearer ${pro.token}`).send({ domain: domainFor(), provider: "google" })).status).toBe(403)

      const { owner, domain } = await ownerWithConnection("google")
      await giveSubscription(owner.id, "PRO")
      expect((await request(app).post("/api/auth/sso/start").send({ email: `ana@${domain}` })).status).toBe(404)
    })

    it("should not be changed by GenXQR staff impersonating the owner", async () => {
      const admin = await createSuperAdmin()
      const owner = await createUser(); await giveSubscription(owner.id, "BUSINESS")
      const imp = await request(app).post(`/admin-api/users/${owner.id}/impersonate`).set("Authorization", `Bearer ${admin.token}`).expect(200)
      const res = await request(app).put("/api/sso").set("Authorization", `Bearer ${imp.body.data.token}`).send({ domain: domainFor(), provider: "google" })
      expect(res.status).toBe(403)
    })
  })

  describe("joining the team", () => {
    it("should use a pending invite's role and count no extra seat", async () => {
      const { owner, domain } = await ownerWithConnection("google", { defaultRole: "VIEWER" })
      const team = await getOrCreateOwnedTeam(owner.id)
      const invite = await prisma.teamInvite.create({ data: { teamId: team.id, email: `cara@${domain}`, token: hashToken(generateSecureToken()), invitedBy: owner.id, role: "ADMIN" } })
      const r = await ssoLogin(`cara@${domain}`, "google", { email: `cara@${domain}`, email_verified: true, hd: domain })
      expect(r.location).toContain("oauth_code=")
      const cara = await prisma.user.findUniqueOrThrow({ where: { email: `cara@${domain}` } })
      expect((await prisma.teamMember.findFirstOrThrow({ where: { teamId: team.id, userId: cara.id } })).role).toBe("ADMIN")
      expect((await prisma.teamInvite.findUniqueOrThrow({ where: { id: invite.id } })).acceptedAt).not.toBeNull()
    })

    it("should not create an account when the team has no free seat", async () => {
      const { owner, domain } = await ownerWithConnection("google")
      const team = await getOrCreateOwnedTeam(owner.id)
      // Business = 20 seats including the owner.
      const fillers = await Promise.all(Array.from({ length: 19 }, () => createUser()))
      await prisma.teamMember.createMany({ data: fillers.map((f) => ({ teamId: team.id, userId: f.id, role: "VIEWER" as const })) })
      const r = await ssoLogin(`late@${domain}`, "google", { email: `late@${domain}`, email_verified: true, hd: domain })
      expectLoginError(r.location, "sso_no_seat")
      expect(await prisma.user.count({ where: { email: `late@${domain}` } })).toBe(0)
    })

    it("should take over an address someone registered without proving it", async () => {
      const { domain } = await ownerWithConnection("google")
      const squatter = await createUser({ email: `dan@${domain}`, emailVerified: false })
      const r = await ssoLogin(`dan@${domain}`, "google", { email: `dan@${domain}`, email_verified: true, hd: domain })
      expect(r.location).toContain("oauth_code=")
      const dan = await prisma.user.findUniqueOrThrow({ where: { id: squatter.id } })
      expect(dan.passwordHash).toBeNull()
      expect(dan.emailVerified).toBe(true)
    })
  })

  describe("require SSO", () => {
    it("should stop password sign-in, reset links and other Google sign-ins for the domain, but not the owner", async () => {
      const { owner, domain } = await ownerWithConnection("google")
      const member = await createUser({ email: `eli@${domain}` })
      const login = () => request(app).post("/api/auth/login").send({ email: member.email, password: member.password })
      expect((await login()).status).toBe(200)

      const stale = generateSecureToken()
      await prisma.passwordResetToken.create({ data: { userId: member.id, tokenHash: hashToken(stale), expiresAt: new Date(Date.now() + 3600_000) } })
      const sessionsBefore = await prisma.refreshToken.count({ where: { userId: member.id, revokedAt: null } })
      expect(sessionsBefore).toBeGreaterThan(0)

      const on = await request(app).put("/api/sso/enforce").set("Authorization", `Bearer ${owner.token}`).send({ enforced: true })
      expect(on.status, JSON.stringify(on.body)).toBe(200)
      expect(await prisma.refreshToken.count({ where: { userId: member.id, revokedAt: null } })).toBe(0)

      const refused = await login()
      expect(refused.status).toBe(403)
      expect(refused.body.error).toBe("sso_required")
      // The owner keeps the password as the way back in.
      expect((await request(app).post("/api/auth/login").send({ email: owner.email, password: owner.password })).status).toBe(200)

      expect((await request(app).post("/api/auth/reset-password").send({ token: stale, password: "NewPass123!x" })).status).toBe(403)
      await request(app).post("/api/auth/forgot-password").send({ email: member.email }).expect(200)
      await new Promise((r) => setTimeout(r, 300))
      // No new link was made (making one would also have expired the stale one).
      expect(await prisma.passwordResetToken.count({ where: { userId: member.id } })).toBe(1)
      expect((await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: member.id } })).expiresAt.getTime()).toBeGreaterThan(Date.now())

      await expect(handleGoogleOAuth({ id: `g-${seq}`, email: member.email, name: "Eli", hostedDomain: null }, "127.0.0.1")).rejects.toThrow("sso_required")
      // That domain's own Google Workspace sign-in is SSO by another door.
      await expect(handleGoogleOAuth({ id: `g2-${seq}`, email: member.email, name: "Eli", hostedDomain: domain }, "127.0.0.1")).resolves.toBeTruthy()

      // Downgraded: the requirement lapses with the feature, so nobody is locked out.
      await giveSubscription(owner.id, "PRO")
      expect((await login()).status).toBe(200)
    })

    it("should not be switched on before SSO works", async () => {
      const owner = await createUser(); await giveSubscription(owner.id, "BUSINESS")
      await request(app).put("/api/sso").set("Authorization", `Bearer ${owner.token}`).send({ domain: domainFor(), provider: "google" }).expect(200)
      expect((await request(app).put("/api/sso/enforce").set("Authorization", `Bearer ${owner.token}`).send({ enforced: true })).status).toBe(409)
    })
  })
})
