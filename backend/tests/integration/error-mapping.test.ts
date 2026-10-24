import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { createUser, giveSubscription, seedPlans } from "../helpers/factories.js"

/** Small bugs from the 23 Oct 2026 audit: wrong status codes and a dead route. */
describe("error mapping and routing", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should answer malformed JSON with 400, not 500", async () => {
    const res = await request(app).post("/api/auth/login").set("Content-Type", "application/json").send("{not json")
    expect(res.status).toBe(400)
  })

  it("should answer a body over the size limit with 413", async () => {
    const res = await request(app).post("/api/auth/login").set("Content-Type", "application/json").send(JSON.stringify({ email: "a".repeat(2 * 1024 * 1024) }))
    expect(res.status).toBe(413)
  })

  it("should answer smart-routing requests for someone else's code with 404, not 500", async () => {
    const user = await createUser()
    await giveSubscription(user.id, "PRO")
    const res = await request(app).get("/api/qr/does-not-exist/smart-routes").set("Authorization", `Bearer ${user.token}`)
    expect(res.status).toBe(404)
  })

  it("should clear read notifications (the route used to be shadowed by /:id)", async () => {
    const user = await createUser()
    await prisma.notification.createMany({
      data: [
        { userId: user.id, title: "a", body: "a", isRead: true },
        { userId: user.id, title: "b", body: "b", isRead: false },
      ],
    })
    const res = await request(app).delete("/api/notifications/clear-read").set("Authorization", `Bearer ${user.token}`).expect(200)
    expect(res.body.data.deleted).toBe(1)
    expect(await prisma.notification.count({ where: { userId: user.id } })).toBe(1)
  })
})
