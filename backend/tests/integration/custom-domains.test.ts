import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { env } from "../../src/config/env.js"
import { prisma } from "../../src/db/prisma.js"
import { _clearHostCache, normalizeHostname, scanUrlFor } from "../../src/services/custom-domain.service.js"
import { createQRCode, createUser, giveSubscription, seedPlans } from "../helpers/factories.js"

/**
 * Custom domains (31 Oct 2026): Cloudflare for SaaS is stubbed; this checks the
 * plan caps, the per-owner isolation on a customer's host, and that every scan
 * URL follows the code's domain.
 */

const CF = "api.cloudflare.com"
let cfCalls: Array<{ method: string; path: string }> = []
let cfNextStatus: "pending" | "active" = "pending"

function stubCloudflare() {
  const real = globalThis.fetch
  let seq = 0
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (!url.includes(CF)) return real(input, init)
    const method = init?.method ?? "GET"
    const path = url.split("/zones/")[1] ?? url
    cfCalls.push({ method, path })
    const body = init?.body ? JSON.parse(String(init.body)) as { hostname?: string } : {}
    const ok = (result: unknown) => new Response(JSON.stringify({ success: true, errors: [], result }), { status: 200, headers: { "Content-Type": "application/json" } })
    if (method === "POST") {
      seq += 1
      return ok({ id: `cfh_${seq}`, hostname: body.hostname, status: "pending", ssl: { status: "pending_validation" } })
    }
    if (method === "GET") {
      return ok({ id: "x", hostname: "x", status: cfNextStatus, ssl: { status: cfNextStatus === "active" ? "active" : "pending_validation" } })
    }
    return ok({ id: "deleted" })
  })
}

function setCloudflareEnv(on: boolean) {
  const e = env as Record<string, unknown>
  e.CLOUDFLARE_API_TOKEN = on ? "test-token" : undefined
  e.CLOUDFLARE_ZONE_ID = on ? "zone123" : undefined
  e.CUSTOM_DOMAIN_TARGET = on ? "customers.genxqr.com" : undefined
}

async function addDomain(token: string, hostname: string) {
  return request(app).post("/api/domains").set("Authorization", `Bearer ${token}`).send({ hostname })
}

/** A Pro user with one VERIFIED domain. */
async function ownerWithActiveDomain(hostname: string) {
  const owner = await createUser()
  await giveSubscription(owner.id, "PRO")
  const added = await addDomain(owner.token, hostname)
  expect(added.status, JSON.stringify(added.body)).toBe(201)
  cfNextStatus = "active"
  const checked = await request(app).post(`/api/domains/${added.body.data.id}/check`).set("Authorization", `Bearer ${owner.token}`)
  expect(checked.body.data.status).toBe("active")
  return { owner, domainId: added.body.data.id as string }
}

beforeAll(async () => { await seedPlans() })
beforeEach(() => { cfCalls = []; cfNextStatus = "pending"; setCloudflareEnv(true); stubCloudflare(); _clearHostCache() })
afterEach(() => { vi.unstubAllGlobals(); setCloudflareEnv(false); _clearHostCache() })

describe("hostname rules", () => {
  it("should accept a subdomain and reject apex domains, URLs with ports, IPs and junk", () => {
    expect(normalizeHostname("QR.Brand.com")).toBe("qr.brand.com")
    expect(normalizeHostname("https://qr.brand.com/some/path")).toBe("qr.brand.com")
    expect(normalizeHostname("brand.com"), "apex cannot carry a CNAME").toBeNull()
    expect(normalizeHostname("qr.brand.com:8080")).toBeNull()
    expect(normalizeHostname("10.0.0.1")).toBeNull()
    expect(normalizeHostname("-bad.brand.com")).toBeNull()
  })
})

