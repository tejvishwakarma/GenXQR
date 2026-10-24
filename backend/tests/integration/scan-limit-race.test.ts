import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { createUser, giveSubscription, seedPlans } from "../helpers/factories.js"

/**
 * An owner-set scan limit under concurrency (audit, 24 Oct 2026): the limit
 * was checked first and counted later, so simultaneous scans of a "1 scan
 * only" code (a single-use coupon) all got through.
 */
describe("scan limit under simultaneous scans", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should let exactly the limit through", async () => {
    const user = await createUser()
    await giveSubscription(user.id, "PRO")
    const qr = await prisma.qRCode.create({
      data: {
        userId: user.id, name: "one-shot", slug: `os${Date.now().toString(36)}`, type: "WHATSAPP", category: "DYNAMIC",
        isActive: true, scanLimit: 1, content: { create: { data: { phone: "919876543210" } } },
      },
    })
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        request(app).get(`/r/${qr.slug}`).set("X-Forwarded-For", `198.51.100.${i + 1}, 162.158.0.1`).set("User-Agent", `phone-${i}`),
      ),
    )
    const through = results.filter((r) => (r.headers["location"] ?? "").includes("wa.me"))
    const limited = results.filter((r) => (r.headers["location"] ?? "").includes("reason=limit"))
    expect(through).toHaveLength(1)
    expect(limited).toHaveLength(9)
  })

  it("should not spend the slot on the password prompt", async () => {
    const user = await createUser()
    await giveSubscription(user.id, "PRO")
    const qr = await prisma.qRCode.create({
      data: {
        userId: user.id, name: "locked", slug: `lk${Date.now().toString(36)}`, type: "WHATSAPP", category: "DYNAMIC",
        isActive: true, scanLimit: 1, isPasswordProtected: true, passwordHash: "x",
        content: { create: { data: { phone: "919876543210" } } },
      },
    })
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get(`/r/${qr.slug}`).set("User-Agent", `p${i}`)
      expect(res.headers["location"]).toContain("/password")
    }
  })
})
