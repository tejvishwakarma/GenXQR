import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { invalidateBlocklistCache } from "../../src/services/blocklist.service.js"
import { createUser, giveSubscription, seedPlans, type TestUser } from "../helpers/factories.js"

/**
 * Blocklist enforcement on the scan path.
 *
 * The Blocklist table shipped with the admin panel and, until now, nothing
 * outside signup ever read it. An admin blocking an abusive domain recorded the
 * intent and changed nothing — the QR codes pointing there kept redirecting.
 * Moderation looked done in the admin UI while the abuse continued, which is also
 * how a Safe Browsing flag survives a review: the content Google objected to is
 * still one scan away.
 *
 * These tests exist because "the blocklist is enforced" is not a claim worth
 * making from reading the code. Each route through resolveQRScan — plain
 * destination, smart routing rule, A/B variant, and the customer's own fallback —
 * is exercised separately, since each is a different way to reach a redirect.
 */

const BLOCKED_HOST = "malicious-example.test"

describe("blocklist enforcement on scan", () => {
  let user: TestUser
  let apiKeyless: string

  beforeAll(async () => {
    await seedPlans()
  })

  beforeEach(async () => {
    user = await createUser()
    await giveSubscription(user.id, "PRO")
    apiKeyless = user.token
    // The global beforeEach flushes Redis, but the cache is also populated
    // lazily per test — drop it explicitly so a set built before a block was
    // inserted cannot leak into the next assertion.
    await invalidateBlocklistCache()
  })

  async function block(type: "domain" | "user", value: string) {
    await prisma.blocklist.create({ data: { type, value, isActive: true, reason: "test" } })
    await invalidateBlocklistCache()
  }

  /** An INSTAGRAM QR resolves straight to a redirect, so Location is the destination. */
  async function createInstagramQR(username: string) {
    const res = await request(app)
      .post("/api/qr")
      .set("Authorization", `Bearer ${apiKeyless}`)
      .send({ name: "blocklist subject", type: "INSTAGRAM", content: { data: { username } } })
      .expect(201)
    return res.body.data as { id: string; slug: string }
  }

  /** A URL QR, used where the destination has to be an arbitrary host. */
  async function createUrlQR(url: string, extra: Record<string, unknown> = {}) {
    const res = await request(app)
      .post("/api/qr")
      .set("Authorization", `Bearer ${apiKeyless}`)
      .send({ name: "blocklist subject", type: "WHATSAPP", content: { data: { phone: "+911234567890" } }, ...extra })
      .expect(201)
    const qr = res.body.data as { id: string; slug: string }
    // Point a smart route at the URL under test — smart routing wins over content,
    // and takes an arbitrary absolute URL where WHATSAPP content cannot.
    // A time rule spanning the whole day always matches (hour >= 0 && hour < 24),
    // which keeps the test independent of when it runs and of the request's UA.
    // "device" needs a real device value — "any" is not a thing, and a rule that
    // silently fails to match makes the QR fall through to its content URL,
    // which is what a first attempt here did.
    await prisma.smartRoutingRule.create({
      data: { qrId: qr.id, priority: 1, conditionType: "time", conditionValue: { from: 0, to: 24 }, targetUrl: url, isActive: true },
    })
    return qr
  }

  describe("a blocked destination host", () => {
    it("should not redirect to a blocked domain", async () => {
      const qr = await createInstagramQR("someone")
      // instagram.com is the resolved host for an INSTAGRAM code.
      await block("domain", "instagram.com")

      const res = await request(app).get(`/r/${qr.slug}`).expect(302)
      expect(res.headers.location).not.toContain("instagram.com")
      expect(res.headers.location).toContain("reason=blocked")
    })

    it("should still redirect when the blocked domain is a different one", async () => {
      const qr = await createInstagramQR("someone")
      await block("domain", BLOCKED_HOST)

      const res = await request(app).get(`/r/${qr.slug}`).expect(302)
      expect(res.headers.location).toBe("https://instagram.com/someone")
    })

    /**
     * Blocking "evil.com" has to stop "login.evil.com" — otherwise the block is
     * sidestepped in seconds by the same person who earned it.
     */
    it("should block a subdomain of a blocked domain", async () => {
      const qr = await createUrlQR(`https://login.${BLOCKED_HOST}/signin`)
      await block("domain", BLOCKED_HOST)

      const res = await request(app).get(`/r/${qr.slug}`).expect(302)
      expect(res.headers.location).toContain("reason=blocked")
    })

    it("should not block a domain that merely ends with the same letters", async () => {
      // "notmalicious-example.test" must not match "malicious-example.test".
      const qr = await createUrlQR(`https://not${BLOCKED_HOST}/page`)
      await block("domain", BLOCKED_HOST)

      const res = await request(app).get(`/r/${qr.slug}`).expect(302)
      expect(res.headers.location).toBe(`https://not${BLOCKED_HOST}/page`)
    })

    it("should match regardless of scheme, www or case in the blocklist entry", async () => {
      const qr = await createUrlQR(`https://www.${BLOCKED_HOST}/x`)
      // Admins type these by hand; this is the shape a paste produces.
      await block("domain", `HTTPS://WWW.${BLOCKED_HOST.toUpperCase()}/some/path`)

      const res = await request(app).get(`/r/${qr.slug}`).expect(302)
      expect(res.headers.location).toContain("reason=blocked")
    })
  })

  /**
   * Smart routing and A/B variant URLs never pass through QRContent, so a check
   * placed on the content destination alone would miss them entirely — and those
   * are the obvious places to hide a blocked target.
   */
  describe("every route through the resolver", () => {
    it("should block a smart-routing target", async () => {
      const qr = await createUrlQR(`https://${BLOCKED_HOST}/via-smart-routing`)
      await block("domain", BLOCKED_HOST)

      const res = await request(app).get(`/r/${qr.slug}`).expect(302)
      expect(res.headers.location).toContain("reason=blocked")
    })

    it("should block an A/B test variant target", async () => {
      const created = await request(app)
        .post("/api/qr")
        .set("Authorization", `Bearer ${apiKeyless}`)
        .send({ name: "ab subject", type: "WHATSAPP", content: { data: { phone: "+911234567890" } } })
        .expect(201)
      const qr = created.body.data as { id: string; slug: string }

      await prisma.qRCode.update({ where: { id: qr.id }, data: { abTestEnabled: true, abTestSplitPct: 100 } })
      await prisma.aBTestVariant.create({
        data: { qrId: qr.id, name: "blocked variant", targetUrl: `https://${BLOCKED_HOST}/variant`, splitPct: 100 },
      })
      await block("domain", BLOCKED_HOST)

      const res = await request(app).get(`/r/${qr.slug}`).expect(302)
      expect(res.headers.location).toContain("reason=blocked")
    })

    /**
     * fallbackUrl is customer-controlled. Honouring it on a block would let
     * whoever earned the block point the fallback at the same destination and
     * carry on serving it.
     */
    it("should ignore the customer's fallbackUrl when blocked", async () => {
      const qr = await createUrlQR(`https://${BLOCKED_HOST}/primary`, {
        settings: { fallbackUrl: `https://${BLOCKED_HOST}/fallback` },
      })
      await block("domain", BLOCKED_HOST)

      const res = await request(app).get(`/r/${qr.slug}`).expect(302)
      expect(res.headers.location).not.toContain(BLOCKED_HOST)
      expect(res.headers.location).toContain("reason=blocked")
    })
  })

  describe("a blocked owner", () => {
    it("should take down every code the blocked user owns", async () => {
      const first = await createInstagramQR("one")
      const second = await createInstagramQR("two")
      await block("user", user.id)

      for (const qr of [first, second]) {
        const res = await request(app).get(`/r/${qr.slug}`).expect(302)
        expect(res.headers.location, `${qr.slug} should be blocked`).toContain("reason=blocked")
      }
    })

    it("should leave another account's codes working", async () => {
      const mine = await createInstagramQR("mine")
      const other = await createUser()
      await giveSubscription(other.id, "PRO")
      const theirs = await request(app)
        .post("/api/qr")
        .set("Authorization", `Bearer ${other.token}`)
        .send({ name: "theirs", type: "INSTAGRAM", content: { data: { username: "theirs" } } })
        .expect(201)

      await block("user", user.id)

      expect((await request(app).get(`/r/${mine.slug}`).expect(302)).headers.location).toContain("reason=blocked")
      expect((await request(app).get(`/r/${theirs.body.data.slug}`).expect(302)).headers.location)
        .toBe("https://instagram.com/theirs")
    })

    /**
     * Owner blocking sits ahead of the destination checks so it covers landing
     * pages too — most QR types render one instead of redirecting, and those would
     * otherwise stay reachable for a banned account.
     */
    it("should block a landing-page type, not just direct redirects", async () => {
      const created = await request(app)
        .post("/api/qr")
        .set("Authorization", `Bearer ${apiKeyless}`)
        .send({ name: "landing", type: "URL", content: { data: { url: "https://example.com/ok" } } })
        .expect(201)
      const slug = created.body.data.slug as string

      // Confirm it lands normally first, so the assertion below means something.
      expect((await request(app).get(`/r/${slug}`).expect(302)).headers.location).toContain(`/l/${slug}`)

      await block("user", user.id)
      expect((await request(app).get(`/r/${slug}`).expect(302)).headers.location).toContain("reason=blocked")
    })
  })

  describe("lifting a block", () => {
    it("should restore the redirect once the entry is deactivated", async () => {
      const qr = await createInstagramQR("someone")
      await block("domain", "instagram.com")
      expect((await request(app).get(`/r/${qr.slug}`).expect(302)).headers.location).toContain("reason=blocked")

      await prisma.blocklist.updateMany({ where: { value: "instagram.com" }, data: { isActive: false } })
      await invalidateBlocklistCache()

      expect((await request(app).get(`/r/${qr.slug}`).expect(302)).headers.location)
        .toBe("https://instagram.com/someone")
    })

    it("should ignore an entry that is already inactive", async () => {
      const qr = await createInstagramQR("someone")
      await prisma.blocklist.create({
        data: { type: "domain", value: "instagram.com", isActive: false, reason: "lifted" },
      })
      await invalidateBlocklistCache()

      expect((await request(app).get(`/r/${qr.slug}`).expect(302)).headers.location)
        .toBe("https://instagram.com/someone")
    })
  })
})
