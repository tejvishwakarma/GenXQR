import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { PLAN_LIMITS } from "../../src/services/billing.service.js"
import { createUser, giveSubscription, seedPlans, type TestUser } from "../helpers/factories.js"

/**
 * The QR frame library is a paid feature (decided 20 Oct 2026: any paid plan,
 * trial included). The dashboard hides frames from FREE accounts, but that is
 * presentation only — these tests pin the server-side gate in qr.service, which
 * also covers /v1 and team workspaces since they share createQR/updateQR.
 */
describe("QR frame library", () => {
  let owner: TestUser

  beforeAll(async () => {
    await seedPlans()
  })

  beforeEach(async () => {
    owner = await createUser()
  })

  const auth = () => ({ Authorization: `Bearer ${owner.token}` })

  function create(design: Record<string, unknown>) {
    return request(app)
      .post("/api/qr")
      .set(auth())
      .send({ name: "framed", type: "URL", content: { data: { url: "https://example.com" } }, design })
  }

  function update(id: string, body: Record<string, unknown>) {
    return request(app).put(`/api/qr/${id}`).set(auth()).send(body)
  }

  it("is on every paid plan and not on FREE", () => {
    expect(PLAN_LIMITS.FREE.premiumFrames).toBe(false)
    for (const plan of ["STARTER", "PRO", "BUSINESS", "ENTERPRISE"] as const) {
      expect(PLAN_LIMITS[plan].premiumFrames).toBe(true)
    }
  })

  it("saves a library frame with its text on a paid plan and returns it", async () => {
    await giveSubscription(owner.id, "STARTER")
    const res = await create({
      frameStyle: "premium:noir-gold",
      frameFields: { brand: "Chai Point", cta: "Scan for the menu" },
    }).expect(201)
    expect(res.body.data.design.frameStyle).toBe("premium:noir-gold")
    expect(res.body.data.design.frameFields).toEqual({ brand: "Chai Point", cta: "Scan for the menu" })

    const got = await request(app).get(`/api/qr/${res.body.data.id}`).set(auth()).expect(200)
    expect(got.body.data.design.frameFields).toEqual({ brand: "Chai Point", cta: "Scan for the menu" })
  })

  it("stores no frameFields when every field is blank", async () => {
    await giveSubscription(owner.id, "STARTER")
    const res = await create({ frameStyle: "shape:coffee-cup", frameFields: { cta: "   " } }).expect(201)
    expect(res.body.data.design.frameFields).toBeNull()
  })

  it("rejects text for a field frames do not have", async () => {
    await giveSubscription(owner.id, "STARTER")
    const res = await create({ frameStyle: "shape:coffee-cup", frameFields: { onload: "x" } })
    expect(res.status).toBe(422)
  })

  it("rejects a malformed library frame id", async () => {
    await giveSubscription(owner.id, "STARTER")
    const res = await create({ frameStyle: "shape:../../etc" })
    expect(res.status).toBe(422)
  })

  describe("after the plan lapses to FREE", () => {
    let qrId: string

    beforeEach(async () => {
      await giveSubscription(owner.id, "PRO")
      const res = await create({
        frameStyle: "shape:coffee-cup",
        frameColor: "#0E9F8E",
        frameFields: { cta: "Scan to order" },
      }).expect(201)
      qrId = res.body.data.id
      await giveSubscription(owner.id, "FREE")
    })

    it("refuses switching to another library frame", async () => {
      const res = await update(qrId, { design: { frameStyle: "occasion:diwali" } })
      expect(res.status).toBe(403)
      const row = await prisma.qRDesign.findUnique({ where: { qrId } })
      expect(row?.frameStyle).toBe("shape:coffee-cup")
    })

    it("refuses changing the frame's text", async () => {
      const res = await update(qrId, { design: { frameStyle: "shape:coffee-cup", frameFields: { cta: "Free coffee" } } })
      expect(res.status).toBe(403)
    })

    it("refuses changing the frame's colour", async () => {
      const res = await update(qrId, { design: { frameStyle: "shape:coffee-cup", frameColor: "#F0524F" } })
      expect(res.status).toBe(403)
    })

    it("still allows saving the code with the frame it already has", async () => {
      // The dashboard re-sends the whole design on every save.
      const res = await update(qrId, {
        name: "renamed",
        design: { frameStyle: "shape:coffee-cup", frameColor: "#0E9F8E", frameFields: { cta: "Scan to order" } },
      })
      expect(res.status).toBe(200)
      expect(res.body.data.name).toBe("renamed")
    })

    it("still allows removing the frame", async () => {
      const res = await update(qrId, { design: { frameStyle: "none" } })
      expect(res.status).toBe(200)
      expect(res.body.data.design.frameStyle).toBe("none")
    })

    it("still allows the classic frames", async () => {
      const res = await update(qrId, { design: { frameStyle: "simple", frameText: "SCAN ME" } })
      expect(res.status).toBe(200)
    })
  })
})
