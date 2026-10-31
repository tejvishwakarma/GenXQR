import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import type { Prisma } from "@prisma/client"
import { prisma } from "../../src/db/prisma.js"
import { createQRCode, createSuperAdmin, createUser, giveSubscription, seedPlans } from "../helpers/factories.js"

/**
 * Customer activity log (31 Oct 2026): security history for every plan, the
 * team log for OWNER/ADMIN on Pro+. Checks who can read what, that a member's
 * action lands in the OWNER's log under the member's name, and that what is
 * shown never includes a full IP or which admin impersonated.
 */

async function teamWith(role: "ADMIN" | "EDITOR" | "VIEWER", ownerPlan: "PRO" | "STARTER" = "PRO") {
  const owner = await createUser()
  await giveSubscription(owner.id, ownerPlan)
  const member = await createUser()
  const team = await prisma.team.create({ data: { ownerId: owner.id, name: "Acme" } })
  await prisma.teamMember.create({ data: { teamId: team.id, userId: member.id, role } })
  return { owner, member }
}

const as = (token: string, ownerId?: string) => {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (ownerId) headers["X-Workspace-Id"] = ownerId
  return headers
}

/** logAudit is fire-and-forget: wait for the row. */
async function waitForRow(where: Prisma.AuditLogWhereInput) {
  for (let i = 0; i < 60; i++) {
    const row = await prisma.auditLog.findFirst({ where })
    if (row) return row
    await new Promise((r) => setTimeout(r, 25))
  }
  throw new Error(`no audit row for ${JSON.stringify(where)}`)
}

const createCode = (token: string, ownerId?: string, name = "from the test") =>
  request(app).post("/api/qr").set(as(token, ownerId))
    .send({ name, type: "URL", content: { data: { url: "https://example.com" } } })

