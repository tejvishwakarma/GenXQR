import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { redis } from "../../src/redis/client.js"
import { createQRCode, createUser, giveSubscription, seedPlans } from "../helpers/factories.js"

/**
 * Scan-limit enforcement on GET /r/:slug.
 *
 * Regression coverage for the cache-staleness bug fixed in 0a9e950: the limit
 * was checked against `scanCount` inside a Redis-cached QR snapshot with a
 * 10-minute TTL that was only invalidated on QR *edits*, never after a scan.
 * A QR with scanLimit=1 therefore kept accepting scans from any number of
 * devices for up to ten minutes — the limit only took effect once the cache
 * happened to expire.
 *
 * Two details the tests have to work around, both inherent to the design
 * rather than test scaffolding:
 *
 *  1. Scans are deduplicated for 4 hours on qrId + IP + a User-Agent
 *     fingerprint. Supertest always calls from the same loopback IP, so each
 *     simulated device must send a distinct User-Agent — which is exactly how
 *     a real attacker would dodge the dedup too.
 *  2. The counter is incremented from a fire-and-forget `void queueScan(...)`,
 *     so it can land just after the HTTP response. Tests wait for the counter
 *     rather than assuming it is already written.
 */

const scanCountKey = (slug: string) => `qr:slug:${slug}:count`

/** Waits for the async scan pipeline to record `expected` scans, or throws. */
async function waitForScanCount(slug: string, expected: number, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let last: string | null = null
  while (Date.now() < deadline) {
    last = await redis.get(scanCountKey(slug))
    if (last !== null && Number(last) >= expected) return
    await new Promise((r) => setTimeout(r, 25))
  }
  throw new Error(`Timed out waiting for scan count ${expected} on "${slug}" (last seen: ${last})`)
}

/** One scan from a distinct simulated device. */
function scanAs(slug: string, device: string) {
  return request(app).get(`/r/${slug}`).set("User-Agent", `test-device-${device}/1.0`)
}

const isLimitBlocked = (location: string) => location.includes("reason=limit")

describe("scan limit enforcement", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  async function makeLimitedQR(scanLimit: number | null) {
    const user = await createUser()
    await giveSubscription(user.id, "PRO")
    const qr = await createQRCode(user.id)
    await prisma.qRCode.update({ where: { id: qr.id }, data: { scanLimit } })
    return qr
  }

  it("should allow the first scan when scanLimit is 1", async () => {
    const qr = await makeLimitedQR(1)

    const res = await scanAs(qr.slug, "a")

    expect(res.status).toBe(302)
    expect(isLimitBlocked(res.headers.location)).toBe(false)
  })

  /**
   * The core regression. Before the fix this second scan also succeeded,
   * because it re-read the same cached scanCount=0 the first scan saw.
   */
  it("should block a second scan from a different device once scanLimit=1 is reached", async () => {
    const qr = await makeLimitedQR(1)

    const first = await scanAs(qr.slug, "a")
    expect(isLimitBlocked(first.headers.location)).toBe(false)

    await waitForScanCount(qr.slug, 1)

    const second = await scanAs(qr.slug, "b")
    expect(second.status).toBe(302)
    expect(isLimitBlocked(second.headers.location)).toBe(true)
  })

  it("should keep blocking on subsequent attempts, not just the first over-limit one", async () => {
    const qr = await makeLimitedQR(1)

    await scanAs(qr.slug, "a")
    await waitForScanCount(qr.slug, 1)

    for (const device of ["b", "c", "d"]) {
      const res = await scanAs(qr.slug, device)
      expect(isLimitBlocked(res.headers.location)).toBe(true)
    }
  })

  it("should allow exactly scanLimit scans when the limit is above 1", async () => {
    const qr = await makeLimitedQR(3)

    for (const [i, device] of ["a", "b", "c"].entries()) {
      const res = await scanAs(qr.slug, device)
      expect(isLimitBlocked(res.headers.location), `scan ${i + 1} of 3 should be allowed`).toBe(false)
      await waitForScanCount(qr.slug, i + 1)
    }

    const overLimit = await scanAs(qr.slug, "d")
    expect(isLimitBlocked(overLimit.headers.location)).toBe(true)
  })

  it("should not block anything when scanLimit is null", async () => {
    const qr = await makeLimitedQR(null)

    for (const device of ["a", "b", "c", "d", "e"]) {
      const res = await scanAs(qr.slug, device)
      expect(isLimitBlocked(res.headers.location)).toBe(false)
    }
  })

  it("should deduplicate repeat scans from the same device", async () => {
    const qr = await makeLimitedQR(5)

    await scanAs(qr.slug, "same")
    await waitForScanCount(qr.slug, 1)

    // Four more from the identical device: all deduplicated, count stays at 1.
    for (let i = 0; i < 4; i++) await scanAs(qr.slug, "same")

    expect(Number(await redis.get(scanCountKey(qr.slug)))).toBe(1)
  })

  /**
   * Raising the limit goes through the QR update path, which calls
   * invalidateQRCache — that must clear the live counter too, otherwise the
   * QR would stay blocked against its own stale count.
   */
  it("should unblock after the owner raises the limit", async () => {
    const user = await createUser()
    await giveSubscription(user.id, "PRO")
    const qr = await createQRCode(user.id)
    await prisma.qRCode.update({ where: { id: qr.id }, data: { scanLimit: 1 } })

    await scanAs(qr.slug, "a")
    await waitForScanCount(qr.slug, 1)
    expect(isLimitBlocked((await scanAs(qr.slug, "b")).headers.location)).toBe(true)

    const update = await request(app)
      .put(`/api/qr/${qr.id}`)
      .set("Authorization", `Bearer ${user.token}`)
      .send({ settings: { scanLimit: 50 } })
    expect(update.status).toBe(200)

    const afterRaise = await scanAs(qr.slug, "c")
    expect(isLimitBlocked(afterRaise.headers.location)).toBe(false)
  })

  it("should block scans on a deactivated QR regardless of limit", async () => {
    const user = await createUser()
    await giveSubscription(user.id, "PRO")
    const qr = await createQRCode(user.id, { isActive: false })

    const res = await scanAs(qr.slug, "a")

    expect(res.status).toBe(302)
    expect(res.headers.location).toContain("reason=deactivated")
  })

  it("should 404 an unknown slug", async () => {
    const res = await request(app).get("/r/doesnotexist99")
    expect(res.status).toBe(302)
    expect(res.headers.location).toContain("expired")
  })
})
