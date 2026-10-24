import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { redis } from "../../src/redis/client.js"
import { getScanQuota, getScanUsage } from "../../src/services/scan-quota.service.js"
import { SCAN_RATE_PER_MINUTE } from "../../src/services/scan.service.js"
import { createQRCode, createUser, giveSubscription, seedPlans } from "../helpers/factories.js"

/**
 * Draining a customer's scan quota (security audit, 23 Oct 2026). /r/:slug had
 * no rate limit and every request — repeats included — counted toward the
 * monthly quota, so a script reloading one printed code could switch off all
 * of a customer's codes for the month. Decided: the quota counts unique scans
 * (one per device per code per 4 h), and one address hammering one code stops
 * being counted (it is still redirected).
 */

const quotaKey = async (userId: string) => `scanquota:v2:count:${userId}:${(await getScanQuota(userId)).windowStart.getTime()}`

/** A scan from a given visitor (IP via the Cloudflare/nginx chain, device via User-Agent). */
function scan(slug: string, ip: string, device: string) {
  return request(app).get(`/r/${slug}`).set("X-Forwarded-For", `${ip}, 162.158.0.1`).set("User-Agent", `device-${device}`)
}

/** Waits until the background counting has settled on a value. */
async function settledCount(key: string): Promise<number> {
  let last = "", same = 0
  for (let i = 0; i < 80 && same < 6; i++) {
    const now = (await redis.get(key)) ?? "0"
    same = now === last ? same + 1 : 0
    last = now
    await new Promise((r) => setTimeout(r, 25))
  }
  return Number(last)
}

async function starterCode() {
  const user = await createUser()
  await giveSubscription(user.id, "STARTER")
  const qr = await createQRCode(user.id)
  await getScanUsage(user.id) // seed the counter at 0
  return { user, qr }
}

describe("scan quota abuse", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should not use quota for repeat scans from the same device", async () => {
    const { user, qr } = await starterCode()
    for (let i = 0; i < 5; i++) await scan(qr.slug, "203.0.113.10", "same").expect(302)
    expect(await settledCount(await quotaKey(user.id))).toBe(1)
  })

  it("should use quota once per distinct device", async () => {
    const { user, qr } = await starterCode()
    for (const d of ["a", "b", "c"]) await scan(qr.slug, "203.0.113.11", d).expect(302)
    expect(await settledCount(await quotaKey(user.id))).toBe(3)
  })

  it("should stop counting one address hammering a code, but keep redirecting it", async () => {
    const { user, qr } = await starterCode()
    const attempts = SCAN_RATE_PER_MINUTE + 15
    for (let i = 0; i < attempts; i++) {
      const res = await scan(qr.slug, "203.0.113.12", `rotating-${i}`) // a "new device" every time
      expect(res.status).toBe(302)
      expect(res.headers["location"]).not.toContain("reason=")
    }
    expect(await settledCount(await quotaKey(user.id))).toBe(SCAN_RATE_PER_MINUTE)
  })

  it("should not let one address's excess count against other visitors", async () => {
    const { user, qr } = await starterCode()
    for (let i = 0; i < SCAN_RATE_PER_MINUTE + 5; i++) await scan(qr.slug, "203.0.113.13", `x${i}`)
    await scan(qr.slug, "198.51.100.77", "someone-else").expect(302)
    expect(await settledCount(await quotaKey(user.id))).toBe(SCAN_RATE_PER_MINUTE + 1)
  })

  it("should seed a missing counter from unique scans only", async () => {
    const user = await createUser()
    await giveSubscription(user.id, "STARTER")
    const qr = await createQRCode(user.id)
    await prisma.qRScan.createMany({
      data: [
        { qrId: qr.id, ip: "203.0.113.1", isUnique: true },
        { qrId: qr.id, ip: "203.0.113.1", isUnique: false },
        { qrId: qr.id, ip: "203.0.113.1", isUnique: false },
      ],
    })
    await redis.del(await quotaKey(user.id))
    expect(await getScanUsage(user.id)).toBe(1)
  })
})
