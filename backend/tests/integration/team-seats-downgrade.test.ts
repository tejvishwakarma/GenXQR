import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { PLAN_LIMITS } from "../../src/services/billing.service.js"
import { createUser, giveSubscription, seedPlans, type TestUser } from "../helpers/factories.js"

/**
 * Seats after a downgrade (decided 24 Oct 2026): members beyond the new plan's
 * seats — the latest to join — are suspended (kept on the team, no access)
 * until the owner upgrades or frees a seat. Before, everyone kept access.
 */
describe("team seats after a downgrade", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should keep the earliest members and suspend the rest", async () => {
    const owner = await createUser()
    await giveSubscription(owner.id, "BUSINESS")
    const team = await prisma.team.create({ data: { ownerId: owner.id, name: "Acme" } })
    const memberSeats = PLAN_LIMITS.PRO.teamSeatsLimit - 1 // the owner takes one
    const members: TestUser[] = []
    for (let i = 0; i < memberSeats + 2; i++) {
      const m = await createUser()
      await prisma.teamMember.create({ data: { teamId: team.id, userId: m.id, role: "VIEWER", joinedAt: new Date(Date.now() - (100 - i) * 60_000) } })
      members.push(m)
    }
    const listAs = (m: TestUser) => request(app).get("/api/qr").set("Authorization", `Bearer ${m.token}`).set("X-Workspace-Id", owner.id)

    for (const m of members) expect((await listAs(m)).status).toBe(200) // Business: everyone fits

    await giveSubscription(owner.id, "PRO")
    for (const [i, m] of members.entries()) {
      expect((await listAs(m)).status, `member ${i + 1}`).toBe(i < memberSeats ? 200 : 403)
    }

    const roster = await request(app).get("/api/team").set("Authorization", `Bearer ${owner.token}`).expect(200)
    const suspended = (roster.body.data.members as Array<{ suspended?: boolean }>).filter((m) => m.suspended)
    expect(suspended).toHaveLength(2)
  })
})
