import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { isSafeHttpUrl, safeRedirectTarget } from "../../src/utils/safe-url.js"
import { createUser, giveSubscription, seedPlans, type TestUser } from "../helpers/factories.js"

/**
 * Remediations for the source-review findings (assessment 2026-09-01).
 *
 *   #3  routing destinations must be http(s) only (no javascript:/data:)
 *   #6  /v1 QR creation is subject to the plan's QR-slot quota
 *   #2  uploads are refused when they would exceed (or the plan lacks) storage
 *   #1  deleting a QRFile only unlinks bytes no other row still references
 */

const PNG_1PX = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001" +
    "0d0a2db40000000049454e44ae426082",
  "hex",
)
const UPLOAD_BASE = path.join(process.cwd(), "uploads")
const QR_FILES_DIR = path.join(UPLOAD_BASE, "qr-files")

describe("security remediation", () => {
  beforeAll(async () => {
    await seedPlans()
    fs.mkdirSync(QR_FILES_DIR, { recursive: true })
  })

  // ─── #3: unsafe URL schemes ──────────────────────────────────────────────
  describe("#3 destination scheme allowlist", () => {
    it("accepts only http(s) at the isSafeHttpUrl boundary", () => {
      expect(isSafeHttpUrl("https://example.com")).toBe(true)
      expect(isSafeHttpUrl("http://example.com")).toBe(true)
      for (const bad of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "ftp://x", "//evil.com", "notaurl"]) {
        expect(isSafeHttpUrl(bad), bad).toBe(false)
      }
    })

    it("safeRedirectTarget nulls a stored unsafe value (legacy-row guard)", () => {
      expect(safeRedirectTarget("javascript:alert(1)")).toBeNull()
      expect(safeRedirectTarget("https://ok.example")).toBe("https://ok.example")
      expect(safeRedirectTarget(null)).toBeNull()
    })

    it("rejects a javascript: fallbackUrl at QR create", async () => {
      const user = await createUser()
      await giveSubscription(user.id, "PRO")
      const res = await request(app)
        .post("/api/qr")
        .set("Authorization", `Bearer ${user.token}`)
        .send({
          name: "x",
          type: "URL",
          content: { data: { url: "https://example.com" } },
          settings: { fallbackUrl: "javascript:alert(document.domain)" },
        })
      expect(res.status).toBe(422)
    })
  })

  // ─── #6: /v1 QR creation respects the plan quota ──────────────────────────
  describe("#6 /v1 QR creation quota", () => {
    it("refuses /v1 QR creation for a zero-quota (FREE) plan", async () => {
      const user = await createUser()
      await giveSubscription(user.id, "FREE")
      const key = (await import("../../src/services/apikeys.service.js")).createApiKey
      const { rawKey } = await key(user.id, "k")

      const res = await request(app)
        .post("/v1/qr")
        .set("Authorization", `Bearer ${rawKey}`)
        .send({ name: "x", type: "URL", content: { data: { url: "https://example.com" } } })
      expect(res.status, "FREE has dynamicQRLimit 0 — /v1 must gate too").toBe(403)
    })
  })

  // ─── #2: upload storage quota enforced up front ───────────────────────────
  describe("#2 upload storage quota", () => {
    let user: TestUser
    beforeEach(async () => {
      user = await createUser()
    })

    it("refuses an upload on a zero-storage plan", async () => {
      await giveSubscription(user.id, "FREE") // fileStorageGB: 0
      const res = await request(app)
        .post("/api/upload/image")
        .set("Authorization", `Bearer ${user.token}`)
        .attach("file", PNG_1PX, "x.png")
      expect(res.status).toBe(403)
    })

    it("accepts an upload within a plan that has storage", async () => {
      await giveSubscription(user.id, "PRO")
      const res = await request(app)
        .post("/api/upload/image")
        .set("Authorization", `Bearer ${user.token}`)
        .attach("file", PNG_1PX, "x.png")
      expect(res.status).toBe(201)
      expect(res.body.data.tempUrl).toMatch(/^\/uploads\//)
    })
  })

  // ─── #1: reference-counted physical deletion ──────────────────────────────
  describe("#1 cross-tenant file deletion", () => {
    it("does not unlink bytes another tenant's QRFile still references", async () => {
      // A real file on disk, owned (legitimately) by the victim.
      const filename = `victim-${Date.now()}.png`
      const diskPath = path.join(QR_FILES_DIR, filename)
      const fileUrl = `/uploads/qr-files/${filename}`
      fs.writeFileSync(diskPath, PNG_1PX)

      const victim = await createUser()
      const attacker = await createUser()

      const victimQR = await prisma.qRCode.create({
        data: { userId: victim.id, name: "v", slug: `v${Date.now()}`, type: "PDF", category: "DYNAMIC",
          files: { create: { fileType: "IMAGE", fileName: "v.png", fileUrl, mimeType: "image/png", sizeBytes: BigInt(PNG_1PX.length) } } },
        include: { files: true },
      })

      // The attack: attacker owns a QRFile whose fileUrl ALIASES the victim's path.
      const attackerQR = await prisma.qRCode.create({
        data: { userId: attacker.id, name: "a", slug: `a${Date.now()}`, type: "PDF", category: "DYNAMIC",
          files: { create: { fileType: "IMAGE", fileName: "a.png", fileUrl, mimeType: "image/png", sizeBytes: BigInt(PNG_1PX.length) } } },
        include: { files: true },
      })

      const del = await request(app)
        .delete(`/api/upload/${attackerQR.files[0]!.id}`)
        .set("Authorization", `Bearer ${attacker.token}`)
      expect(del.status).toBe(200)

      // The victim's bytes and row must both survive the attacker's delete.
      expect(fs.existsSync(diskPath), "victim's file must not be unlinked").toBe(true)
      const victimFileStillThere = await prisma.qRFile.count({ where: { qrId: victimQR.id } })
      expect(victimFileStillThere).toBe(1)

      fs.rmSync(diskPath, { force: true })
    })

    it("does unlink bytes when the deleted QRFile is the only reference", async () => {
      const filename = `solo-${Date.now()}.png`
      const diskPath = path.join(QR_FILES_DIR, filename)
      fs.writeFileSync(diskPath, PNG_1PX)

      const owner = await createUser()
      const qr = await prisma.qRCode.create({
        data: { userId: owner.id, name: "o", slug: `o${Date.now()}`, type: "PDF", category: "DYNAMIC",
          files: { create: { fileType: "IMAGE", fileName: "o.png", fileUrl: `/uploads/qr-files/${filename}`, mimeType: "image/png", sizeBytes: BigInt(PNG_1PX.length) } } },
        include: { files: true },
      })

      await request(app)
        .delete(`/api/upload/${qr.files[0]!.id}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(200)

      // fs.unlink is async and fire-and-forget in the route; poll briefly.
      let gone = false
      for (let i = 0; i < 40 && !gone; i++) {
        gone = !fs.existsSync(diskPath)
        if (!gone) await new Promise((r) => setTimeout(r, 25))
      }
      expect(gone, "a uniquely-referenced file should be unlinked").toBe(true)
    })
  })

  // ─── #7: API keys re-authorized against the CURRENT plan on every use ─────
  describe("#7 API key entitlement on use", () => {
    it("stops honouring a key after the plan loses apiAccess", async () => {
      const user = await createUser()
      await giveSubscription(user.id, "PRO") // apiAccess: true
      const { createApiKey } = await import("../../src/services/apikeys.service.js")
      const { rawKey } = await createApiKey(user.id, "k")

      await request(app).get("/v1/qr").set("Authorization", `Bearer ${rawKey}`).expect(200)

      await giveSubscription(user.id, "FREE") // apiAccess: false
      const res = await request(app).get("/v1/qr").set("Authorization", `Bearer ${rawKey}`)
      expect(res.status, "a downgraded plan must reject the still-active key").toBe(403)
    })
  })

  // ─── #8: monthly API call quota is enforced, not just notified ────────────
  describe("#8 monthly API call quota", () => {
    it("rejects once the month's call limit is reached", async () => {
      const { PLAN_LIMITS } = await import("../../src/services/billing.service.js")
      const { redis } = await import("../../src/redis/client.js")
      const { createApiKey } = await import("../../src/services/apikeys.service.js")

      const user = await createUser()
      await giveSubscription(user.id, "PRO")
      const { rawKey } = await createApiKey(user.id, "k")

      // Pre-seed the counter to the plan limit rather than making 100k calls.
      const month = new Date().toISOString().slice(0, 7)
      await redis.set(`apiusage:${user.id}:${month}`, String(PLAN_LIMITS.PRO.apiCallsLimit))

      const res = await request(app).get("/v1/qr").set("Authorization", `Bearer ${rawKey}`)
      expect(res.status, "the call over the limit must be refused").toBe(429)
    })

    it("allows calls below the limit and reports usage in billing", async () => {
      const { redis } = await import("../../src/redis/client.js")
      const user = await createUser()
      await giveSubscription(user.id, "PRO")
      const { createApiKey } = await import("../../src/services/apikeys.service.js")
      const { rawKey } = await createApiKey(user.id, "k")

      await request(app).get("/v1/qr").set("Authorization", `Bearer ${rawKey}`).expect(200)

      const month = new Date().toISOString().slice(0, 7)
      const counted = Number(await redis.get(`apiusage:${user.id}:${month}`))
      expect(counted, "the call must be metered").toBeGreaterThanOrEqual(1)

      const usage = await request(app)
        .get("/api/billing/usage")
        .set("Authorization", `Bearer ${user.token}`)
        .expect(200)
      expect(usage.body.data.apiCalls.used, "billing must report the real count, not 0").toBeGreaterThanOrEqual(1)
    })
  })

  afterAll(async () => {
    await prisma.$disconnect().catch(() => undefined)
  })
})