describe("adding domains", () => {
  it("should refuse plans without custom domains", async () => {
    const u = await createUser()
    await giveSubscription(u.id, "STARTER")
    const res = await addDomain(u.token, "qr.starter-shop.com")
    expect(res.status).toBe(403)
    expect(cfCalls).toHaveLength(0)
  })

  it("should hold Pro to one domain and make the first one the default", async () => {
    const u = await createUser()
    await giveSubscription(u.id, "PRO")
    const first = await addDomain(u.token, "qr.pro-one.com")
    expect(first.status).toBe(201)
    expect(first.body.data).toMatchObject({ hostname: "qr.pro-one.com", status: "pending", isDefault: true })
    const second = await addDomain(u.token, "go.pro-one.com")
    expect(second.status, "REAL BUG: Pro went over its 1-domain cap").toBe(403)
  })

  it("should refuse our own domain and a domain another account already uses", async () => {
    const a = await createUser(); await giveSubscription(a.id, "BUSINESS")
    const b = await createUser(); await giveSubscription(b.id, "BUSINESS")
    expect((await addDomain(a.token, "qr.genxqr.com")).status).toBe(422)
    expect((await addDomain(a.token, "qr.shared-brand.com")).status).toBe(201)
    expect((await addDomain(b.token, "qr.shared-brand.com")).status).toBe(409)
  })

  it("should answer 503, and register nothing, when Cloudflare is not configured", async () => {
    setCloudflareEnv(false)
    const u = await createUser(); await giveSubscription(u.id, "PRO")
    expect((await addDomain(u.token, "qr.no-cf.com")).status).toBe(503)
    expect(await prisma.customDomain.count({ where: { userId: u.id } })).toBe(0)
  })
})

