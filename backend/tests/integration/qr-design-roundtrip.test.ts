import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { createUser, giveSubscription, seedPlans, type TestUser } from "../helpers/factories.js"

/**
 * Design field round-trip: POST /api/qr -> GET /api/qr/:id.
 *
 * Written after a field-name mismatch shipped silently. The frontend sent
 * `frameBgColor`; the schema and Prisma model both call it `frameColor`. Zod
 * strips unknown keys by default, so the request validated, returned 201, and
 * quietly discarded the colour — no error anywhere. The reader then fell back
 * to a hardcoded default, so the UI showed a plausible-but-wrong value.
 *
 * A 201 therefore proves nothing about persistence. These tests assert that
 * what goes in comes back out, field by field.
 */
describe("QR design round-trip", () => {
  let user: TestUser

  beforeAll(async () => {
    await seedPlans()
  })

  const DESIGN = {
    primaryColor: "#e11d48",
    backgroundColor: "#ffffff",
    dotStyle: "rounded",
    cornerSquareStyle: "extra-rounded",
    frameStyle: "simple",
    frameText: "SCAN ME",
    frameColor: "#e11d48",
    logoSize: 30,
  } as const

  async function createQR(design: Record<string, unknown>) {
    user = await createUser()
    await giveSubscription(user.id, "PRO")

    const res = await request(app)
      .post("/api/qr")
      .set("Authorization", `Bearer ${user.token}`)
      .send({
        name: "Design round-trip",
        type: "URL",
        category: "DYNAMIC",
        content: { data: { url: "https://example.com" } },
        design,
      })

    return res
  }

  async function fetchQR(id: string) {
    const res = await request(app)
      .get(`/api/qr/${id}`)
      .set("Authorization", `Bearer ${user.token}`)
    expect(res.status).toBe(200)
    return res.body.data
  }

  it("should persist every design field it accepts", async () => {
    const created = await createQR(DESIGN)
    expect(created.status).toBe(201)

    const fetched = await fetchQR(created.body.data.id)

    // Asserted field-by-field so a failure names the field that didn't survive.
    expect(fetched.design.primaryColor).toBe(DESIGN.primaryColor)
    expect(fetched.design.backgroundColor).toBe(DESIGN.backgroundColor)
    expect(fetched.design.dotStyle).toBe(DESIGN.dotStyle)
    expect(fetched.design.cornerSquareStyle).toBe(DESIGN.cornerSquareStyle)
    expect(fetched.design.frameStyle).toBe(DESIGN.frameStyle)
    expect(fetched.design.frameText).toBe(DESIGN.frameText)
    expect(fetched.design.frameColor).toBe(DESIGN.frameColor)
    expect(fetched.design.logoSize).toBe(DESIGN.logoSize)
  })

  it("should persist frameColor specifically, not silently drop it", async () => {
    // The exact regression: frameColor present and distinct from primaryColor,
    // so a fallback or a copy of another field can't make this pass by accident.
    const created = await createQR({ ...DESIGN, primaryColor: "#000000", frameColor: "#e11d48" })
    expect(created.status).toBe(201)

    const fetched = await fetchQR(created.body.data.id)

    expect(fetched.design.frameColor).toBe("#e11d48")
    expect(fetched.design.frameColor).not.toBe(fetched.design.primaryColor)
    // #1f2937 is the frontend's default — if it appears, the value was lost.
    expect(fetched.design.frameColor).not.toBe("#1f2937")
  })

  it("should survive an update without resetting frameColor", async () => {
    const created = await createQR(DESIGN)
    const id = created.body.data.id

    // Rename only. The frame colour must not be collateral damage.
    const updated = await request(app)
      .put(`/api/qr/${id}`)
      .set("Authorization", `Bearer ${user.token}`)
      .send({ name: "Renamed", design: { ...DESIGN, frameColor: "#0ea5e9" } })

    expect(updated.status).toBe(200)

    const fetched = await fetchQR(id)
    expect(fetched.design.frameColor).toBe("#0ea5e9")
    expect(fetched.design.frameText).toBe(DESIGN.frameText)
  })

  it("should reject a malformed colour rather than store it", async () => {
    // Guards the regex on the colour fields — a silent accept here would be
    // the same class of bug from the other direction.
    const created = await createQR({ ...DESIGN, frameColor: "not-a-colour" })

    expect(created.status).toBe(422)
  })
})
