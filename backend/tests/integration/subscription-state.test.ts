import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import {
  STATE_FIELDS, SUBSCRIPTION_STATES, subscriptionState, subscriptionStateWhere, type SubscriptionStateKey,
} from "../../src/services/subscription-state.js"
import { createAdmin, createUser, seedPlans } from "../helpers/factories.js"

/**
 * The admin panel shows what a subscription is doing, not the raw status
 * column (24 Oct 2026): an expired plan becomes FREE with status ACTIVE, so
 * "ACTIVE" said nothing. The list filter and the label must agree.
 */

const DAY = 86_400_000

beforeAll(async () => {
  await seedPlans()
})

type Fixture = {
  name: string
  plan: "FREE" | "PRO"
  status: "ACTIVE" | "TRIALING" | "PAST_DUE"
  trialEndsAt?: number | null // days from now
  periodEnd: number
  cancel?: boolean
  pauseAt?: number | null
  lapsedAt?: number | null
  expect: SubscriptionStateKey
}

const FIXTURES: Fixture[] = [
  { name: "trial running", plan: "PRO", status: "TRIALING", trialEndsAt: 5, periodEnd: 5, expect: "trial" },
  { name: "trial without trialEndsAt, running", plan: "PRO", status: "TRIALING", trialEndsAt: null, periodEnd: 3, expect: "trial" },
  { name: "trial ended", plan: "PRO", status: "TRIALING", trialEndsAt: -1, periodEnd: -1, expect: "ending" },
  { name: "trial ended, notice running", plan: "PRO", status: "TRIALING", trialEndsAt: -10, periodEnd: -10, pauseAt: 3, expect: "notice" },
  { name: "paid running", plan: "PRO", status: "ACTIVE", periodEnd: 20, expect: "paid" },
  { name: "paid, cancelled at period end", plan: "PRO", status: "ACTIVE", periodEnd: 20, cancel: true, expect: "cancelling" },
  { name: "paid ended", plan: "PRO", status: "ACTIVE", periodEnd: -2, expect: "ending" },
  { name: "paid ended, cancelled", plan: "PRO", status: "ACTIVE", periodEnd: -2, cancel: true, expect: "ending" },
  { name: "paid ended, notice running", plan: "PRO", status: "ACTIVE", periodEnd: -30, pauseAt: 2, expect: "notice" },
  { name: "paid ended, notice over", plan: "PRO", status: "ACTIVE", periodEnd: -30, pauseAt: -1, expect: "ending" },
  { name: "free after a plan", plan: "FREE", status: "ACTIVE", periodEnd: 30, lapsedAt: -40, expect: "free" },
  { name: "free, never lapsed", plan: "FREE", status: "ACTIVE", periodEnd: 30, expect: "free" },
  { name: "a status the app never writes", plan: "PRO", status: "PAST_DUE", periodEnd: 10, expect: "other" },
]

async function seed(now: number) {
  const plans = Object.fromEntries((await prisma.plan.findMany()).map((p) => [p.name, p.id]))
  const at = (d: number | null | undefined) => (d === null || d === undefined ? null : new Date(now + d * DAY))
  const ids: Record<string, string> = {}
  for (const f of FIXTURES) {
    const u = await createUser()
    const sub = await prisma.subscription.create({
      data: {
        userId: u.id, planId: plans[f.plan]!, status: f.status,
        trialEndsAt: at(f.trialEndsAt), currentPeriodStart: new Date(now - 30 * DAY), currentPeriodEnd: at(f.periodEnd)!,
        cancelAtPeriodEnd: f.cancel ?? false, codesPauseAt: at(f.pauseAt), lapsedAt: at(f.lapsedAt),
      },
    })
    ids[f.name] = sub.id
  }
  return ids
}

describe("subscription state", () => {
  it("should put every subscription in the state its dates say, and filter exactly those rows", async () => {
    const now = new Date()
    const ids = await seed(now.getTime())
    const rows = await prisma.subscription.findMany({ where: { id: { in: Object.values(ids) } }, select: { id: true, ...STATE_FIELDS } })
    const byId = new Map(rows.map((r) => [r.id, r]))

    for (const f of FIXTURES) {
      expect(subscriptionState(byId.get(ids[f.name]!)!, now).key, f.name).toBe(f.expect)
    }
    for (const key of SUBSCRIPTION_STATES) {
      const filtered = await prisma.subscription.findMany({
        where: { AND: [{ id: { in: Object.values(ids) } }, subscriptionStateWhere(key, now)] },
        select: { id: true },
      })
      const expected = FIXTURES.filter((f) => f.expect === key).map((f) => ids[f.name]).sort()
      expect(filtered.map((r) => r.id).sort(), `filter "${key}" disagrees with the label`).toEqual(expected)
    }
  })

  it("should count only paid plans in force as active subscriptions on the dashboard", async () => {
    await seed(Date.now())
    const admin = await createAdmin()
    const res = await request(app).get("/admin-api/dashboard").set("Authorization", `Bearer ${admin.token}`).expect(200)
    // paid running + cancelled-at-period-end; not free, trials, lapsed or other.
    expect(res.body.data.activeSubscriptions).toBe(2)
    expect(res.body.data.trialSubscriptions).toBe(2)
  })

  it("should filter the subscriptions list by state and label every row", async () => {
    const ids = await seed(Date.now())
    const admin = await createAdmin()
    const get = (q: string) => request(app).get(`/admin-api/subscriptions?limit=100${q}`).set("Authorization", `Bearer ${admin.token}`)

    const ending = await get("&state=ending").expect(200)
    expect(ending.body.data.map((s: { id: string }) => s.id).sort()).toEqual(
      ["trial ended", "paid ended", "paid ended, cancelled", "paid ended, notice over"].map((n) => ids[n]).sort(),
    )
    const all = await get("").expect(200)
    const row = all.body.data.find((s: { id: string }) => s.id === ids["paid ended, notice running"])
    expect(row.state).toMatchObject({ key: "notice", wasTrial: false })
    await get("&state=PAST_DUE").expect(422)
  })

  it("should expire a lapsed plan when an admin opens the user, instead of showing it as running", async () => {
    const admin = await createAdmin()
    const user = await createUser()
    const pro = await prisma.plan.findUniqueOrThrow({ where: { name: "PRO" } })
    await prisma.subscription.create({ data: { userId: user.id, planId: pro.id, status: "ACTIVE", currentPeriodStart: new Date(Date.now() - 31 * DAY), currentPeriodEnd: new Date(Date.now() - DAY) } })

    const res = await request(app).get(`/admin-api/users/${user.id}`).set("Authorization", `Bearer ${admin.token}`).expect(200)
    expect(res.body.data.subscription.plan.name).toBe("FREE")
    expect(res.body.data.subscription.state.key).toBe("free")
    expect(res.body.data.subscription.state.date).not.toBeNull() // lapsedAt: when it ended

    const list = await request(app).get("/admin-api/users?limit=100").set("Authorization", `Bearer ${admin.token}`).expect(200)
    expect(list.body.data.find((u: { id: string }) => u.id === user.id).subscription.state.key).toBe("free")
  })
})
