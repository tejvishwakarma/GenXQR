import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { UNLIMITED_SCANS, getUserPlanLimits } from "../../src/services/billing.service.js"
import { getScanQuota } from "../../src/services/scan-quota.service.js"
import { syncAgencyClients } from "../../src/services/agency.service.js"
import { deleteUserAndData } from "../../src/services/account-erasure.service.js"
import { createUser, giveSubscription, seedPlans } from "../helpers/factories.js"

/**
 * Agency plan (1 Nov 2026): an agency's clients are managed accounts it works in
 * through the workspace switcher, each with caps out of the agency's pool, its
 * own brand on scan pages, the agency's brand on the share report, and the
 * agency's subscription deciding whether its codes run.
 */

const auth = (token: string, workspace?: string) => {
  const h: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (workspace) h["X-Workspace-Id"] = workspace
  return h
}

const caps = (o: Partial<{ maxCodes: number; maxScansPerMonth: number; maxDomains: number; maxStorageGB: number }> = {}) => ({
  maxCodes: 100, maxScansPerMonth: 20_000, maxDomains: 1, maxStorageGB: 2, ...o,
})

async function agency(plan: "AGENCY" | "ENTERPRISE" | "BUSINESS" = "AGENCY") {
  const owner = await createUser({ name: "Acme Agency" })
  await giveSubscription(owner.id, plan)
  return owner
}

async function addClient(token: string, body: Record<string, unknown>) {
  return request(app).post("/api/agency/clients").set(auth(token)).send(body)
}

const createCode = (token: string, workspace?: string, name = "code") =>
  request(app).post("/api/qr").set(auth(token, workspace)).send({ name, type: "URL", content: { data: { url: "https://example.com" } } })

