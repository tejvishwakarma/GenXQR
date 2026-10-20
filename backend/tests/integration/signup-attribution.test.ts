import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { handleGoogleOAuth } from "../../src/services/auth.service.js"
import { parseAttribution } from "../../src/utils/attribution.util.js"
import { createAdmin, createUser, seedPlans } from "../helpers/factories.js"

/**
 * First-touch sign-up attribution.
 *
 * The playbook's question is "which channel brings sign-ups that PAY". These
 * pin the parts that make the answer trustworthy: the source is derived on the
 * server, missing data is "not recorded" rather than "direct", existing accounts
 * are never re-attributed, and "paid" means a paid invoice.
 */

const recentIso = () => new Date(Date.now() - 60_000).toISOString()

describe("signup attribution", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  describe("parseAttribution", () => {
    it("should derive the source from utm_source first", () => {
      const a = parseAttribution({ utmSource: "Instagram", utmCampaign: "Menu-Reel", referrer: "l.instagram.com", landingPath: "/pricing", at: recentIso() })
      expect(a?.signupSource).toBe("instagram")
      expect(a?.signupCampaign).toBe("menu-reel")
      expect(a?.signupReferrer).toBe("l.instagram.com")
    })

    it("should fall back to the referrer host, then to direct", () => {
      expect(parseAttribution({ referrer: "www.google.com", landingPath: "/" })?.signupSource).toBe("www.google.com")
      expect(parseAttribution({ landingPath: "/" })?.signupSource).toBe("direct")
    })

    it("should return null for absent or malformed input, never throw", () => {
      expect(parseAttribution(undefined)).toBeNull()
      expect(parseAttribution(null)).toBeNull()
      expect(parseAttribution("instagram")).toBeNull()
      expect(parseAttribution({ utmSource: "x".repeat(201) })).toBeNull()
    })

    it("should drop a referrer that is not a bare hostname", () => {
      const a = parseAttribution({ referrer: "https://evil.example/path?q=1" })
      expect(a?.signupReferrer).toBeNull()
      expect(a?.signupSource).toBe("direct")
    })

    it("should strip query strings from the landing path and reject off-site paths", () => {
      expect(parseAttribution({ landingPath: "/blog?utm_source=x#top" })?.signupLandingPath).toBe("/blog")
      expect(parseAttribution({ landingPath: "//evil.example" })?.signupLandingPath).toBeNull()
    })

    it("should only keep a first-touch time in the last 90 days", () => {
      expect(parseAttribution({ at: recentIso() })?.firstTouchAt).toBeInstanceOf(Date)
      expect(parseAttribution({ at: new Date(Date.now() + 86_400_000).toISOString() })?.firstTouchAt).toBeNull()
      expect(parseAttribution({ at: "2020-01-01T00:00:00.000Z" })?.firstTouchAt).toBeNull()
      expect(parseAttribution({ at: "not a date" })?.firstTouchAt).toBeNull()
    })
  })

  describe("POST /api/auth/register", () => {
    it("should store attribution on the new account", async () => {
      const email = `attr.${Date.now()}@test.local`
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          name: "Attr Test",
          email,
          password: "TestPass123!",
          attribution: { utmSource: "linkedin", utmMedium: "social", utmCampaign: "founder-post", landingPath: "/pricing", at: recentIso() },
        })
      expect(res.status).toBe(201)

      const user = await prisma.user.findUniqueOrThrow({ where: { email } })
      expect(user.signupSource).toBe("linkedin")
      expect(user.signupMedium).toBe("social")
      expect(user.signupCampaign).toBe("founder-post")
      expect(user.signupLandingPath).toBe("/pricing")
    })

    it("should still register when attribution is missing or junk, recording nothing", async () => {
      const email = `noattr.${Date.now()}@test.local`
      const res = await request(app)
        .post("/api/auth/register")
        .send({ name: "No Attr", email, password: "TestPass123!", attribution: "garbage" })
      expect(res.status).toBe(201)

      const user = await prisma.user.findUniqueOrThrow({ where: { email } })
      // Not recorded is NOT the same as direct.
      expect(user.signupSource).toBeNull()
    })
  })

  describe("Google sign-in", () => {
    const attribution = parseAttribution({ utmSource: "youtube", landingPath: "/generate", at: recentIso() })

    it("should attribute an account it creates", async () => {
      const email = `g.new.${Date.now()}@test.local`
      await handleGoogleOAuth({ id: `g-${Date.now()}`, email, name: "G New" }, "127.0.0.1", attribution)
      const user = await prisma.user.findUniqueOrThrow({ where: { email } })
      expect(user.signupSource).toBe("youtube")
    })

    it("should never re-attribute an existing account on login", async () => {
      const existing = await createUser()
      await handleGoogleOAuth({ id: `g-${Date.now()}-x`, email: existing.email, name: existing.name }, "127.0.0.1", attribution)
      const user = await prisma.user.findUniqueOrThrow({ where: { id: existing.id } })
      expect(user.signupSource).toBeNull()
    })
  })

  describe("GET /admin-api/analytics/signup-sources", () => {
    it("should count paid users by paid invoices and report unattributed accounts separately", async () => {
      const admin = await createAdmin()
      const paying = await createUser()
      const free = await createUser()
      await createUser() // no attribution at all
      await prisma.user.update({ where: { id: paying.id }, data: { signupSource: "instagram" } })
      await prisma.user.update({ where: { id: free.id }, data: { signupSource: "instagram" } })

      const plan = await prisma.plan.findUniqueOrThrow({ where: { name: "STARTER" } })
      const now = new Date()
      const sub = await prisma.subscription.create({
        data: { userId: paying.id, planId: plan.id, status: "ACTIVE", currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000) },
      })
      await prisma.invoice.create({
        data: { userId: paying.id, subscriptionId: sub.id, amount: 29_900, status: "paid", planName: "STARTER", billingCycle: "monthly", periodStart: now, periodEnd: sub.currentPeriodEnd },
      })
      // A failed payment must not count as paid.
      await prisma.invoice.create({
        data: { userId: free.id, subscriptionId: sub.id, amount: 29_900, status: "failed", planName: "STARTER", billingCycle: "monthly", periodStart: now, periodEnd: sub.currentPeriodEnd },
      })

      const res = await request(app)
        .get("/admin-api/analytics/signup-sources?days=30")
        .set("Authorization", `Bearer ${admin.token}`)
      expect(res.status).toBe(200)

      const rows = res.body.data.rows as { key: string; signups: number; paidUsers: number; revenue: number }[]
      expect(rows.find((r) => r.key === "instagram")).toEqual({ key: "instagram", signups: 2, paidUsers: 1, revenue: 299 })
      // admin + the unattributed user
      expect(rows.find((r) => r.key === "(not recorded)")?.signups).toBe(2)
    })

    it("should refuse non-admins", async () => {
      const user = await createUser()
      const res = await request(app)
        .get("/admin-api/analytics/signup-sources")
        .set("Authorization", `Bearer ${user.token}`)
      expect(res.status).toBe(403)
    })
  })
})
