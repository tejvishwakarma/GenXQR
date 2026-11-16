import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { evaluateSmartRoutes, hourInZone } from "../../src/services/scan.service.js"
import { createUser, giveSubscription, seedPlans } from "../helpers/factories.js"

/**
 * Time-of-day routing in the rule's own time zone (16 Nov 2026). Rules used to
 * be compared with the UTC hour only, so "12 → 15" for lunch in India fired at
 * 17:30–20:30 IST. Rules saved before have no zone and must keep meaning UTC.
 */
const AT = new Date("2026-11-16T06:30:00Z") // 12:00 in India, 01:30 in New York (EST)

const rule = (conditionValue: Record<string, unknown>, targetUrl = "https://example.com/lunch") => ({
  conditionType: "time",
  conditionValue,
  targetUrl,
  priority: 1,
  isActive: true,
})
const ctx = (now: Date) => ({ deviceType: "mobile", now, countryCode: null, language: null })

describe("time-of-day routing", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should read the hour in the rule's zone, and UTC when it has none", () => {
    expect(hourInZone(AT, undefined)).toBe(6)
    expect(hourInZone(AT, "UTC")).toBe(6)
    expect(hourInZone(AT, "Asia/Kolkata")).toBe(12)
    expect(hourInZone(AT, "Asia/Calcutta")).toBe(12)
    expect(hourInZone(AT, "America/New_York")).toBe(1)
    expect(hourInZone(new Date("2026-11-16T18:45:00Z"), "Asia/Kolkata")).toBe(0) // 00:15 next day
  })

  it("should match a zoned rule in that zone, and leave an old zone-less rule on UTC", () => {
    const zoned = [rule({ from: 12, to: 15, timeZone: "Asia/Kolkata" })]
    const legacy = [rule({ from: 12, to: 15 })]
    expect(evaluateSmartRoutes(zoned as never, ctx(AT))).toBe("https://example.com/lunch")
    expect(evaluateSmartRoutes(legacy as never, ctx(AT))).toBeNull()
    expect(evaluateSmartRoutes(legacy as never, ctx(new Date("2026-11-16T12:30:00Z")))).toBe("https://example.com/lunch")
    // `to` is exclusive: 15:00 IST is outside 12 → 15.
    expect(evaluateSmartRoutes(zoned as never, ctx(new Date("2026-11-16T09:30:00Z")))).toBeNull()
    // Crossing midnight: 22 → 6 in India includes 00:15 IST.
    const night = [rule({ from: 22, to: 6, timeZone: "Asia/Kolkata" }, "https://example.com/night")]
    expect(evaluateSmartRoutes(night as never, ctx(new Date("2026-11-16T18:45:00Z")))).toBe("https://example.com/night")
  })

  it("should save a zoned rule, refuse unknown zones and offsets, and store only known keys", async () => {
    const user = await createUser()
    await giveSubscription(user.id, "PRO")
    const h = { Authorization: `Bearer ${user.token}` }
    const created = await request(app).post("/api/qr").set(h)
      .send({ name: "menu", type: "URL", content: { data: { url: "https://example.com/menu" } } })
      .expect(201)
    const id = (created.body.data as { id: string }).id
    const post = (conditionValue: Record<string, unknown>) =>
      request(app).post(`/api/qr/${id}/smart-routes`).set(h).send({ ...rule(conditionValue) })

    await post({ from: 12, to: 15, timeZone: "Mars/Olympus_Mons" }).expect(422)
    await post({ from: 12, to: 15, timeZone: "+05:30" }).expect(422)
    // conditionValue can't swap the rule's type: this is validated as a time rule and has no hours.
    await post({ type: "device", device: "mobile" }).expect(422)

    const ok = await post({ from: 12, to: 15, timeZone: "Asia/Kolkata", junk: "<script>" }).expect(201)
    const saved = await prisma.smartRoutingRule.findUniqueOrThrow({ where: { id: ok.body.data.id } })
    expect(saved.conditionValue).toEqual({ from: 12, to: 15, timeZone: "Asia/Kolkata" })
  })
})