describe("agency plan", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  describe("clients and the pool", () => {
    it("should be an Agency-plan feature", async () => {
      const biz = await agency("BUSINESS")
      const res = await addClient(biz.token, { name: "Cafe", ...caps() })
      expect(res.status).toBe(403)
      expect(res.body.error).toMatch(/Agency plan/)
    })

    it("should create a client as a managed account with no way to sign in", async () => {
      const a = await agency()
      const res = await addClient(a.token, { name: "Blue Cafe", ...caps() })
      expect(res.status, JSON.stringify(res.body)).toBe(201)
      const user = await prisma.user.findUniqueOrThrow({ where: { id: res.body.data.userId } })
      expect(user.passwordHash).toBeNull()
      expect(user.email).toMatch(/\.invalid$/)
      expect(user.brandName).toBe("Blue Cafe")
      expect((await request(app).post("/api/auth/login").send({ email: user.email, password: "anything1A" })).status).toBe(401)
    })

    it("should refuse caps beyond the pool and a 16th client", async () => {
      const a = await agency()
      expect((await addClient(a.token, { name: "Huge", ...caps({ maxCodes: 5001 }) })).status).toBe(422)
      expect((await addClient(a.token, { name: "Big", ...caps({ maxCodes: 4000 }) })).status).toBe(201)
      // 1,000 codes left in the pool.
      const over = await addClient(a.token, { name: "Too big", ...caps({ maxCodes: 1001 }) })
      expect(over.status).toBe(422)
      expect(over.body.error).toMatch(/1,000 free/)

      const b = await agency()
      for (let i = 0; i < 15; i++) expect((await addClient(b.token, { name: `C${i}`, ...caps({ maxCodes: 10, maxScansPerMonth: 1000, maxDomains: 1 }) })).status).toBe(201)
      expect((await addClient(b.token, { name: "C15", ...caps({ maxCodes: 10, maxScansPerMonth: 1000, maxDomains: 0 }) })).status).toBe(403)
    })

    it("should give the client its caps and the agency what is left", async () => {
      const a = await agency()
      const res = await addClient(a.token, { name: "Cafe", ...caps({ maxCodes: 300, maxScansPerMonth: 50_000, maxDomains: 2, maxStorageGB: 5 }) })
      const client = await getUserPlanLimits(res.body.data.userId)
      // Scans are unlimited on Agency (9 Nov 2026): the client's scan cap is not applied, nothing is taken from the pool.
      expect(client.limits).toMatchObject({ dynamicQRLimit: 300, scanLimitPerMonth: UNLIMITED_SCANS, customDomainsLimit: 2, fileStorageGB: 5, apiAccess: false, agencyClientsLimit: 0 })
      const own = await getUserPlanLimits(a.id)
      expect(own.limits).toMatchObject({ dynamicQRLimit: 4700, scanLimitPerMonth: UNLIMITED_SCANS, customDomainsLimit: 13, fileStorageGB: 95 })
      expect((await getScanQuota(res.body.data.userId)).limit).toBe(0) // not enforced
      // With nothing to share out, a client's scan cap never runs the pool dry.
      expect((await addClient(a.token, { name: "Bakery", ...caps({ maxCodes: 10, maxScansPerMonth: 1_000_000_000, maxDomains: 0, maxStorageGB: 0 }) })).status).toBe(201)
    })
  })

  describe("working in a client's workspace", () => {
    it("should let the agency and its team in, and nobody else", async () => {
      const a = await agency()
      const clientId = (await addClient(a.token, { name: "Cafe", ...caps() })).body.data.userId as string

      const byOwner = await createCode(a.token, clientId)
      expect(byOwner.status, JSON.stringify(byOwner.body)).toBe(201)
      expect((await prisma.qRCode.findUniqueOrThrow({ where: { id: byOwner.body.data.id } })).userId).toBe(clientId)

      const editor = await createUser()
      const team = await prisma.team.create({ data: { ownerId: a.id, name: "Agency" } })
      await prisma.teamMember.create({ data: { teamId: team.id, userId: editor.id, role: "EDITOR" } })
      expect((await createCode(editor.token, clientId)).status).toBe(201)
      // An editor works in clients but does not manage them.
      expect((await request(app).get("/api/agency/clients").set(auth(editor.token, a.id))).status).toBe(403)

      const stranger = await createUser()
      await giveSubscription(stranger.id, "AGENCY")
      expect((await createCode(stranger.token, clientId)).status).toBe(403)

      const listed = await request(app).get("/api/team/workspaces").set(auth(editor.token))
      expect(listed.body.data.some((w: { ownerId: string; kind: string }) => w.ownerId === clientId && w.kind === "client")).toBe(true)
    })

    it("should hold the client to its own caps and feature switches", async () => {
      const a = await agency()
      const created = await addClient(a.token, { name: "Tiny", ...caps({ maxCodes: 1 }), features: { abTesting: false } })
      const clientId = created.body.data.userId as string
      const first = await createCode(a.token, clientId)
      expect(first.status).toBe(201)
      expect((await createCode(a.token, clientId)).status).toBe(403)
      const ab = await request(app).patch(`/api/qr/${first.body.data.id}/ab-test`).set(auth(a.token, clientId)).send({ abTestEnabled: true, abTestSplitPct: 50 })
      expect(ab.status).toBe(403)
    })

    it("should not let a client have clients", async () => {
      const a = await agency()
      const clientId = (await addClient(a.token, { name: "Cafe", ...caps() })).body.data.userId as string
      expect((await request(app).get("/api/agency/clients").set(auth(a.token, clientId))).status).toBe(409)
    })

    it("should put custom domains on the client, for the agency's owner/admins only", async () => {
      const a = await agency()
      const noDomains = (await addClient(a.token, { name: "NoDomains", ...caps({ maxDomains: 0 }) })).body.data.userId as string
      // The client's cap applies (0 domains), not the agency's 15.
      expect((await request(app).post("/api/domains").set(auth(a.token, noDomains)).send({ hostname: "qr.cafe-example.com" })).status).toBe(403)

      const editor = await createUser()
      const team = await prisma.team.create({ data: { ownerId: a.id, name: "Agency" } })
      await prisma.teamMember.create({ data: { teamId: team.id, userId: editor.id, role: "EDITOR" } })
      const withDomain = (await addClient(a.token, { name: "WithDomain", ...caps({ maxDomains: 1 }) })).body.data.userId as string
      const res = await request(app).post("/api/domains").set(auth(editor.token, withDomain)).send({ hostname: "qr.cafe-example.com" })
      expect(res.status).toBe(403)
      expect(res.body.error).toMatch(/agency's owner or admins/)
    })
  })

  describe("following the agency's plan", () => {
    it("should pause clients' codes when the plan stops covering them, and resume them after", async () => {
      const a = await agency()
      const clientId = (await addClient(a.token, { name: "Cafe", ...caps() })).body.data.userId as string
      const code = await createCode(a.token, clientId)
      expect(code.status).toBe(201)

      await giveSubscription(a.id, "BUSINESS")
      await syncAgencyClients(a.id)
      const paused = await prisma.qRCode.findUniqueOrThrow({ where: { id: code.body.data.id } })
      expect(paused).toMatchObject({ isActive: false, pausedForBilling: true })
      expect((await getUserPlanLimits(clientId)).limits.dynamicQRLimit).toBe(0)

      await giveSubscription(a.id, "AGENCY")
      await syncAgencyClients(a.id)
      expect(await prisma.qRCode.findUniqueOrThrow({ where: { id: code.body.data.id } })).toMatchObject({ isActive: true, pausedForBilling: false })
    })

    it("should delete the clients with the agency's account", async () => {
      const a = await agency()
      const clientId = (await addClient(a.token, { name: "Cafe", ...caps() })).body.data.userId as string
      await createCode(a.token, clientId)
      await deleteUserAndData(a.id)
      expect(await prisma.user.findUnique({ where: { id: clientId } })).toBeNull()
      expect(await prisma.qRCode.count({ where: { userId: clientId } })).toBe(0)
    })
  })

  describe("share report", () => {
    it("should show the agency's brand and the client's numbers, and stop when switched off", async () => {
      const a = await agency()
      await prisma.user.update({ where: { id: a.id }, data: { brandName: "Acme Digital" } })
      const created = (await addClient(a.token, { name: "Blue Cafe", ...caps() })).body.data
      await createCode(a.token, created.userId, "Menu")

      const on = await request(app).put(`/api/agency/clients/${created.id}/report`).set(auth(a.token)).send({ enabled: true })
      const token = on.body.data.reportToken as string
      expect(token).toMatch(/^[A-Za-z0-9_-]{30,}$/)

      const report = await request(app).get(`/api/public/report/${token}?days=30`)
      expect(report.status).toBe(200)
      expect(report.body.data.agency.name).toBe("Acme Digital")
      expect(report.body.data.client.name).toBe("Blue Cafe")
      expect(report.body.data.totals.codes).toBe(1)
      expect(JSON.stringify(report.body)).not.toMatch(/genxqr/i)

      const off = await request(app).put(`/api/agency/clients/${created.id}/report`).set(auth(a.token)).send({ enabled: false })
      expect(off.body.data.reportToken, "switching off must leave no link at all").toBeNull()
      expect((await request(app).get(`/api/public/report/${token}?days=7`)).status).toBe(404)
      // The period that was just viewed (and so cached) stops too, at once.
      expect((await request(app).get(`/api/public/report/${token}?days=30`)).status, "REAL BUG: a switched-off report link still served its cached copy").toBe(404)
    })

    it("should not let another agency switch on someone else's client's report", async () => {
      const a = await agency()
      const created = (await addClient(a.token, { name: "Cafe", ...caps() })).body.data
      const other = await agency()
      expect((await request(app).put(`/api/agency/clients/${created.id}/report`).set(auth(other.token)).send({ enabled: true })).status).toBe(404)
      expect((await request(app).delete(`/api/agency/clients/${created.id}`).set(auth(other.token))).status).toBe(404)
    })
  })
})
