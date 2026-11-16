import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const sent: Array<{ to: string; subject: string; html: string }> = []
let failNext = false
vi.mock("../../src/services/email.service.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../src/services/email.service.js")>()
  return {
    ...orig,
    sendEmail: vi.fn(async (o: { to: string; subject: string; html: string }) => {
      if (failNext) {
        failNext = false
        throw new Error("provider down")
      }
      sent.push(o)
    }),
  }
})

const { default: app } = await import("../../src/app.js")
const { default: request } = await import("supertest")
const { prisma } = await import("../../src/db/prisma.js")
const { sendOnboardingEmails } = await import("../../src/services/onboarding-email.service.js")
const { checkAndSendRenewalReminders } = await import("../../src/services/renewal-reminder.service.js")
const { PLAN_PRICES_INR } = await import("../../src/services/billing.service.js")
const { createQRCode, createUser, giveSubscription, seedPlans } = await import("../helpers/factories.js")

const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000

/** A 14-day Pro trial that started `daysAgo` days ago. */
async function startTrial(userId: string, daysAgo: number) {
  const pro = await prisma.plan.findUniqueOrThrow({ where: { name: "PRO" } })
  const start = new Date(Date.now() - daysAgo * DAY)
  const end = new Date(start.getTime() + 14 * DAY)
  return prisma.subscription.upsert({
    where: { userId },
    update: { planId: pro.id, status: "TRIALING", trialEndsAt: end, currentPeriodStart: start, currentPeriodEnd: end },
    create: { userId, planId: pro.id, status: "TRIALING", trialEndsAt: end, currentPeriodStart: start, currentPeriodEnd: end },
  })
}

const to = (email: string) => sent.filter((m) => m.to === email)

beforeAll(async () => {
  await seedPlans()
})
beforeEach(() => {
  sent.length = 0
  failNext = false
})

/**
 * Trial onboarding (16 Nov 2026): before this, a new trial account heard nothing
 * between the verification email and the "7 days left" reminder.
 */
describe("trial onboarding emails", () => {
  it("should welcome a new verified trial account once", async () => {
    const user = await createUser()
    await startTrial(user.id, 0.1)
    await sendOnboardingEmails()
    await sendOnboardingEmails() // the next worker run must not repeat it
    expect(to(user.email)).toHaveLength(1)
    expect(to(user.email)[0].subject).toMatch(/Welcome to GenXQR/)
    expect(await prisma.emailLog.count({ where: { userId: user.id, template: "onboarding-welcome" } })).toBe(1)
  })

  it("should not email unverified, opted-out, blocked or team-member accounts", async () => {
    const unverified = await createUser({ emailVerified: false })
    const optedOut = await createUser()
    const blocked = await createUser()
    const member = await createUser()
    const owner = await createUser()
    for (const u of [unverified, optedOut, blocked, member]) await startTrial(u.id, 0.1)
    await prisma.user.update({ where: { id: optedOut.id }, data: { notificationPrefs: { gettingStartedTips: false } } })
    await prisma.blocklist.create({ data: { type: "user", value: blocked.id, reason: "test" } })
    const team = await prisma.team.create({ data: { ownerId: owner.id, name: "Acme" } })
    await prisma.teamMember.create({ data: { teamId: team.id, userId: member.id, role: "EDITOR" } })

    await sendOnboardingEmails()
    for (const u of [unverified, optedOut, blocked, member]) expect(to(u.email), u.email).toHaveLength(0)
  })

  it("should not send a step outside its window, so an old trial is never sent the welcome", async () => {
    const user = await createUser()
    await startTrial(user.id, 3.5) // welcome window is days 0–3
    const qr = await createQRCode(user.id)
    await prisma.qRScan.create({ data: { qrId: qr.id, ip: "203.0.113.9", isUnique: true } }) // so first_code is skipped too
    await sendOnboardingEmails()
    expect(to(user.email)).toHaveLength(0)
    expect(await prisma.limitAlert.count({ where: { userId: user.id } })).toBe(0)
  })

  it("should send the day-2 email by what the account has done", async () => {
    const none = await createUser()
    const noScans = await createUser()
    const active = await createUser()
    for (const u of [none, noScans, active]) await startTrial(u.id, 2.5)
    // Their welcome went out on day 0, outside the 20-hour gap.
    for (const u of [none, noScans, active]) {
      await prisma.limitAlert.create({
        data: { userId: u.id, limitType: "onboarding", threshold: 1, periodKey: (await prisma.subscription.findUniqueOrThrow({ where: { userId: u.id } })).currentPeriodStart.toISOString().slice(0, 10), sentAt: new Date(Date.now() - 2 * DAY) },
      })
    }
    await createQRCode(noScans.id)
    const qr = await createQRCode(active.id)
    await prisma.qRScan.create({ data: { qrId: qr.id, ip: "203.0.113.9", isUnique: true } })

    await sendOnboardingEmails()
    expect(to(none.email)[0]?.subject).toBe("Where to start with your first QR code")
    expect(to(none.email)[0]?.html).toContain("/app/create?type=menu")
    expect(to(noScans.email)[0]?.subject).toBe("Test your QR code before you print it")
    expect(to(active.email)).toHaveLength(0)
    // Not sent and not claimed: nothing is recorded for the active account.
    expect(await prisma.limitAlert.count({ where: { userId: active.id, threshold: 2 } })).toBe(0)
  })

  it("should leave 20 hours between two onboarding emails", async () => {
    const user = await createUser()
    await startTrial(user.id, 2.5) // welcome (until day 3) and first_code (from day 2) both due
    await sendOnboardingEmails()
    expect(to(user.email).map((m) => m.subject)).toEqual([expect.stringMatching(/Welcome/)])

    await sendOnboardingEmails(new Date(Date.now() + 10 * HOUR))
    expect(to(user.email)).toHaveLength(1)
    await sendOnboardingEmails(new Date(Date.now() + 21 * HOUR))
    expect(to(user.email)).toHaveLength(2)
    expect(to(user.email)[1].subject).toBe("Where to start with your first QR code")
  })

  it("should send the day-5 email with the account's numbers and the real plan prices", async () => {
    const user = await createUser()
    const sub = await startTrial(user.id, 5.5)
    for (const t of [1, 2]) {
      await prisma.limitAlert.create({
        data: { userId: user.id, limitType: "onboarding", threshold: t, periodKey: sub.currentPeriodStart.toISOString().slice(0, 10), sentAt: new Date(Date.now() - 3 * DAY) },
      })
    }
    const qr = await createQRCode(user.id)
    await prisma.qRScan.createMany({ data: [1, 2, 3].map(() => ({ qrId: qr.id, ip: "203.0.113.9", isUnique: true })) })

    await sendOnboardingEmails()
    const mail = to(user.email)[0]
    expect(mail.subject).toMatch(/^What to try before your trial ends on /)
    expect(mail.html).toContain("1 QR code")
    expect(mail.html).toContain("3 unique scans")
    expect(mail.html).toContain(`₹${PLAN_PRICES_INR.STARTER.monthly.toLocaleString("en-IN")}`)
    expect(mail.html).toContain(`₹${PLAN_PRICES_INR.PRO.monthly.toLocaleString("en-IN")}`)
  })

  it("should retry a step whose send failed", async () => {
    const user = await createUser()
    await startTrial(user.id, 0.1)
    failNext = true
    await sendOnboardingEmails()
    expect(to(user.email)).toHaveLength(0)
    await sendOnboardingEmails()
    expect(to(user.email)).toHaveLength(1)
  })
})

