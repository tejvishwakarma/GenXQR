import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { createUser, giveSubscription, seedPlans } from "../helpers/factories.js"

/**
 * Smart routing is a Pro feature (security audit, 23 Oct 2026): saved rules
 * kept routing after a downgrade (indefinitely for a lapsed Pro trial), while
 * the downgraded owner was refused deleting them.
 */
async function codeWithDesktopRule(userId: string) {
  return prisma.qRCode.create({
    data: {
      userId, name: "routed", slug: `rt${Date.now().toString(36)}`, type: "WHATSAPP", category: "DYNAMIC", isActive: true,
      content: { create: { data: { phone: "919876543210" } } },
      smartRoutes: { create: { priority: 1, conditionType: "device", conditionValue: { device: "desktop" }, targetUrl: "https://desktop.example.com/" } },
    },
    include: { smartRoutes: true },
  })
}
const scan = (slug: string) => request(app).get(`/r/${slug}`).set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")

describe("smart routing after a downgrade", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should route while the plan includes it, and not after", async () => {
    const user = await createUser()
    await giveSubscription(user.id, "PRO")
    const qr = await codeWithDesktopRule(user.id)
    expect((await scan(qr.slug)).headers["location"]).toBe("https://desktop.example.com/")

    await giveSubscription(user.id, "STARTER")
    expect((await scan(qr.slug)).headers["location"]).toContain("wa.me")
  })

  it("should let a downgraded owner delete the rule", async () => {
    const user = await createUser()
    await giveSubscription(user.id, "STARTER")
    const qr = await codeWithDesktopRule(user.id)
    await request(app).delete(`/api/qr/${qr.id}/smart-routes/${qr.smartRoutes[0]!.id}`).set("Authorization", `Bearer ${user.token}`).expect(200)
    expect(await prisma.smartRoutingRule.count({ where: { qrId: qr.id } })).toBe(0)
  })
})
