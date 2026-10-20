import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import http from "node:http"
import { createHmac } from "node:crypto"
import { AddressInfo } from "node:net"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { createApiKey } from "../../src/services/apikeys.service.js"
import { startScanWorker, stopScanWorker } from "../../src/workers/scan.worker.js"
import { createUser, giveSubscription, seedPlans, type TestUser } from "../helpers/factories.js"

/**
 * Webhook delivery, end to end: a real HTTP receiver on loopback, real events
 * raised by real requests, and the signature recomputed from the exact bytes
 * that arrived.
 *
 * Subscribe and unsubscribe were already verified against production, but that
 * only proves a row can be written. It says nothing about whether an event ever
 * reaches the endpoint, whether the signature a customer validates against
 * actually matches, or whether a failed delivery is recorded and retried. Those
 * are the parts a customer's automation depends on and none of them had coverage.
 *
 * assertPublicHost() returns early outside production, so a 127.0.0.1 receiver is
 * reachable here. That guard is why these tests cannot run against production —
 * and why no third-party endpoint is involved.
 */

interface Received {
  headers: http.IncomingHttpHeaders
  /** Raw body exactly as received — the signature is over these bytes, not a re-serialisation. */
  raw: string
  body: { event?: string; timestamp?: string; data?: Record<string, unknown> }
}

/** A throwaway receiver. `status` is mutable so one test can force a failure. */
class Receiver {
  server!: http.Server
  received: Received[] = []
  status = 200

  async listen(): Promise<string> {
    this.server = http.createServer((req, res) => {
      let raw = ""
      req.on("data", (c) => { raw += c })
      req.on("end", () => {
        let body = {}
        try { body = JSON.parse(raw) } catch { /* record it regardless */ }
        this.received.push({ headers: req.headers, raw, body })
        res.writeHead(this.status, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ ok: this.status < 400 }))
      })
    })
    await new Promise<void>((resolve) => this.server.listen(0, "127.0.0.1", resolve))
    const { port } = this.server.address() as AddressInfo
    return `http://127.0.0.1:${port}/hook`
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => this.server.close(() => resolve()))
  }

  /**
   * Deliveries are fired with `void` — the response returns before the request
   * lands — so every assertion has to wait for arrival rather than assume it.
   */
  async wait(count = 1, timeoutMs = 5_000): Promise<Received[]> {
    const deadline = Date.now() + timeoutMs
    while (this.received.length < count && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25))
    }
    return this.received
  }

  /** Proves absence rather than slowness: waits the full window, expects nothing. */
  async expectNone(windowMs = 1_200): Promise<Received[]> {
    await new Promise((r) => setTimeout(r, windowMs))
    return this.received
  }
}

