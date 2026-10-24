import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { PLAN_LIMITS } from "../../src/services/billing.service.js"
import { createUser, giveSubscription, seedPlans } from "../helpers/factories.js"

/**
 * The plan's QR limit under concurrency (security audit, 23 Oct 2026): the
 * middleware counted and the handler created later, so parallel creates all
 * passed the count — 49 of 50 plus twenty at once made ~69.
 */
describe("QR limit under concurrent creates", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should never exceed the plan limit", async () => {
    const user = await createUser()
    await giveSubscription(user.id, "STARTER")
    const limit = PLAN_LIMITS.STARTER.dynamicQRLimit
    await prisma.qRCode.createMany({
      data: Array.from({ length: limit - 1 }, (_, i) => ({
        userId: user.id, name: `seed ${i}`, slug: `rc${i}${Date.now().toString(36)}`.slice(0, 16), type: "URL" as const, category: "DYNAMIC" as const,
      })),
    })

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        request(app).post("/api/qr").set("Authorization", `Bearer ${user.token}`)
          .send({ name: `race ${i}`, type: "URL", content: { data: { url: "https://example.com" } } }),
      ),
    )
    expect(results.filter((r) => r.status === 201)).toHaveLength(1)
    expect(await prisma.qRCode.count({ where: { userId: user.id } })).toBe(limit)
  })
})
