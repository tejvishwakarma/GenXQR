import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { buildJobApplicationEmail } from "../../src/services/email.service.js"
import { deleteApplication } from "../../src/services/admin-support.service.js"
import { createUser, giveSubscription, seedPlans } from "../helpers/factories.js"

/** Low-priority findings from the 23 Oct 2026 audit. */

const PNG_1PX = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001" +
    "0d0a2db40000000049454e44ae426082",
  "hex",
)

describe("misc hardening", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should give uploads unguessable file names", async () => {
    const user = await createUser()
    await giveSubscription(user.id, "PRO")
    const res = await request(app).post("/api/upload/image").set("Authorization", `Bearer ${user.token}`).attach("file", PNG_1PX, "logo.png").expect(201)
    expect(res.body.data.tempUrl).toMatch(/^\/uploads\/image\/[0-9a-f]{24}_logo\.png$/)
  })

  it("should escape a LinkedIn URL in the careers email", () => {
    const html = buildJobApplicationEmail({
      candidateName: "A", candidateEmail: "a@b.com", jobTitle: "Dev", coverLetter: "hi", cvFilename: "cv.pdf",
      linkedIn: `https://linkedin.com/in/x"><img src=x onerror=alert(1)>`,
    })
    expect(html).not.toContain("<img src=x")
  })

  it("should follow a fallback URL written with a capitalised scheme", async () => {
    const user = await createUser()
    await giveSubscription(user.id, "PRO")
    const qr = await prisma.qRCode.create({
      data: { userId: user.id, name: "f", slug: `fb${Date.now().toString(36)}`, type: "URL", category: "DYNAMIC", isActive: false, fallbackUrl: "HTTPS://example.com/closed" },
    })
    const res = await request(app).get(`/r/${qr.slug}`)
    expect(res.headers["location"]).toBe("HTTPS://example.com/closed")
  })

  it("should delete the CV file with the job application", async () => {
    const dir = path.join(process.cwd(), "uploads", "cvs")
    fs.mkdirSync(dir, { recursive: true })
    const cvPath = path.join(dir, `test-cv-${Date.now()}.pdf`)
    fs.writeFileSync(cvPath, "%PDF-1.4 test")
    const application = await prisma.jobApplication.create({
      data: { jobTitle: "Dev", name: "A", email: "a@b.com", coverLetter: "hi", cvFilename: "cv.pdf", cvPath },
    })
    await deleteApplication(application.id)
    expect(fs.existsSync(cvPath)).toBe(false)
  })

  it("should refuse to start in production with the example JWT secret", () => {
    const run = (access: string, refresh: string) =>
      spawnSync(process.execPath, ["--import", "tsx", "-e", "await import('./src/config/env.ts')"], {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: "production", JWT_ACCESS_SECRET: access, JWT_REFRESH_SECRET: refresh },
        encoding: "utf8",
      })
    const placeholder = "CHANGE_ME_USE_A_STRONG_RANDOM_64_CHAR_HEX_SECRET"
    expect(run(placeholder, "b".repeat(64)).status).toBe(1)
    expect(run("a".repeat(64), "a".repeat(64)).status).toBe(1) // identical secrets
    expect(run("a".repeat(64), "b".repeat(64)).status).toBe(0)
  })
})
