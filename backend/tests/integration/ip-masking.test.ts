import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { maskIp } from "../../src/utils/mask-ip.util.js"
import { createQRCode, createUser, giveSubscription, seedPlans } from "../helpers/factories.js"

/**
 * Scanner IPs are personal data and were shown in full to every member who
 * could view analytics, Viewers included (decided 24 Oct 2026: mask them).
 */
describe("scanner IP masking", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it.each([
    ["203.0.113.57", "203.0.113.x"],
    ["::ffff:198.51.100.9", "198.51.100.x"],
    ["2001:db8:85a3:8d3:1319:8a2e:370:7348", "2001:db8:85a3::x"],
    ["2001:db8::1", "2001:db8::x"],
    ["", ""],
  ])("should mask %s as %s", (ip, masked) => {
    expect(maskIp(ip)).toBe(masked)
  })

  it("should never put a full scanner IP in the CSV export", async () => {
    const user = await createUser()
    await giveSubscription(user.id, "PRO")
    const qr = await createQRCode(user.id)
    await prisma.qRScan.create({ data: { qrId: qr.id, ip: "203.0.113.57" } })
    const csv = await request(app).get(`/api/analytics/${qr.id}/csv`).set("Authorization", `Bearer ${user.token}`).expect(200)
    expect(csv.text).toContain("203.0.113.x")
    expect(csv.text).not.toContain("203.0.113.57")

    const api = await request(app).get(`/api/analytics/${qr.id}`).set("Authorization", `Bearer ${user.token}`).expect(200)
    expect(JSON.stringify(api.body)).not.toContain("203.0.113.57")
  })
})