/** Recompute the signature the way a customer's endpoint would. */
function sign(raw: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`
}

describe("webhook delivery", () => {
  let user: TestUser
  let apiKey: string
  let receiver: Receiver
  let hookUrl: string

  beforeAll(async () => {
    await seedPlans()
  })

  beforeEach(async () => {
    user = await createUser()
    await giveSubscription(user.id, "PRO")
    const key = await createApiKey(user.id, "webhook test key")
    apiKey = key.rawKey
    receiver = new Receiver()
    hookUrl = await receiver.listen()
  })

  afterEach(async () => {
    await receiver.close()
  })

  /** Subscribes directly so the test owns the secret needed to verify signatures. */
  async function subscribe(events: string[], url = hookUrl, isActive = true) {
    return prisma.webhook.create({
      data: { userId: user.id, name: `test ${events.join(",")}`, url, events, isActive, secret: "whsec_" + "a".repeat(32) },
      select: { id: true, secret: true },
    })
  }

  const CREATE_BODY = {
    name: "hooked",
    type: "URL" as const,
    category: "DYNAMIC" as const,
    content: { data: { url: "https://example.com/one" } },
  }

  describe("qr.created", () => {
    it("should deliver a signed, correctly-headed request when a QR is created via /api", async () => {
      const hook = await subscribe(["qr.created"])

      await request(app)
        .post("/api/qr")
        .set("Authorization", `Bearer ${user.token}`)
        .send(CREATE_BODY)
        .expect(201)

      const [got] = await receiver.wait(1)
      expect(got, "no delivery arrived within 5s").toBeDefined()

      expect(got!.headers["x-genxqr-event"]).toBe("qr.created")
      expect(got!.headers["x-genxqr-attempt"]).toBe("1")
      // The signature must verify against the RAW bytes. Re-serialising the parsed
      // JSON would reorder keys and change whitespace, and would pass here while
      // failing for every real consumer.
      expect(got!.headers["x-genxqr-signature"]).toBe(sign(got!.raw, hook.secret))

      expect(got!.body.event).toBe("qr.created")
      expect(got!.body.timestamp).toBeTruthy()
      expect((got!.body.data as { qr: { name: string } }).qr.name).toBe("hooked")
    })

    /**
     * v1.routes.ts raised no events at all, so a QR created through the developer
     * API produced no qr.created. An integration's own "New QR Code" trigger never
     * saw what it created, or what another integration created.
     */
    it("should deliver when a QR is created via /v1, not only via /api", async () => {
      const hook = await subscribe(["qr.created"])

      await request(app)
        .post("/v1/qr")
        .set("Authorization", `Bearer ${apiKey}`)
        .send(CREATE_BODY)
        .expect(201)

      const [got] = await receiver.wait(1)
      expect(got, "/v1 raised no qr.created event").toBeDefined()
      expect(got!.headers["x-genxqr-event"]).toBe("qr.created")
      expect(got!.headers["x-genxqr-signature"]).toBe(sign(got!.raw, hook.secret))
    })
  })

  describe("qr.updated and qr.deleted via /v1", () => {
    it("should deliver qr.updated when the destination changes", async () => {
      const created = await request(app)
        .post("/v1/qr").set("Authorization", `Bearer ${apiKey}`).send(CREATE_BODY).expect(201)
      const hook = await subscribe(["qr.updated"])

      await request(app)
        .patch(`/v1/qr/${created.body.data.id}`)
        .set("Authorization", `Bearer ${apiKey}`)
        .send({ content: { data: { url: "https://example.com/two" } } })
        .expect(200)

      const [got] = await receiver.wait(1)
      expect(got, "/v1 PATCH raised no qr.updated event").toBeDefined()
      expect(got!.headers["x-genxqr-event"]).toBe("qr.updated")
      expect(got!.headers["x-genxqr-signature"]).toBe(sign(got!.raw, hook.secret))
    })

    it("should deliver qr.deleted carrying the name, read before the row is gone", async () => {
      const created = await request(app)
        .post("/v1/qr").set("Authorization", `Bearer ${apiKey}`).send(CREATE_BODY).expect(201)
      await subscribe(["qr.deleted"])

      await request(app)
        .delete(`/v1/qr/${created.body.data.id}`)
        .set("Authorization", `Bearer ${apiKey}`)
        .expect(204)

      const [got] = await receiver.wait(1)
      expect(got, "/v1 DELETE raised no qr.deleted event").toBeDefined()
      expect(got!.body.event).toBe("qr.deleted")
      expect((got!.body.data as { name: string }).name).toBe("hooked")
    })
  })

  describe("subscription scoping", () => {
    it("should not deliver an event the webhook is not subscribed to", async () => {
      await subscribe(["qr.deleted"]) // deliberately NOT qr.created

      await request(app)
        .post("/v1/qr").set("Authorization", `Bearer ${apiKey}`).send(CREATE_BODY).expect(201)

      expect(await receiver.expectNone()).toHaveLength(0)
    })

    it("should not deliver to an inactive webhook", async () => {
      await subscribe(["qr.created"], hookUrl, false)

      await request(app)
        .post("/v1/qr").set("Authorization", `Bearer ${apiKey}`).send(CREATE_BODY).expect(201)

      expect(await receiver.expectNone()).toHaveLength(0)
    })

    it("should not deliver another account's events to this webhook", async () => {
      await subscribe(["qr.created"])
      const other = await createUser()
      await giveSubscription(other.id, "PRO")

      await request(app)
        .post("/api/qr").set("Authorization", `Bearer ${other.token}`).send(CREATE_BODY).expect(201)

      expect(await receiver.expectNone()).toHaveLength(0)
    })
  })

  describe("delivery accounting", () => {
    it("should record a successful delivery against the webhook", async () => {
      const hook = await subscribe(["qr.created"])

      await request(app)
        .post("/v1/qr").set("Authorization", `Bearer ${apiKey}`).send(CREATE_BODY).expect(201)
      await receiver.wait(1)

      // The row is written after the response, so allow it a moment to land.
      let rows: { success: boolean; statusCode: number | null; attemptNumber: number }[] = []
      for (let i = 0; i < 40 && rows.length === 0; i++) {
        rows = await prisma.webhookDelivery.findMany({
          where: { webhookId: hook.id },
          select: { success: true, statusCode: true, attemptNumber: true },
        })
        if (rows.length === 0) await new Promise((r) => setTimeout(r, 25))
      }

      expect(rows).toHaveLength(1)
      expect(rows[0]!.success).toBe(true)
      expect(rows[0]!.statusCode).toBe(200)
      expect(rows[0]!.attemptNumber).toBe(1)
    })

    it("should record a failed delivery and schedule a retry", async () => {
      const hook = await subscribe(["qr.created"])
      receiver.status = 500

      await request(app)
        .post("/v1/qr").set("Authorization", `Bearer ${apiKey}`).send(CREATE_BODY).expect(201)
      await receiver.wait(1)

      let row: { success: boolean; statusCode: number | null; nextRetryAt: Date | null } | null = null
      for (let i = 0; i < 40 && !row; i++) {
        row = await prisma.webhookDelivery.findFirst({
          where: { webhookId: hook.id },
          select: { success: true, statusCode: true, nextRetryAt: true },
        })
        if (!row) await new Promise((r) => setTimeout(r, 25))
      }

      expect(row).not.toBeNull()
      expect(row!.success).toBe(false)
      expect(row!.statusCode).toBe(500)
      // Without nextRetryAt the retry worker has nothing to pick up, so a
      // transient outage at the customer's end would silently lose the event.
      expect(row!.nextRetryAt).not.toBeNull()
    })
  })

  /**
   * qr.scanned is the only event raised from a BullMQ worker rather than a route,
   * so it is the only one where the queue is part of the contract. The worker is
   * started for real here — the rest of the suite never runs it, which is why a
   * broken enqueue would otherwise show up as nothing at all.
   */
  /**
   * Paths that changed a code without telling anyone (fixed 20 Oct 2026):
   * switching a code on/off, duplicating it, and bulk generation raised no event,
   * so an integration mirroring a user's codes silently drifted.
   */
  describe("events from every path that changes codes", () => {
    it("should deliver qr.updated with the full code when a code is toggled via /api and /v1", async () => {
      const created = await request(app)
        .post("/v1/qr").set("Authorization", `Bearer ${apiKey}`).send(CREATE_BODY).expect(201)
      const hook = await subscribe(["qr.updated"])

      await request(app)
        .patch(`/api/qr/${created.body.data.id}/toggle`)
        .set("Authorization", `Bearer ${user.token}`)
        .expect(200)
      await request(app)
        .patch(`/v1/qr/${created.body.data.id}/toggle`)
        .set("Authorization", `Bearer ${apiKey}`)
        .expect(200)

      const got = await receiver.wait(2)
      expect(got, "toggling raised no qr.updated").toHaveLength(2)
      const states = got.map((g) => (g.body.data as { qr: { id: string; isActive: boolean } }).qr)
      expect(states.every((q) => q.id === created.body.data.id)).toBe(true)
      expect(states.map((q) => q.isActive).sort()).toEqual([false, true])
      expect(got[0]!.headers["x-genxqr-signature"]).toBe(sign(got[0]!.raw, hook.secret))
    })

    it("should deliver qr.created when a code is duplicated", async () => {
      const created = await request(app)
        .post("/v1/qr").set("Authorization", `Bearer ${apiKey}`).send(CREATE_BODY).expect(201)
      await subscribe(["qr.created"])

      const dup = await request(app)
        .post(`/api/qr/${created.body.data.id}/duplicate`)
        .set("Authorization", `Bearer ${user.token}`)
        .expect(201)

      // The original's own qr.created (fired in the background by the create
      // above) can land after the subscription exists, so look for the
      // duplicate's event specifically rather than taking the first arrival.
      const isDup = (g: Received) => (g.body.data as { qr?: { id: string } }).qr?.id === dup.body.data.id
      for (const deadline = Date.now() + 5_000; !receiver.received.some(isDup) && Date.now() < deadline; ) {
        await new Promise((r) => setTimeout(r, 25))
      }
      expect(receiver.received.some(isDup), "duplicating raised no qr.created").toBe(true)
    })

    it("should deliver qr.created for every code a bulk upload creates", async () => {
      await subscribe(["qr.created"])

      await request(app)
        .post("/api/bulk/csv")
        .set("Authorization", `Bearer ${user.token}`)
        .attach("file", Buffer.from("name,url\nFirst,https://example.com/1\nSecond,https://example.com/2\n"), "codes.csv")
        .expect(201)

      const got = await receiver.wait(2)
      expect(got, "bulk upload raised no qr.created").toHaveLength(2)
      const names = got.map((g) => (g.body.data as { qr: { name: string } }).qr.name).sort()
      expect(names).toEqual(["First", "Second"])
    })
  })

  /**
   * Webhooks are part of API access (Pro and above). Management was gated but
   * delivery was not, so an account that dropped below Pro kept receiving events.
   */
  describe("plan gate on delivery", () => {
    it("should not deliver once the account is below Pro", async () => {
      await subscribe(["qr.updated"])
      const created = await request(app)
        .post("/v1/qr").set("Authorization", `Bearer ${apiKey}`).send(CREATE_BODY).expect(201)
      await giveSubscription(user.id, "STARTER")

      await request(app)
        .put(`/api/qr/${created.body.data.id}`)
        .set("Authorization", `Bearer ${user.token}`)
        .send({ name: "renamed on starter" })
        .expect(200)

      expect(await receiver.expectNone()).toHaveLength(0)
    })
  })

  describe("qr.scanned through the scan worker", () => {
    beforeAll(() => {
      startScanWorker()
    })

    afterAll(async () => {
      await stopScanWorker()
    })

    it("should deliver qr.scanned after a real scan is processed", async () => {
      const created = await request(app)
        .post("/v1/qr").set("Authorization", `Bearer ${apiKey}`).send(CREATE_BODY).expect(201)
      const slug = created.body.data.slug as string
      const hook = await subscribe(["qr.scanned"])

      await request(app).get(`/r/${slug}`).expect(302)

      const [got] = await receiver.wait(1, 15_000)
      expect(got, "scan produced no qr.scanned delivery within 15s").toBeDefined()
      expect(got!.body.event).toBe("qr.scanned")
      expect((got!.body.data as { slug: string }).slug).toBe(slug)
      expect(got!.headers["x-genxqr-signature"]).toBe(sign(got!.raw, hook.secret))
    })
  })
})