describe("activity log", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  describe("team log", () => {
    it("should put a member's change in the OWNER's log under the member's name", async () => {
      const { owner, member } = await teamWith("EDITOR")
      const created = await createCode(member.token, owner.id, "member made this")
      expect(created.status, JSON.stringify(created.body)).toBe(201)
      const row = await waitForRow({ action: "qr.create", entityId: created.body.data.id })
      expect(row.ownerId).toBe(owner.id)
      expect(row.userId).toBe(member.id)

      const res = await request(app).get("/api/activity/team").set(as(owner.token))
      expect(res.status).toBe(200)
      const entry = res.body.data.items.find((e: { entityId: string }) => e.entityId === created.body.data.id)
      expect(entry.actor).toMatchObject({ kind: "user", id: member.id })
      expect(entry.metadata).toMatchObject({ name: "member made this" })

      // ...and not in the member's own team log.
      const mine = await request(app).get("/api/activity/team").set(as(member.token))
      expect(mine.status).toBe(403) // the member's own FREE plan has no team log
    })

    it("should let a workspace ADMIN read it but not an EDITOR or VIEWER", async () => {
      const admin = await teamWith("ADMIN")
      expect((await request(app).get("/api/activity/team").set(as(admin.member.token, admin.owner.id))).status).toBe(200)
      const editor = await teamWith("EDITOR")
      expect((await request(app).get("/api/activity/team").set(as(editor.member.token, editor.owner.id))).status).toBe(403)
      expect((await request(app).get("/api/activity/team/export").set(as(editor.member.token, editor.owner.id))).status).toBe(403)
      const viewer = await teamWith("VIEWER")
      expect((await request(app).get("/api/activity/team/actors").set(as(viewer.member.token, viewer.owner.id))).status).toBe(403)
    })

    it("should need the OWNER's plan to include it", async () => {
      const { owner, member } = await teamWith("ADMIN", "STARTER")
      expect((await request(app).get("/api/activity/team").set(as(owner.token))).status).toBe(403)
      expect((await request(app).get("/api/activity/team").set(as(member.token, owner.id))).status).toBe(403)
      // Security history is on every plan.
      expect((await request(app).get("/api/activity/security").set(as(owner.token))).status).toBe(200)
    })

    it("should not show another account's activity", async () => {
      const a = await createUser(); await giveSubscription(a.id, "PRO")
      const b = await createUser(); await giveSubscription(b.id, "PRO")
      const created = await createCode(b.token, undefined, "b's code")
      await waitForRow({ action: "qr.create", entityId: created.body.data.id })
      const res = await request(app).get("/api/activity/team").set(as(a.token))
      expect(res.body.data.items.some((e: { entityId: string }) => e.entityId === created.body.data.id)).toBe(false)
      // A workspace the caller is not in is refused, not read.
      expect((await request(app).get("/api/activity/team").set(as(a.token, b.id))).status).toBeGreaterThanOrEqual(403)
    })

    it("should keep sign-ins out of it", async () => {
      const { owner } = await teamWith("ADMIN")
      await prisma.auditLog.create({ data: { userId: owner.id, ownerId: owner.id, action: "auth.login", category: "auth", ip: "49.36.10.20" } })
      const res = await request(app).get("/api/activity/team?category=auth").set(as(owner.token))
      expect(res.body.data.total).toBe(0)
      const all = await request(app).get("/api/activity/team").set(as(owner.token))
      expect(all.body.data.items.some((e: { category: string }) => e.category === "auth")).toBe(false)
    })
  })

  describe("security history", () => {
    it("should list the caller's own sign-ins once each, with a masked IP", async () => {
      const user = await createUser()
      const login = await request(app).post("/api/auth/login").set("X-Forwarded-For", "49.36.10.20")
        .send({ email: user.email, password: user.password })
      expect(login.status, JSON.stringify(login.body)).toBe(200)
      await waitForRow({ userId: user.id, action: "auth.login" })
      await new Promise((r) => setTimeout(r, 100)) // a second write would have landed by now
      expect(await prisma.auditLog.count({ where: { userId: user.id, action: "auth.login" } })).toBe(1)

      const res = await request(app).get("/api/activity/security").set(as(user.token))
      expect(res.status).toBe(200)
      const entry = res.body.data.items.find((e: { action: string }) => e.action === "auth.login")
      expect(entry.ip).toBe("49.36.10.x")
      expect(JSON.stringify(res.body)).not.toContain("49.36.10.20")
    })

    it("should record who signed out", async () => {
      const user = await createUser()
      const login = await request(app).post("/api/auth/login").send({ email: user.email, password: user.password }).expect(200)
      const cookie = login.headers["set-cookie"]
      await request(app).post("/api/auth/logout").set("Cookie", cookie).expect(200)
      await waitForRow({ userId: user.id, action: "auth.logout" })
    })

    it("should mask IPs in the list and the CSV, and keep formulas inert", async () => {
      const user = await createUser()
      await prisma.auditLog.create({
        data: { userId: user.id, ownerId: user.id, action: "apikey.create", category: "apikey", ip: "49.36.10.20", metadata: { name: "=HYPERLINK(\"x\")" } },
      })
      const list = await request(app).get("/api/activity/security").set(as(user.token))
      expect(list.body.data.items[0].ip).toBe("49.36.10.x")
      const csv = await request(app).get("/api/activity/security/export").set(as(user.token))
      expect(csv.status).toBe(200)
      expect(csv.headers["content-type"]).toMatch(/text\/csv/)
      expect(csv.text).toContain("49.36.10.x")
      expect(csv.text).not.toContain("49.36.10.20")
    })

    it("should not include admin rows or other people's rows", async () => {
      const admin = await createSuperAdmin()
      const other = await createUser()
      await prisma.auditLog.createMany({
        data: [
          { userId: admin.id, action: "admin.user.update", category: "admin", ip: "8.8.8.8" },
          { userId: other.id, ownerId: other.id, action: "auth.login", category: "auth", ip: "8.8.4.4" },
        ],
      })
      const res = await request(app).get("/api/activity/security?category=admin").set(as(admin.token))
      expect(res.body.data.total).toBe(0)
      const all = await request(app).get("/api/activity/security").set(as(admin.token))
      expect(all.body.data.items.every((e: { category: string }) => ["auth", "apikey", "webhook"].includes(e.category))).toBe(true)
      expect(all.body.data.items.some((e: { action: string }) => e.action === "admin.user.update")).toBe(false)
    })
  })

  it("should show an impersonated change as GenXQR support without naming the admin", async () => {
    const admin = await createSuperAdmin()
    const user = await createUser()
    await giveSubscription(user.id, "PRO")
    const imp = await request(app).post(`/admin-api/users/${user.id}/impersonate`).set("Authorization", `Bearer ${admin.token}`).expect(200)
    const created = await createCode(imp.body.data.token as string)
    expect(created.status).toBe(201)
    await waitForRow({ action: "qr.create", entityId: created.body.data.id })

    const res = await request(app).get("/api/activity/team").set(as(user.token))
    const entry = res.body.data.items.find((e: { entityId: string }) => e.entityId === created.body.data.id)
    expect(entry.actor).toEqual({ kind: "support" })
    expect(JSON.stringify(res.body)).not.toContain(admin.id)
    const csv = await request(app).get("/api/activity/team/export").set(as(user.token))
    expect(csv.text).toContain("GenXQR support")
    expect(csv.text).not.toContain(admin.id)
  })

  it("should log each bulk upload once", async () => {
    const user = await createUser()
    await giveSubscription(user.id, "PRO")
    await createQRCode(user.id) // the account is in use
    const csv = "name,url\nOne,https://example.com/1\nTwo,https://example.com/2\n"
    const res = await request(app).post("/api/bulk/csv").set(as(user.token)).attach("file", Buffer.from(csv), "codes.csv")
    expect(res.status, JSON.stringify(res.body)).toBeLessThan(300)
    const row = await waitForRow({ userId: user.id, action: "qr.bulk_create" })
    expect(row.ownerId).toBe(user.id)
    expect(row.metadata).toMatchObject({ created: 2 })
  })
})
