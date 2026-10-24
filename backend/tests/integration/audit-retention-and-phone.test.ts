import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { purgeExpiredAuditLogs } from "../../src/services/audit.service.js"
import { createAdmin, createUser, seedPlans } from "../helpers/factories.js"

/** Decided 24 Oct 2026: audit log kept 3 years; checkout phone shown to every admin. */

beforeAll(async () => {
  await seedPlans()
})

describe("audit log retention", () => {
  it("should delete entries older than 3 years, including deleted accounts', and keep the rest", async () => {
    const now = new Date("2026-10-24T12:00:00Z")
    const yearsAgo = (y: number, plusDays = 0) => {
      const d = new Date(now)
      d.setUTCFullYear(d.getUTCFullYear() - y)
      d.setUTCDate(d.getUTCDate() + plusDays)
      return d
    }
    const user = await createUser()
    await prisma.auditLog.createMany({
      data: [
        { userId: user.id, action: "auth.login", ip: "8.8.8.8", createdAt: yearsAgo(3, -1) }, // 3 years + 1 day
        { userId: null, action: "auth.register", ip: "8.8.4.4", createdAt: yearsAgo(4) },     // a deleted account's
        { userId: user.id, action: "auth.login", ip: "1.1.1.1", createdAt: yearsAgo(3, 1) },  // 1 day short of 3 years
        { userId: user.id, action: "qr.create", ip: "1.0.0.1", createdAt: yearsAgo(0) },
      ],
    })

    expect(await purgeExpiredAuditLogs(now)).toBe(2)
    const left = await prisma.auditLog.findMany({ select: { ip: true }, orderBy: { createdAt: "asc" } })
    expect(left.map((l) => l.ip)).toEqual(["1.1.1.1", "1.0.0.1"])
  })
})

describe("phone number in the admin panel", () => {
  it("should show the checkout phone number to every admin and find the user by it", async () => {
    // Fixed emails: the default ones embed a timestamp, which a digits search could match.
    const customer = await createUser({ email: "phone.customer@test.local" })
    await prisma.user.update({ where: { id: customer.id }, data: { phone: "9876543210" } })
    const admin = await createAdmin({ email: "phone.admin@test.local" })

    const detail = await request(app).get(`/admin-api/users/${customer.id}`).set("Authorization", `Bearer ${admin.token}`).expect(200)
    expect(detail.body.data.phone).toBe("9876543210")

    for (const q of ["9876543210", "+91 98765 43210", "98765-43210", "43210"]) {
      const res = await request(app).get(`/admin-api/users?limit=50&q=${encodeURIComponent(q)}`).set("Authorization", `Bearer ${admin.token}`).expect(200)
      expect(res.body.data.map((u: { id: string }) => u.id), `search "${q}"`).toEqual([customer.id])
    }
    // Three digits is not a phone search (it would match half the users).
    const short = await request(app).get("/admin-api/users?limit=50&q=987").set("Authorization", `Bearer ${admin.token}`).expect(200)
    expect(short.body.data.map((u: { id: string }) => u.id)).not.toContain(customer.id)
  })
})
