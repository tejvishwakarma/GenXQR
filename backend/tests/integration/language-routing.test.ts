import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { primaryLanguage } from "../../src/services/scan.service.js"
import { createUser, giveSubscription, seedPlans } from "../helpers/factories.js"

/**
 * Language routing (7 Nov 2026): a smart-routing rule on the scanner's
 * preferred language (the first Accept-Language entry), e.g. Hindi phones to
 * the Hindi page.
 */
describe("language routing", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should read the preferred language as a base code", () => {
    expect(primaryLanguage("hi-IN,hi;q=0.9,en;q=0.8")).toBe("hi")
    expect(primaryLanguage("en-GB")).toBe("en")
    expect(primaryLanguage("*")).toBeNull()
    expect(primaryLanguage(undefined)).toBeNull()
  })

  it("should send Hindi phones to the Hindi page and everyone else to the code's own destination", async () => {
    const user = await createUser()
    await giveSubscription(user.id, "PRO")
    const created = await request(app).post("/api/qr").set("Authorization", `Bearer ${user.token}`)
      .send({ name: "menu", type: "WHATSAPP", content: { data: { phone: "919876543210" } } })
      .expect(201)
    const { id, slug } = created.body.data as { id: string; slug: string }

    await request(app).post(`/api/qr/${id}/smart-routes`).set("Authorization", `Bearer ${user.token}`)
      .send({ conditionType: "language", conditionValue: { languages: ["hi; drop"] }, targetUrl: "https://example.com/hi", priority: 1 })
      .expect(422)
    await request(app).post(`/api/qr/${id}/smart-routes`).set("Authorization", `Bearer ${user.token}`)
      .send({ conditionType: "language", conditionValue: { languages: ["hi", "mr"] }, targetUrl: "https://example.com/hi", priority: 1 })
      .expect(201)

    const scan = (lang: string) => request(app).get(`/r/${slug}`).set("Accept-Language", lang)
    expect((await scan("hi-IN,hi;q=0.9,en;q=0.8")).headers["location"]).toBe("https://example.com/hi")
    expect((await scan("mr")).headers["location"]).toBe("https://example.com/hi")
    // Hindi accepted but not preferred: no match.
    expect((await scan("en-IN,hi;q=0.8")).headers["location"]).toContain("wa.me")
    expect(await prisma.smartRoutingRule.count({ where: { qrId: id } })).toBe(1)
  })
})