describe("trial ending reminders", () => {
  it("should use trial wording and suggest Starter when the account fits it", async () => {
    const user = await createUser()
    await startTrial(user.id, 11) // ends in 3 days
    await createQRCode(user.id)
    await checkAndSendRenewalReminders()
    const mail = to(user.email)[0]
    expect(mail.subject).toMatch(/^Your GenXQR trial ends on /)
    expect(mail.html).toContain("Starter fits how you use GenXQR today")
    expect(mail.html).toContain("no card on file")
    expect(mail.html).not.toContain("Renew My Subscription")
  })

  it("should suggest Pro, and say why, when the account uses something Starter lacks", async () => {
    const user = await createUser()
    await startTrial(user.id, 11)
    const qr = await createQRCode(user.id)
    await prisma.smartRoutingRule.create({
      data: { qrId: qr.id, conditionType: "device", conditionValue: { device: "mobile" }, targetUrl: "https://example.com/m", priority: 1 },
    })
    await checkAndSendRenewalReminders()
    const mail = to(user.email)[0]
    expect(mail.html).toContain("Pro keeps everything you use")
    expect(mail.html).toContain("smart routing")
  })

  it("should keep the renewal wording for a paid plan", async () => {
    const user = await createUser()
    await giveSubscription(user.id, "PRO")
    await prisma.subscription.update({ where: { userId: user.id }, data: { currentPeriodEnd: new Date(Date.now() + 3 * DAY) } })
    await checkAndSendRenewalReminders()
    expect(to(user.email)[0]?.subject).toMatch(/plan expires in 3 days/)
  })
})

describe("getting-started tips preference", () => {
  it("should save it, and keep it when an older dashboard sends only the four original keys", async () => {
    const user = await createUser()
    const h = { Authorization: `Bearer ${user.token}` }
    await request(app).patch("/api/auth/preferences").set(h).send({ notifications: { gettingStartedTips: false } }).expect(200)
    const old = { scanMilestoneAlerts: true, weeklyAnalyticsDigest: false, billingReminders: true, productUpdates: true }
    await request(app).patch("/api/auth/preferences").set(h).send({ notifications: old }).expect(200)
    const read = await request(app).get("/api/auth/preferences").set(h)
    expect(read.body.data.notifications).toEqual({ ...old, gettingStartedTips: false })
  })
})
