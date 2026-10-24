import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { PLAN_LIMITS } from "../../src/services/billing.service.js"
import { createUser, giveSubscription, seedPlans, type TestUser } from "../helpers/factories.js"

/**
 * The account's logo at the top of the scan landing page (decided 23 Oct 2026):
 * every PAID plan. Replacing GenXQR's NAME with the customer's (white-label)
 * stays Business+, so on Starter/Pro the page shows the customer's logo on top
 * and is still attributed to GenXQR in the footer.
 */

const LOGO = "/uploads/image/acme-logo.png"

async function landingBranding(owner: TestUser) {
  const created = await request(app)
    .post("/api/qr")
    .set("Authorization", `Bearer ${owner.token}`)
    .send({ name: "landing", type: "URL", content: { data: { url: "https://example.com" } } })
    .expect(201)
  const res = await request(app).get(`/api/public/qr/${created.body.data.slug}`).expect(200)
  return res.body.data.branding as { mode: string; name: string | null; pageLogoUrl: string | null }
}

describe("logo on scan pages", () => {
  let owner: TestUser

  beforeAll(async () => {
    await seedPlans()
  })

  beforeEach(async () => {
    owner = await createUser()
  })

  it("should be a feature of every paid plan, and not of FREE", () => {
    expect(PLAN_LIMITS.FREE.scanPageLogo).toBe(false)
    for (const plan of ["STARTER", "PRO", "BUSINESS", "ENTERPRISE"] as const) expect(PLAN_LIMITS[plan].scanPageLogo).toBe(true)
  })

  it("should let a Starter account save a logo, but not a brand name", async () => {
    await giveSubscription(owner.id, "STARTER")
    await request(app).patch("/api/branding").set("Authorization", `Bearer ${owner.token}`)
      .send({ brandLogoUrl: LOGO }).expect(200)
    const nameRes = await request(app).patch("/api/branding").set("Authorization", `Bearer ${owner.token}`)
      .send({ brandName: "Acme" })
    expect(nameRes.status).toBe(403)
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: owner.id }, select: { brandLogoUrl: true, brandName: true } })
    expect(saved).toEqual({ brandLogoUrl: LOGO, brandName: null })
  })

  it("should refuse a logo on the FREE plan", async () => {
    await giveSubscription(owner.id, "FREE")
    const res = await request(app).patch("/api/branding").set("Authorization", `Bearer ${owner.token}`).send({ brandLogoUrl: LOGO })
    expect(res.status).toBe(403)
  })

  it("should show a Starter account's logo on the scan page, still attributed to GenXQR", async () => {
    await giveSubscription(owner.id, "STARTER")
    await prisma.user.update({ where: { id: owner.id }, data: { brandLogoUrl: LOGO } })
    const branding = await landingBranding(owner)
    expect(branding.pageLogoUrl).toBe(LOGO)
    expect(branding.mode).toBe("genxqr")
  })

  it("should show the logo with the brand name on a white-label plan", async () => {
    await giveSubscription(owner.id, "BUSINESS")
    await prisma.user.update({ where: { id: owner.id }, data: { brandLogoUrl: LOGO, brandName: "Acme" } })
    const branding = await landingBranding(owner)
    expect(branding).toMatchObject({ mode: "custom", name: "Acme", pageLogoUrl: LOGO })
  })

  it("should stop showing the logo once the account is on FREE, without deleting it", async () => {
    await giveSubscription(owner.id, "STARTER")
    await prisma.user.update({ where: { id: owner.id }, data: { brandLogoUrl: LOGO } })
    await giveSubscription(owner.id, "FREE")
    // FREE cannot create codes, so make one directly.
    const qr = await prisma.qRCode.create({
      data: { userId: owner.id, name: "x", slug: `pl${Date.now().toString(36)}`, type: "URL", category: "DYNAMIC", content: { create: { data: { url: "https://example.com" } } } },
    })
    const res = await request(app).get(`/api/public/qr/${qr.slug}`).expect(200)
    expect(res.body.data.branding.pageLogoUrl).toBeNull()
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).brandLogoUrl).toBe(LOGO)
  })

  it("should report what the plan allows to the settings page", async () => {
    await giveSubscription(owner.id, "PRO")
    const res = await request(app).get("/api/branding").set("Authorization", `Bearer ${owner.token}`).expect(200)
    expect(res.body.data).toMatchObject({ scanPageLogoEnabled: true, whiteLabelEnabled: false })
  })
})