describe("codes and their scan URL", () => {
  it("should print new codes on the default verified domain, and on genxqr.com when asked", async () => {
    const { owner } = await ownerWithActiveDomain("qr.print-test.com")
    const created = await request(app).post("/api/qr").set("Authorization", `Bearer ${owner.token}`)
      .send({ name: "Menu", type: "URL", content: { data: { url: "https://example.com" } } })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    expect(created.body.data.scanUrl).toMatch(/^https:\/\/qr\.print-test\.com\/r\//)

    const plain = await request(app).post("/api/qr").set("Authorization", `Bearer ${owner.token}`)
      .send({ name: "Plain", type: "URL", customDomainId: null, content: { data: { url: "https://example.com" } } })
    expect(plain.body.data.scanUrl).toBe(`${env.FRONTEND_URL.replace(/\/$/, "")}/r/${plain.body.data.slug}`)
  })

  it("should refuse a domain that is not the account's or not verified yet", async () => {
    const { domainId } = await ownerWithActiveDomain("qr.someone-else.com")
    const other = await createUser(); await giveSubscription(other.id, "PRO")
    const res = await request(app).post("/api/qr").set("Authorization", `Bearer ${other.token}`)
      .send({ name: "Steal", type: "URL", customDomainId: domainId, content: { data: { url: "https://example.com" } } })
    expect(res.status).toBe(422)
  })

  it("scanUrlFor should only use a domain that is active", () => {
    expect(scanUrlFor({ slug: "abcd", customDomain: { hostname: "qr.x.com", status: "pending" } })).not.toContain("qr.x.com")
    expect(scanUrlFor({ slug: "abcd", customDomain: { hostname: "qr.x.com", status: "active" } })).toBe("https://qr.x.com/r/abcd")
  })
})

describe("scanning on a customer's domain", () => {
  it("should serve the owner's codes, refuse everyone else's, and keep genxqr.com serving all", async () => {
    const { owner } = await ownerWithActiveDomain("qr.isolation.com")
    const own = await createQRCode(owner.id)
    const stranger = await createUser(); await giveSubscription(stranger.id, "PRO")
    const foreign = await createQRCode(stranger.id)

    const ownScan = await request(app).get(`/r/${own.slug}`).set("Host", "qr.isolation.com")
    expect(ownScan.status).toBe(302)
    expect(ownScan.headers.location, "landing page stays on the customer's domain").toBe(`https://qr.isolation.com/l/${own.slug}`)

    const foreignScan = await request(app).get(`/r/${foreign.slug}`).set("Host", "qr.isolation.com")
    expect(foreignScan.status, "REAL BUG: another account's code served under this brand's domain").toBe(404)

    // genxqr.com (the test's own host) still serves both.
    expect((await request(app).get(`/r/${foreign.slug}`)).status).toBe(302)
    expect((await request(app).get(`/r/${own.slug}`)).status).toBe(302)
  })

  it("should not be fooled by an X-Forwarded-Host header", async () => {
    await ownerWithActiveDomain("qr.spoof.com")
    const stranger = await createUser(); await giveSubscription(stranger.id, "PRO")
    const foreign = await createQRCode(stranger.id)
    const res = await request(app).get(`/r/${foreign.slug}`)
      .set("Host", "qr.spoof.com").set("X-Forwarded-Host", new URL(env.FRONTEND_URL).host)
    expect(res.status, "REAL BUG: X-Forwarded-Host bypassed custom-domain isolation").toBe(404)
  })

  it("should 404 on a host that is not a verified customer domain", async () => {
    const owner = await createUser(); await giveSubscription(owner.id, "PRO")
    const code = await createQRCode(owner.id)
    await addDomain(owner.token, "qr.not-verified.com") // stays pending
    expect((await request(app).get(`/r/${code.slug}`).set("Host", "qr.not-verified.com")).status).toBe(404)
    expect((await request(app).get(`/r/${code.slug}`).set("Host", "qr.random-host.com")).status).toBe(404)
  })

  it("should apply the same isolation to the landing-page content endpoint", async () => {
    const { owner } = await ownerWithActiveDomain("qr.landing.com")
    const own = await createQRCode(owner.id)
    const stranger = await createUser(); await giveSubscription(stranger.id, "PRO")
    const foreign = await createQRCode(stranger.id)
    expect((await request(app).get(`/api/public/qr/${own.slug}`).set("Host", "qr.landing.com")).status).toBe(200)
    expect((await request(app).get(`/api/public/qr/${foreign.slug}`).set("Host", "qr.landing.com")).status).toBe(404)
  })

  it("should show the domain owner's branding on their domain, never another account's", async () => {
    const owner = await createUser(); await giveSubscription(owner.id, "BUSINESS")
    await prisma.user.update({ where: { id: owner.id }, data: { brandName: "Acme Foods" } })
    const added = await addDomain(owner.token, "qr.acme-foods.com")
    cfNextStatus = "active"
    await request(app).post(`/api/domains/${added.body.data.id}/check`).set("Authorization", `Bearer ${owner.token}`)

    const stranger = await createUser(); await giveSubscription(stranger.id, "BUSINESS")
    await prisma.user.update({ where: { id: stranger.id }, data: { brandName: "Stranger Co" } })
    const foreign = await createQRCode(stranger.id)

    const res = await request(app).get(`/api/public/branding/${foreign.slug}`).set("Host", "qr.acme-foods.com")
    expect(res.body.data.name, "REAL BUG: another account's brand shown on this customer's domain").toBe("Acme Foods")
    // On genxqr.com the slug's own owner still decides.
    expect((await request(app).get(`/api/public/branding/${foreign.slug}`)).body.data.name).toBe("Stranger Co")
  })

  it("should not check another account's password on a customer's domain", async () => {
    const { owner } = await ownerWithActiveDomain("qr.pw.com")
    void owner
    const stranger = await createUser(); await giveSubscription(stranger.id, "PRO")
    const foreign = await createQRCode(stranger.id)
    await prisma.qRCode.update({ where: { id: foreign.id }, data: { isPasswordProtected: true, passwordHash: "$2a$12$abcdefghijklmnopqrstuuJ8m6ZgQq4mH1QkO6fJ8b7yWl8XQ7V2e" } })
    const res = await request(app).post(`/r/${foreign.slug}/password`).set("Host", "qr.pw.com").send({ password: "anything" })
    expect(res.status).toBe(404)
  })

  it("should send scans to genxqr.com when the owner's plan no longer includes custom domains", async () => {
    const { owner } = await ownerWithActiveDomain("qr.downgraded.com")
    const code = await createQRCode(owner.id)
    await giveSubscription(owner.id, "STARTER")
    const res = await request(app).get(`/r/${code.slug}`).set("Host", "qr.downgraded.com")
    expect(res.status).toBe(302)
    expect(res.headers.location).toBe(`${env.FRONTEND_URL.replace(/\/$/, "")}/r/${code.slug}`)
  })
})

describe("removing a domain", () => {
  it("should release it from Cloudflare, fall its codes back to genxqr.com, and stop serving it", async () => {
    const { owner, domainId } = await ownerWithActiveDomain("qr.removed.com")
    const created = await request(app).post("/api/qr").set("Authorization", `Bearer ${owner.token}`)
      .send({ name: "On domain", type: "URL", content: { data: { url: "https://example.com" } } })
    const slug = created.body.data.slug as string

    const del = await request(app).delete(`/api/domains/${domainId}`).set("Authorization", `Bearer ${owner.token}`)
    expect(del.status).toBe(200)
    expect(del.body.data.codesMoved).toBe(1)
    expect(cfCalls.some((c) => c.method === "DELETE")).toBe(true)

    const after = await prisma.qRCode.findUniqueOrThrow({ where: { slug }, select: { customDomainId: true } })
    expect(after.customDomainId).toBeNull()
    expect((await request(app).get(`/r/${slug}`).set("Host", "qr.removed.com")).status).toBe(404)
    expect((await request(app).get(`/r/${slug}`)).status, "still scans on genxqr.com").toBe(302)
  })
})
