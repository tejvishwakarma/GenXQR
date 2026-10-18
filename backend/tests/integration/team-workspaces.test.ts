import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { createQRCode, createUser, giveSubscription, seedPlans } from "../helpers/factories.js"

/**
 * Shared team workspaces (18 Oct 2026). Members act inside the owner's
 * workspace via X-Workspace-Id; the server enforces the role on every route:
 *   Viewer — view; Editor — + create/edit/toggle; Admin — + delete, manage team.
 * Codes made in the workspace belong to the owner and use the owner's plan.
 */

const VALID_QR = { name: "Team code", type: "URL", content: { data: { url: "https://example.com" } } }

async function teamWith(role: "ADMIN" | "EDITOR" | "VIEWER", ownerPlan: "PRO" | "STARTER" = "PRO") {
  const owner = await createUser()
  await giveSubscription(owner.id, ownerPlan)
  const member = await createUser()
  const team = await prisma.team.create({ data: { ownerId: owner.id, name: "Acme" } })
  await prisma.teamMember.create({ data: { teamId: team.id, userId: member.id, role } })
  const ownerQr = await createQRCode(owner.id, { name: "Owner's code" })
  return { owner, member, team, ownerQr }
}

const as = (token: string, ownerId?: string) => {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (ownerId) headers["X-Workspace-Id"] = ownerId
  return headers
}

describe("team workspaces", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  describe("viewer", () => {
    it("should see the owner's codes in the owner's workspace", async () => {
      const { owner, member, ownerQr } = await teamWith("VIEWER")
      const res = await request(app).get("/api/qr").set(as(member.token, owner.id))
      expect(res.status).toBe(200)
      expect(res.body.data.map((q: { id: string }) => q.id)).toContain(ownerQr.id)
    })

    it("should see analytics for the owner's codes", async () => {
      const { owner, member, ownerQr } = await teamWith("VIEWER")
      const res = await request(app).get(`/api/analytics/${ownerQr.id}`).set(as(member.token, owner.id))
      expect(res.status).toBe(200)
    })

    it("should not create, edit, toggle or delete", async () => {
      const { owner, member, ownerQr } = await teamWith("VIEWER")
      const h = as(member.token, owner.id)
      expect((await request(app).post("/api/qr").set(h).send(VALID_QR)).status).toBe(403)
      expect((await request(app).put(`/api/qr/${ownerQr.id}`).set(h).send({ name: "x" })).status).toBe(403)
      expect((await request(app).patch(`/api/qr/${ownerQr.id}/toggle`).set(h)).status).toBe(403)
      expect((await request(app).delete(`/api/qr/${ownerQr.id}`).set(h)).status).toBe(403)
      expect(await prisma.qRCode.findUnique({ where: { id: ownerQr.id } })).not.toBeNull()
    })
  })

  describe("editor", () => {
    it("should create codes that belong to the owner", async () => {
      const { owner, member } = await teamWith("EDITOR")
      const res = await request(app).post("/api/qr").set(as(member.token, owner.id)).send(VALID_QR)
      expect(res.status).toBe(201)
      const created = await prisma.qRCode.findUniqueOrThrow({ where: { id: res.body.data.id } })
      expect(created.userId).toBe(owner.id)
    })

    it("should edit and toggle but not delete", async () => {
      const { owner, member, ownerQr } = await teamWith("EDITOR")
      const h = as(member.token, owner.id)
      expect((await request(app).put(`/api/qr/${ownerQr.id}`).set(h).send({ name: "Renamed" })).status).toBe(200)
      expect((await request(app).patch(`/api/qr/${ownerQr.id}/toggle`).set(h)).status).toBe(200)
      expect((await request(app).delete(`/api/qr/${ownerQr.id}`).set(h)).status).toBe(403)
    })

    it("should be held to the OWNER's code limit", async () => {
      const { owner, member } = await teamWith("EDITOR", "PRO")
      // PRO allows 250; fill the owner to the limit.
      await prisma.qRCode.createMany({
        data: Array.from({ length: 249 }, (_, i) => ({
          userId: owner.id, name: `Fill ${i}`, slug: `fill${i}${Date.now().toString(36)}`.slice(0, 20), type: "URL", category: "DYNAMIC",
        })),
      })
      const res = await request(app).post("/api/qr").set(as(member.token, owner.id)).send(VALID_QR)
      expect(res.status).toBe(403)
    })
  })

  describe("admin", () => {
    it("should delete codes and manage members", async () => {
      const { owner, member, team, ownerQr } = await teamWith("ADMIN")
      const other = await createUser()
      await prisma.teamMember.create({ data: { teamId: team.id, userId: other.id, role: "VIEWER" } })
      const h = as(member.token, owner.id)

      expect((await request(app).delete(`/api/qr/${ownerQr.id}`).set(h)).status).toBe(200)
      expect((await request(app).patch(`/api/team/members/${other.id}/role`).set(h).send({ role: "editor" })).status).toBe(200)
      expect((await prisma.teamMember.findFirstOrThrow({ where: { userId: other.id } })).role).toBe("EDITOR")
      expect((await request(app).delete(`/api/team/members/${other.id}`).set(h)).status).toBe(200)
      expect(await prisma.teamMember.findFirst({ where: { userId: other.id } })).toBeNull()
    })

    it("should not let an editor manage members", async () => {
      const { owner, member, team } = await teamWith("EDITOR")
      const other = await createUser()
      await prisma.teamMember.create({ data: { teamId: team.id, userId: other.id, role: "VIEWER" } })
      const res = await request(app).delete(`/api/team/members/${other.id}`).set(as(member.token, owner.id))
      expect(res.status).toBe(403)
    })
  })

  describe("isolation", () => {
    it("should refuse a workspace the caller is not a member of", async () => {
      const { owner, ownerQr } = await teamWith("ADMIN")
      const outsider = await createUser()
      const res = await request(app).get(`/api/qr/${ownerQr.id}`).set(as(outsider.token, owner.id))
      expect(res.status).toBe(403)
    })

    it("should keep a member's personal workspace separate", async () => {
      const { member, ownerQr } = await teamWith("ADMIN")
      const res = await request(app).get("/api/qr").set(as(member.token))
      expect(res.status).toBe(200)
      expect(res.body.data.map((q: { id: string }) => q.id)).not.toContain(ownerQr.id)
    })

    it("should cut off access when the owner's plan has no team seats", async () => {
      const { owner, member } = await teamWith("ADMIN", "STARTER")
      const res = await request(app).get("/api/qr").set(as(member.token, owner.id))
      expect(res.status).toBe(403)
    })

    it("should let a member leave the team", async () => {
      const { owner, member } = await teamWith("VIEWER")
      const res = await request(app).delete(`/api/team/memberships/${owner.id}`).set(as(member.token))
      expect(res.status).toBe(200)
      expect((await request(app).get("/api/qr").set(as(member.token, owner.id))).status).toBe(403)
    })

    it("should list the workspaces a user can switch to", async () => {
      const { owner, member } = await teamWith("EDITOR")
      const res = await request(app).get("/api/team/workspaces").set(as(member.token))
      expect(res.status).toBe(200)
      const ids = res.body.data.map((w: { ownerId: string }) => w.ownerId)
      expect(ids).toEqual([member.id, owner.id])
      expect(res.body.data[1].role).toBe("EDITOR")
    })
  })
})
