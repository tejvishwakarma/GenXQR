import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { redis } from "../../src/redis/client.js"
import { getScanQuota, scanUsageWindow } from "../../src/services/scan-quota.service.js"
import { enforceSubscriptionExpiry, historyDeletionDate } from "../../src/services/subscription-expiry.service.js"
import { maybeSendScanMilestone, sendWeeklyDigests, startOfIstWeek } from "../../src/services/engagement-email.service.js"
import { checkAndSendRenewalReminders } from "../../src/services/renewal-reminder.service.js"
import { sendBroadcast } from "../../src/services/admin-moderation.service.js"
import { readPrefs } from "../../src/utils/notification-prefs.util.js"
import { createQRCode, createUser, giveSubscription, seedPlans } from "../helpers/factories.js"

/**
 * Decisions of 18 Oct 2026:
 *  - monthly scan limits are ENFORCED, in a monthly window anchored on the
 *    plan's start date;
 *  - scan history is kept while subscribed and 3 months after the plan ends;
 *  - the notification toggles are honoured (and actually saved).
 */

const DAY = 86_400_000
const OFF = { scanMilestoneAlerts: false, weeklyAnalyticsDigest: false, billingReminders: false, productUpdates: false }

describe("monthly scan quota", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should anchor windows on the plan start, clamping short months", () => {
    const anchor = new Date("2026-01-31T10:00:00Z")
    const w = scanUsageWindow(anchor, new Date("2026-03-05T00:00:00Z"))
    expect(w.start.toISOString()).toBe("2026-02-28T10:00:00.000Z")
    expect(w.end.toISOString()).toBe("2026-03-31T10:00:00.000Z")
    const first = scanUsageWindow(anchor, new Date("2026-02-01T00:00:00Z"))
    expect(first.start.toISOString()).toBe("2026-01-31T10:00:00.000Z")
  })

  it("should block scans once the account reaches its monthly limit, and report usage", async () => {
    const user = await createUser()
    await giveSubscription(user.id, "STARTER") // 5,000 scans / month
    const qr = await createQRCode(user.id)

    const ok = await request(app).get(`/r/${qr.slug}`)
    expect(ok.headers["location"] ?? "").not.toContain("reason=limit")

    const quota = await getScanQuota(user.id)
    const key = `scanquota:count:${user.id}:${quota.windowStart.getTime()}`
    // The first scan is counted in the background after its redirect; wait for
    // it so it cannot land on top of the value set below.
    for (let i = 0; i < 50 && (await redis.get(key)) !== "1"; i++) await new Promise((r) => setTimeout(r, 50))
    expect(await redis.get(key)).toBe("1")
    await redis.set(key, "5000")

    const blocked = await request(app).get(`/r/${qr.slug}`)
    expect(blocked.status).toBe(302)
    expect(blocked.headers["location"]).toContain("reason=limit")

    const usage = await request(app).get("/api/billing/usage").set("Authorization", `Bearer ${user.token}`)
    expect(usage.body.data.scans.used).toBe(5000)
    expect(usage.body.data.scans.limit).toBe(5000)
    expect(new Date(usage.body.data.scans.resetsAt).getTime()).toBe(quota.windowEnd.getTime())
  })

  it("should not enforce a zero (FREE) limit — expiry handles those accounts", async () => {
    const user = await createUser()
    await giveSubscription(user.id, "FREE")
    const qr = await createQRCode(user.id)
    const res = await request(app).get(`/r/${qr.slug}`)
    expect(res.headers["location"] ?? "").not.toContain("reason=limit")
  })
})

describe("scan history retention", () => {
  async function lapsedWithScans(lapsedAgoDays: number) {
    const user = await createUser()
    await giveSubscription(user.id, "FREE")
    await prisma.subscription.update({ where: { userId: user.id }, data: { lapsedAt: new Date(Date.now() - lapsedAgoDays * DAY) } })
    const qr = await createQRCode(user.id)
    await prisma.qRScan.create({ data: { qrId: qr.id, ip: "203.0.113.9" } })
    await prisma.qRCode.update({ where: { id: qr.id }, data: { scanCount: 1, uniqueScanCount: 1 } })
    return { user, qr }
  }

  it("should delete scan history 3 months after the plan ended, keeping the code", async () => {
    const { qr } = await lapsedWithScans(100)
    await enforceSubscriptionExpiry()
    expect(await prisma.qRScan.count({ where: { qrId: qr.id } })).toBe(0)
    const code = await prisma.qRCode.findUniqueOrThrow({ where: { id: qr.id } })
    expect(code.scanCount).toBe(0)
  })

  it("should keep history inside the 3 months", async () => {
    const { qr } = await lapsedWithScans(60)
    await enforceSubscriptionExpiry()
    expect(await prisma.qRScan.count({ where: { qrId: qr.id } })).toBe(1)
  })

  it("should start the clock when a paid plan expires", async () => {
    const user = await createUser()
    await giveSubscription(user.id, "PRO")
    await prisma.subscription.update({ where: { userId: user.id }, data: { currentPeriodEnd: new Date(Date.now() - 60_000) } })
    await enforceSubscriptionExpiry()
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } })
    expect(sub.lapsedAt).not.toBeNull()
    expect(historyDeletionDate(sub.lapsedAt!).getTime()).toBeGreaterThan(Date.now() + 80 * DAY)
  })
})

