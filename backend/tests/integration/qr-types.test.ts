import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { createApiKey } from "../../src/services/apikeys.service.js"
import { createUser, giveSubscription, seedPlans, type TestUser } from "../helpers/factories.js"

/**
 * UPI payment pages and Google review codes (7 Nov 2026): their content has a
 * fixed meaning, so it is validated on create and update (dashboard and /v1),
 * and a review code redirects straight to Google.
 */
const as = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` })

async function proUser() {
  const user = await createUser()
  await giveSubscription(user.id, "PRO")
  return user
}

const create = (user: TestUser, type: string, data: Record<string, unknown>) =>
  request(app).post("/api/qr").set(as(user)).send({ name: `${type} test`, type, content: { data } })

describe("UPI and Google review codes", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should validate a UPI code's ID, name and amount, and serve it on the landing page", async () => {
    const user = await proUser()
    await create(user, "UPI", { upiId: "not-an-id", payeeName: "Blue Cafe" }).expect(422)
    await create(user, "UPI", { upiId: "bluecafe@okhdfcbank", payeeName: "" }).expect(422)
    await create(user, "UPI", { upiId: "bluecafe@okhdfcbank", payeeName: "Blue Cafe", amount: "0" }).expect(422)
    await create(user, "UPI", { upiId: "bluecafe@okhdfcbank", payeeName: "Blue Cafe", amount: "12.345" }).expect(422)
    await create(user, "UPI", { upiId: "bluecafe@okhdfcbank", payeeName: "Blue Cafe", amount: "600000" }).expect(422)

    const res = await create(user, "UPI", { upiId: " BlueCafe@OKHDFCBANK ", payeeName: "Blue Cafe", amount: "0.10", note: "Table 4", extra: "dropped" })
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    const qr = res.body.data as { id: string; slug: string }

    const page = await request(app).get(`/api/public/qr/${qr.slug}`).expect(200)
    expect(page.body.data.type).toBe("UPI")
    expect(page.body.data.content).toEqual({ upiId: "bluecafe@okhdfcbank", payeeName: "Blue Cafe", amount: "0.10", note: "Table 4" })

    // A scan shows the payment page; it is not a redirect.
    const scan = await request(app).get(`/r/${qr.slug}`)
    expect(scan.headers["location"]).toContain(`/l/${qr.slug}`)

    // Editing is checked too, against the code's existing type.
    await request(app).put(`/api/qr/${qr.id}`).set(as(user)).send({ content: { data: { upiId: "x", payeeName: "Blue Cafe" } } }).expect(422)
    await request(app).put(`/api/qr/${qr.id}`).set(as(user)).send({ content: { data: { upiId: "cafe@ybl", payeeName: "Blue Cafe" } } }).expect(200)
  })

  it("should send a Google review code straight to Google, from a Place ID or a review link", async () => {
    const user = await proUser()
    const fromId = await create(user, "GOOGLE_REVIEW", { placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4", businessName: "Blue Cafe" })
    expect(fromId.status, JSON.stringify(fromId.body)).toBe(201)
    const byId = await request(app).get(`/r/${fromId.body.data.slug}`)
    expect(byId.status).toBe(302)
    expect(byId.headers["location"]).toBe("https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4")

    const fromLink = await create(user, "GOOGLE_REVIEW", { reviewUrl: "https://g.page/r/CabcDEF123xyz/review" }).expect(201)
    const byLink = await request(app).get(`/r/${fromLink.body.data.slug}`)
    expect(byLink.status).toBe(302)
    expect(byLink.headers["location"]).toBe("https://g.page/r/CabcDEF123xyz/review")
  })

  it("should refuse a review link that is not Google's, through the dashboard and the API", async () => {
    const user = await proUser()
    await create(user, "GOOGLE_REVIEW", { reviewUrl: "https://evil.example/review" }).expect(422)
    await create(user, "GOOGLE_REVIEW", { reviewUrl: "https://google.com.evil.example/x" }).expect(422)
    await create(user, "GOOGLE_REVIEW", { reviewUrl: "http://g.page/r/abc/review" }).expect(422)
    await create(user, "GOOGLE_REVIEW", { reviewUrl: "javascript:alert(1)" }).expect(422)
    await create(user, "GOOGLE_REVIEW", { placeId: "<script>" }).expect(422)
    await create(user, "GOOGLE_REVIEW", {}).expect(422)
    await create(user, "GOOGLE_REVIEW", { reviewUrl: "https://www.google.co.in/maps/place/x" }).expect(201)

    const { rawKey } = await createApiKey(user.id, "test")
    await request(app).post("/v1/qr").set("Authorization", `Bearer ${rawKey}`)
      .send({ name: "api review", type: "GOOGLE_REVIEW", content: { data: { reviewUrl: "https://evil.example/review" } } })
      .expect(422)
  })
})
