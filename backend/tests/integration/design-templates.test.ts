import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { isFileReferenced } from "../../src/services/uploads.service.js"
import { createUser, giveSubscription, seedPlans, type TestUser } from "../helpers/factories.js"

/**
 * Brand templates (8 Nov 2026): saved QR designs, per workspace owner. The
 * design is validated with the QR design schema's own rules, and a template's
 * logo counts as a use of that upload, so file clean-up keeps it.
 */
const as = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` })

async function proUser() {
  const user = await createUser()
  await giveSubscription(user.id, "PRO")
  return user
}

const DESIGN = {
  primaryColor: "#0f172a", backgroundColor: "#ffffff", dotStyle: "dots", cornerSquareStyle: "extra-rounded",
  frameStyle: "shape:coffee-cup", frameColor: "#0f172a", logoSize: 30,
}

describe("design templates", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should save, list, rename and delete templates, names unique ignoring case", async () => {
    const user = await proUser()
    const res = await request(app).post("/api/design-templates").set(as(user)).send({ name: "Blue Cafe brand", design: DESIGN })
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    const t = res.body.data as { id: string; design: Record<string, unknown> }
    expect(t.design).toMatchObject(DESIGN)

    await request(app).post("/api/design-templates").set(as(user)).send({ name: "blue cafe BRAND", design: DESIGN }).expect(409)
    await request(app).patch(`/api/design-templates/${t.id}`).set(as(user)).send({ name: "Blue Cafe — print" }).expect(200)
    const list = await request(app).get("/api/design-templates").set(as(user)).expect(200)
    expect(list.body.data.map((x: { name: string }) => x.name)).toEqual(["Blue Cafe — print"])
    await request(app).delete(`/api/design-templates/${t.id}`).set(as(user)).expect(200)
    expect((await request(app).get("/api/design-templates").set(as(user)).expect(200)).body.data).toEqual([])
  })

  it("should refuse designs the QR editor would refuse", async () => {
    const user = await proUser()
    const send = (design: Record<string, unknown>) => request(app).post("/api/design-templates").set(as(user)).send({ name: "x", design })
    await send({ primaryColor: "red;}</style><script>" }).expect(422)
    await send({ frameStyle: "shape:../../etc/passwd" }).expect(422)
    await send({ logoUrl: "javascript:alert(1)" }).expect(422)
    await send({ frameFields: { notAField: "x" } }).expect(422)
  })

  it("should not let one account see, rename or delete another's template", async () => {
    const owner = await proUser()
    const other = await proUser()
    const t = (await request(app).post("/api/design-templates").set(as(owner)).send({ name: "Mine", design: DESIGN }).expect(201)).body.data as { id: string }
    expect((await request(app).get("/api/design-templates").set(as(other)).expect(200)).body.data).toEqual([])
    await request(app).patch(`/api/design-templates/${t.id}`).set(as(other)).send({ name: "Taken" }).expect(404)
    await request(app).delete(`/api/design-templates/${t.id}`).set(as(other)).expect(404)
    expect((await request(app).get("/api/design-templates").set(as(owner)).expect(200)).body.data).toHaveLength(1)
  })

  it("should count a template's logo as a use of the upload", async () => {
    const user = await proUser()
    const logo = `/uploads/qr-files/tpl-logo-${Date.now()}.png`
    expect(await isFileReferenced(logo)).toBe(false)
    const t = (await request(app).post("/api/design-templates").set(as(user)).send({ name: "With logo", design: { ...DESIGN, logoUrl: logo } }).expect(201)).body.data as { id: string; design: { logoUrl: string } }
    expect(t.design.logoUrl).toBe(logo)
    expect(await isFileReferenced(logo)).toBe(true)
    await request(app).delete(`/api/design-templates/${t.id}`).set(as(user)).expect(200)
    expect(await isFileReferenced(logo)).toBe(false)
  })
})
