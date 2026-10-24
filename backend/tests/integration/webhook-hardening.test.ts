import http from "node:http"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "../../src/db/prisma.js"
import { isNonPublicAddress } from "../../src/utils/ip-classify.util.js"
import { postWebhook } from "../../src/services/webhook.service.js"
import { claimDelivery } from "../../src/workers/webhook-retry.worker.js"
import { createUser } from "../helpers/factories.js"

/**
 * Webhook delivery hardening (security audit, 23 Oct 2026):
 *  - the private-address check missed IPv4-mapped IPv6 in hex form
 *    ([::ffff:7f00:1]) and several reserved ranges;
 *  - the host was resolved for the check and again by fetch (DNS rebinding);
 *  - the whole response body was buffered before truncation;
 *  - every PM2 process sent the same retry.
 */

describe("address classification", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "198.18.0.1", "224.0.0.1", "240.0.0.1", "255.255.255.255", "192.0.2.1",
    "::1", "::", "fe80::1", "fd00::1", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "[::ffff:7f00:1]", "::ffff:a9fe:a9fe",
    "64:ff9b::7f00:1", "2002:7f00:1::", "2001::1", "2001:db8::1", "::127.0.0.1",
  ])("should refuse %s", (ip) => {
    expect(isNonPublicAddress(ip)).toBe(true)
  })

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "2a00:1450:4001:80b::200e", "::ffff:8.8.8.8", "64:ff9b::808:808"])(
    "should allow public %s",
    (ip) => {
      expect(isNonPublicAddress(ip)).toBe(false)
    },
  )

  it("should refuse something that is not an IP address", () => {
    expect(isNonPublicAddress("example.com")).toBe(true)
  })
})

describe("webhook requests", () => {
  let server: http.Server
  let port = 0
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === "/huge") {
        res.writeHead(200)
        const chunk = Buffer.alloc(64 * 1024, "a")
        let sent = 0
        const pump = () => {
          while (sent < 50 * 1024 * 1024 && res.write(chunk)) sent += chunk.length
          if (sent < 50 * 1024 * 1024) res.once("drain", pump)
          else res.end()
        }
        pump()
        return
      }
      res.writeHead(200)
      res.end("ok")
    })
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
    port = (server.address() as { port: number }).port
  })
  afterAll(() => {
    server.closeAllConnections()
    server.close()
  })

  it("should connect to the pinned address without resolving the host again", async () => {
    // .invalid never resolves (RFC 6761): this only works if no lookup happens.
    const res = await postWebhook(new URL(`http://pinned-host.invalid:${port}/`), {}, "{}", { address: "127.0.0.1", family: 4 }, 5000)
    expect(res).toEqual({ status: 200, text: "ok" })
  })

  it("should stop reading a huge response instead of buffering it", async () => {
    const started = Date.now()
    const res = await postWebhook(new URL(`http://127.0.0.1:${port}/huge`), {}, "{}", null, 10_000)
    expect(res.status).toBe(200)
    expect(res.text.length).toBeLessThanOrEqual(1000)
    expect(Date.now() - started).toBeLessThan(3000)
  })
})

describe("retry claims", () => {
  it("should let exactly one process take a due retry", async () => {
    const user = await createUser()
    const hook = await prisma.webhook.create({ data: { userId: user.id, name: "h", url: "https://example.com/h", events: ["test"], secret: "s" } })
    const due = new Date(Date.now() - 1000)
    const delivery = await prisma.webhookDelivery.create({
      data: { webhookId: hook.id, event: "test", payload: {}, success: false, attemptNumber: 1, maxAttempts: 5, nextRetryAt: due },
    })
    const results = await Promise.all([1, 2, 3, 4].map(() => claimDelivery(delivery.id, due)))
    expect(results.filter(Boolean)).toHaveLength(1)
  })
})