describe("notification preferences", () => {
  it("should save and read back preferences (they used to always read as defaults)", async () => {
    const user = await createUser()
    const h = { Authorization: `Bearer ${user.token}` }
    const save = await request(app).patch("/api/auth/preferences").set(h).send({ notifications: OFF })
    expect(save.status).toBe(200)
    const read = await request(app).get("/api/auth/preferences").set(h)
    expect(read.body.data.notifications).toEqual(OFF)
  })

  it("should recover preferences stored under the old JSON-string format", () => {
    expect(readPrefs(JSON.stringify(OFF))).toEqual(OFF)
    expect(readPrefs(null).weeklyAnalyticsDigest).toBe(true)
  })

  it("should send a scan milestone once, and not when opted out", async () => {
    const user = await createUser()
    const qr = await createQRCode(user.id)
    await maybeSendScanMilestone(qr.id, 99)
    await maybeSendScanMilestone(qr.id, 100)
    await maybeSendScanMilestone(qr.id, 100) // retried job: no second email
    expect(await prisma.limitAlert.count({ where: { userId: user.id, limitType: "scan_milestone" } })).toBe(1)

    const quiet = await createUser()
    await prisma.user.update({ where: { id: quiet.id }, data: { notificationPrefs: OFF } })
    const qr2 = await createQRCode(quiet.id)
    await maybeSendScanMilestone(qr2.id, 100)
    expect(await prisma.limitAlert.count({ where: { userId: quiet.id } })).toBe(0)
  })

  it("should compute the IST week start (Monday 00:00 IST)", () => {
    // Wednesday 2026-10-21 10:00 IST = 04:30Z → Monday 2026-10-19 00:00 IST = 2026-10-18T18:30Z
    expect(startOfIstWeek(new Date("2026-10-21T04:30:00Z")).toISOString()).toBe("2026-10-18T18:30:00.000Z")
    // Sunday 23:00 IST still belongs to the week that began the previous Monday.
    expect(startOfIstWeek(new Date("2026-10-25T17:30:00Z")).toISOString()).toBe("2026-10-18T18:30:00.000Z")
  })

  it("should send the weekly digest to opted-in owners with scans last week", async () => {
    const now = new Date()
    const lastWeek = new Date(startOfIstWeek(now).getTime() - 3 * DAY)

    const keen = await createUser()
    const quiet = await createUser()
    await prisma.user.update({ where: { id: quiet.id }, data: { notificationPrefs: OFF } })
    for (const u of [keen, quiet]) {
      const qr = await createQRCode(u.id)
      await prisma.qRScan.create({ data: { qrId: qr.id, ip: "203.0.113.10", scannedAt: lastWeek, isUnique: true } })
    }

    await sendWeeklyDigests(now)

    expect(await prisma.limitAlert.count({ where: { userId: keen.id, limitType: "weekly_digest" } })).toBe(1)
    expect(await prisma.limitAlert.count({ where: { userId: quiet.id, limitType: "weekly_digest" } })).toBe(0)
  })

  it("should skip advance billing reminders when opted out", async () => {
    const make = async (prefs?: typeof OFF) => {
      const u = await createUser()
      await giveSubscription(u.id, "PRO")
      await prisma.subscription.update({ where: { userId: u.id }, data: { currentPeriodEnd: new Date(Date.now() + 7 * DAY) } })
      if (prefs) await prisma.user.update({ where: { id: u.id }, data: { notificationPrefs: prefs } })
      return u
    }
    const keen = await make()
    const quiet = await make(OFF)

    await checkAndSendRenewalReminders()

    expect(await prisma.renewalReminder.count({ where: { userId: keen.id } })).toBe(1)
    expect(await prisma.renewalReminder.count({ where: { userId: quiet.id } })).toBe(0)
  })

  it("should target broadcast segments by plan and honour the product-updates opt-out", async () => {
    const paid = await createUser()
    await giveSubscription(paid.id, "PRO")
    const paidQuiet = await createUser()
    await giveSubscription(paidQuiet.id, "PRO")
    await prisma.user.update({ where: { id: paidQuiet.id }, data: { notificationPrefs: OFF } })
    const free = await createUser()
    await giveSubscription(free.id, "FREE")

    await sendBroadcast("SUPER_ADMIN", { subject: "News", body: "Hello", segment: "paid", bodyFormat: "text" })
    const sentTo = (await prisma.emailLog.findMany({ where: { template: "broadcast" }, select: { to: true } })).map((r) => r.to)
    expect(sentTo).toContain(paid.email)
    expect(sentTo).not.toContain(paidQuiet.email)
    expect(sentTo).not.toContain(free.email)
  })
})

describe("webhook signing secret", () => {
  it("should be revealed to the owner only", async () => {
    const owner = await createUser()
    await giveSubscription(owner.id, "PRO")
    const create = await request(app)
      .post("/api/webhooks")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ name: "hook", url: "https://example.com/hook", events: ["qr.created"] })
    expect(create.status).toBe(201)
    expect(create.body.data.secret).toMatch(/^[0-9a-f]{48}$/)

    const reveal = await request(app)
      .get(`/api/webhooks/${create.body.data.id}/secret`)
      .set("Authorization", `Bearer ${owner.token}`)
    expect(reveal.body.data.secret).toBe(create.body.data.secret)

    const other = await createUser()
    await giveSubscription(other.id, "PRO")
    const denied = await request(app)
      .get(`/api/webhooks/${create.body.data.id}/secret`)
      .set("Authorization", `Bearer ${other.token}`)
    expect(denied.status).toBe(404)
  })
})
