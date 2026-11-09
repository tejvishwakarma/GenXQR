import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { UNLIMITED_SCANS, getUserPlanLimits } from "../../src/services/billing.service.js"
import { getScanQuota, isOverScanQuota } from "../../src/services/scan-quota.service.js"
import { createUser, giveSubscription, seedPlans } from "../helpers/factories.js"

/**
 * Plans of 9 Nov 2026: unlimited monthly scans on Pro and above, fewer codes on
 * Pro (250 → 150) and Business (2,000 → 1,000). Subscriptions that existed then
 * keep their old code limit while they stay on that plan (legacyQRLimit).
 */
const VALID_QR = { name: "Limit test", type: "URL", content: { data: { url: "https://example.com" } } }

async function fill(userId: string, n: number) {
  const tag = Date.now().toString(36)
  await prisma.qRCode.createMany({
    data: Array.from({ length: n }, (_, i) => ({ userId, name: `Fill ${i}`, slug: `f${i}x${tag}`.slice(0, 20), type: "URL" as const, category: "DYNAMIC" as const })),
  })
}

const legacy = (userId: string, plan: "PRO" | "BUSINESS", limit: number) =>
  prisma.subscription.update({ where: { userId }, data: { legacyQRLimit: limit, legacyQRLimitPlan: plan } })

describe("unlimited scans and the new code limits", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should not cap scans on Pro, Business or Agency, and still cap Starter", async () => {
    for (const plan of ["PRO", "BUSINESS", "AGENCY"] as const) {
      const user = await createUser()
      await giveSubscription(user.id, plan)
      expect((await getUserPlanLimits(user.id)).limits.scanLimitPerMonth).toBe(UNLIMITED_SCANS)
      expect((await getScanQuota(user.id)).limit).toBe(0)
      expect(await isOverScanQuota(user.id)).toBe(false)
      const usage = await request(app).get("/api/billing/usage").set("Authorization", `Bearer ${user.token}`).expect(200)
      expect(usage.body.data.scans.limit).toBe(-1)
    }
    const starter = await createUser()
    await giveSubscription(starter.id, "STARTER")
    expect((await getScanQuota(starter.id)).limit).toBe(5000)
  })

  it("should hold a new Pro account to 150 codes", async () => {
    const user = await createUser()
    await giveSubscription(user.id, "PRO")
    await fill(user.id, 149)
    await request(app).post("/api/qr").set("Authorization", `Bearer ${user.token}`).send(VALID_QR).expect(201)
    const over = await request(app).post("/api/qr").set("Authorization", `Bearer ${user.token}`).send(VALID_QR)
    expect(over.status).toBe(403)
    expect(over.body.error).toContain("150")
  })

  it("should let an existing Pro customer keep 250 codes", async () => {
    const user = await createUser()
    await giveSubscription(user.id, "PRO")
    await legacy(user.id, "PRO", 250)
    expect((await getUserPlanLimits(user.id)).limits.dynamicQRLimit).toBe(250)
    await fill(user.id, 200)
    await request(app).post("/api/qr").set("Authorization", `Bearer ${user.token}`).send(VALID_QR).expect(201)
  })

  it("should apply a kept limit only on the plan it was kept on", async () => {
    const user = await createUser()
    await giveSubscription(user.id, "BUSINESS")
    await legacy(user.id, "BUSINESS", 2000)
    expect((await getUserPlanLimits(user.id)).limits.dynamicQRLimit).toBe(2000)
    await giveSubscription(user.id, "PRO") // moved down: Pro's limit, not Business's old one
    expect((await getUserPlanLimits(user.id)).limits.dynamicQRLimit).toBe(150)

    const pro = await createUser()
    await giveSubscription(pro.id, "PRO")
    await legacy(pro.id, "PRO", 250)
    await giveSubscription(pro.id, "BUSINESS") // moved up: Business's own limit is higher
    expect((await getUserPlanLimits(pro.id)).limits.dynamicQRLimit).toBe(1000)
  })
})
