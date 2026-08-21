import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { createApiKey } from "../../src/services/apikeys.service.js"
import { createUser, giveSubscription, seedPlans, type TestUser } from "../helpers/factories.js"

/**
 * The /v1 developer API — the surface the Zapier, Make and n8n integrations call.
 *
 * It had no automated coverage at all, which is how a much larger failure went
 * unnoticed for months: production nginx proxied /api/, /admin-api/ and /r/<slug>
 * but never /v1/, so every developer-API request fell through to the SPA fallback
 * and answered 200 with index.html. Nothing 502'd and nothing 404'd — the API
 * looked alive and returned HTML — so all three published integrations were dead
 * while appearing configured correctly.
 *
 * These tests cannot see an nginx mistake. What they can do is pin the contract
 * the integrations depend on, so a future change to auth, filtering or validation
 * fails here rather than in a customer's Zap.
 */

/** Mints a real API key row and returns the raw key, as the dashboard would. */
async function keyFor(user: TestUser): Promise<string> {
  const { rawKey } = await createApiKey(user.id, "test key")
  return rawKey
}

describe("/v1 developer API", () => {
  let user: TestUser
  let apiKey: string

  // `plans` is in PRESERVED_TABLES, so seeding it once per file is enough.
  beforeAll(async () => {
    await seedPlans()
  })

  // Everything else must be per-test: tests/setup.ts registers a global
  // beforeEach that TRUNCATEs every other table, and setup-file hooks run before
  // file-level ones — so a fixture built in beforeAll is deleted before the first
  // assertion and every authenticated call comes back 401.
  beforeEach(async () => {
    user = await createUser()
    await giveSubscription(user.id, "PRO")
    apiKey = await keyFor(user)
  })

  /**
   * The two auth surfaces must stay distinguishable by their error text.
   *
   * This is not cosmetic. A user hit /api/qr with an API key, got back
   * "Invalid or expired access token", concluded from it that GenXQR rejects API
   * keys on every protected route, and rebuilt their whole integration around
   * logging in with an email and password instead. The message is the only clue
   * available from outside that says which middleware answered, so if these two
   * strings ever converge, that debugging dead end reopens.
   */
  describe("auth surface separation", () => {
    it("should reject a request with no credentials, naming the API key scheme", async () => {
      const res = await request(app).get("/v1/qr")
      expect(res.status).toBe(401)
      expect(res.body.error).toMatch(/API key/i)
    })

    it("should reject a JWT access token on /v1, which is the API key surface", async () => {
      const res = await request(app).get("/v1/qr").set("Authorization", `Bearer ${user.token}`)
      expect(res.status).toBe(401)
      expect(res.body.error).toMatch(/API key/i)
    })

    it("should reject an API key on /api, which is the JWT surface", async () => {
      const res = await request(app).get("/api/qr").set("Authorization", `Bearer ${apiKey}`)
      expect(res.status).toBe(401)
      // Deliberately asserted as the *other* message: the difference is the signal.
      expect(res.body.error).toMatch(/access token/i)
    })

    it("should accept a valid API key on /v1", async () => {
      const res = await request(app).get("/v1/qr").set("Authorization", `Bearer ${apiKey}`)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data)).toBe(true)
    })

    it("should reject a well-formed but unknown API key", async () => {
      const res = await request(app)
        .get("/v1/qr")
        .set("Authorization", "Bearer nxqr_live_0000000000000000000000000000000000000000000000000000000000000000")
      expect(res.status).toBe(401)
    })
  })

  /**
   * Create bodies exactly as the integrations build them. Zapier splits a
   * comma-separated string into an array; Make collects an array parameter.
   */
  describe("POST /v1/qr — the shape the integrations send", () => {
    it("should create a QR from the body Zapier and Make build", async () => {
      const res = await request(app)
        .post("/v1/qr")
        .set("Authorization", `Bearer ${apiKey}`)
        .send({
          name: "integration create",
          type: "URL",
          category: "DYNAMIC",
          tags: ["zapier", "make"],
          content: { data: { url: "https://example.com/dest" } },
        })
      expect(res.status).toBe(201)
      expect(res.body.data.slug).toBeTruthy()
      expect(res.body.data.category).toBe("DYNAMIC")
    })

    /**
     * Make's create module declared its tags parameter with an ARRAY spec, which
     * makes each item a collection ({value:"x"}) rather than a primitive, and sent
     * that straight through. Confirmed against production: 422. Pinned here so a
     * future edit to the parameter spec cannot quietly reintroduce it.
     */
    it("should reject tags sent as collections rather than strings", async () => {
      const res = await request(app)
        .post("/v1/qr")
        .set("Authorization", `Bearer ${apiKey}`)
        .send({
          name: "collection tags",
          type: "URL",
          category: "DYNAMIC",
          tags: [{ value: "nope" }],
          content: { data: { url: "https://example.com/dest" } },
        })
      expect(res.status).toBe(422)
    })

    it("should default category to DYNAMIC when the caller omits it", async () => {
      const res = await request(app)
        .post("/v1/qr")
        .set("Authorization", `Bearer ${apiKey}`)
        .send({
          name: "no category",
          type: "URL",
          content: { data: { url: "https://example.com/dest" } },
        })
      expect(res.status).toBe(201)
      expect(res.body.data.category).toBe("DYNAMIC")
    })
  })

  /**
   * The list filter. `type` was parsed by the route's own schema and then never
   * passed to listQRs, so the filter was accepted and silently ignored — a wrong
   * answer rather than an error, which is the hardest kind for a caller to notice.
   */
  describe("GET /v1/qr — filtering", () => {
    let filterUser: TestUser
    let filterKey: string

    // Runs after the outer beforeEach, so the truncate has already happened.
    beforeEach(async () => {
      filterUser = await createUser()
      await giveSubscription(filterUser.id, "PRO")
      filterKey = await keyFor(filterUser)

      for (const type of ["URL", "WHATSAPP"] as const) {
        await request(app)
          .post("/v1/qr")
          .set("Authorization", `Bearer ${filterKey}`)
          .send({
            name: `${type} code`,
            type,
            category: "DYNAMIC",
            content: { data: type === "URL" ? { url: "https://example.com" } : { phone: "+911234567890" } },
          })
          .expect(201)
      }
    })

    it("should return every QR when no type filter is given", async () => {
      const res = await request(app).get("/v1/qr").set("Authorization", `Bearer ${filterKey}`)
      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(2)
    })

    it("should return only matching QRs when filtering by type", async () => {
      const res = await request(app).get("/v1/qr?type=WHATSAPP").set("Authorization", `Bearer ${filterKey}`)
      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].type).toBe("WHATSAPP")
    })

    it("should reject an unknown type with 422 rather than passing it to Prisma", async () => {
      const res = await request(app).get("/v1/qr?type=NOT_A_TYPE").set("Authorization", `Bearer ${filterKey}`)
      expect(res.status).toBe(422)
    })

    it("should never return another account's QR codes", async () => {
      const res = await request(app).get("/v1/qr").set("Authorization", `Bearer ${apiKey}`)
      expect(res.status).toBe(200)
      const ids: string[] = res.body.data.map((q: { userId?: string; id: string }) => q.id)
      const others = await request(app).get("/v1/qr").set("Authorization", `Bearer ${filterKey}`)
      const otherIds: string[] = others.body.data.map((q: { id: string }) => q.id)
      expect(ids.filter((id) => otherIds.includes(id))).toHaveLength(0)
    })
  })

  /**
   * REST Hook lifecycle. Zapier's triggers/common.ts and every Make webhook's
   * attach.imljson post this body; the four event names are hardcoded in all
   * three integrations, so the accepted set is part of their contract.
   */
  describe("webhook subscribe/unsubscribe", () => {
    it("should subscribe to each event the integrations hardcode", async () => {
      for (const event of ["qr.created", "qr.updated", "qr.deleted", "qr.scanned"]) {
        const res = await request(app)
          .post("/v1/webhooks")
          .set("Authorization", `Bearer ${apiKey}`)
          .send({ url: "https://example.com/hook", event, source: "zapier", name: `test — ${event}` })
        expect(res.status, `event ${event} must be accepted`).toBe(201)

        const del = await request(app)
          .delete(`/v1/webhooks/${res.body.data.id}`)
          .set("Authorization", `Bearer ${apiKey}`)
        expect(del.status).toBe(204)
      }
    })

    it("should expose the signing secret, which n8n needs to verify HMAC", async () => {
      const created = await request(app)
        .post("/v1/webhooks")
        .set("Authorization", `Bearer ${apiKey}`)
        .send({ url: "https://example.com/hook", event: "qr.created", source: "n8n" })
        .expect(201)

      const res = await request(app)
        .get(`/v1/webhooks/${created.body.data.id}`)
        .set("Authorization", `Bearer ${apiKey}`)
      expect(res.status).toBe(200)
      expect(typeof res.body.data.secret).toBe("string")
      expect(res.body.data.secret.length).toBeGreaterThan(16)
    })

    it("should reject an event name outside the supported set", async () => {
      const res = await request(app)
        .post("/v1/webhooks")
        .set("Authorization", `Bearer ${apiKey}`)
        .send({ url: "https://example.com/hook", event: "qr.exploded", source: "zapier" })
      expect(res.status).toBe(422)
    })

    it("should reject a target that is not a URL", async () => {
      const res = await request(app)
        .post("/v1/webhooks")
        .set("Authorization", `Bearer ${apiKey}`)
        .send({ url: "not-a-url", event: "qr.created", source: "zapier" })
      expect(res.status).toBe(422)
    })

    it("should not let one account delete another account's webhook", async () => {
      const victim = await createUser()
      await giveSubscription(victim.id, "PRO")
      const victimKey = await keyFor(victim)

      const hook = await request(app)
        .post("/v1/webhooks")
        .set("Authorization", `Bearer ${victimKey}`)
        .send({ url: "https://example.com/hook", event: "qr.created", source: "zapier" })
        .expect(201)

      const res = await request(app)
        .delete(`/v1/webhooks/${hook.body.data.id}`)
        .set("Authorization", `Bearer ${apiKey}`)
      expect(res.status).toBe(404)
    })
  })
})
