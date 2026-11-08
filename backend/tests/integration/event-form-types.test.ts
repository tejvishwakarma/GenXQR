import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { zonedToUtc } from "../../src/utils/event-calendar.util.js"
import { createUser, giveSubscription, seedPlans, type TestUser } from "../helpers/factories.js"

/**
 * EVENT and FORM codes (8 Nov 2026). Their scan-page extras — the calendar
 * file and form answers — are public, so they must pass the same gate as the
 * page itself, and every answer is checked against the form's own questions.
 */
const as = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` })

async function proUser() {
  const user = await createUser()
  await giveSubscription(user.id, "PRO")
  return user
}

const create = (user: TestUser, type: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  request(app).post("/api/qr").set(as(user)).send({ name: `${type} test`, type, content: { data }, ...extra })

const EVENT = { title: "Diwali Mela, 2026", start: "2026-11-20T19:00", end: "2026-11-20T22:30", timeZone: "Asia/Kolkata", venue: "Cyber Hub", link: "https://tickets.example.com/mela" }
const FORM = {
  title: "Feedback",
  fields: [
    { id: "name", label: "Your name", type: "text", required: true },
    { id: "email", label: "Email", type: "email" },
    { id: "rating", label: "How was it?", type: "rating", required: true },
    { id: "visit", label: "Visit type", type: "select", options: ["Dine-in", "Takeaway"] },
  ],
}

describe("event and form codes", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should convert an event's local time in its own zone to UTC", () => {
    expect(zonedToUtc("2026-11-20T19:00", "Asia/Kolkata").toISOString()).toBe("2026-11-20T13:30:00.000Z")
    expect(zonedToUtc("2026-07-01T12:00", "Europe/London").toISOString()).toBe("2026-07-01T11:00:00.000Z")
    expect(zonedToUtc("2026-01-15T12:00", "America/New_York").toISOString()).toBe("2026-01-15T17:00:00.000Z")
  })

  it("should validate an event and serve its calendar file through the page's gate", async () => {
    const user = await proUser()
    await create(user, "EVENT", { ...EVENT, title: "" }).expect(422)
    await create(user, "EVENT", { ...EVENT, end: "2026-11-20T18:00" }).expect(422)
    await create(user, "EVENT", { ...EVENT, timeZone: "Mars/Olympus" }).expect(422)
    await create(user, "EVENT", { ...EVENT, link: "http://tickets.example.com" }).expect(422)
    const res = await create(user, "EVENT", EVENT)
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    const { id, slug } = res.body.data as { id: string; slug: string }

    const ics = await request(app).get(`/api/public/qr/${slug}/calendar.ics`).expect(200)
    expect(ics.headers["content-type"]).toContain("text/calendar")
    expect(ics.text).toContain("DTSTART:20261120T133000Z")
    expect(ics.text).toContain("DTEND:20261120T170000Z")
    expect(ics.text).toContain("SUMMARY:Diwali Mela\\, 2026")

    // Not when the page itself is not served: switched off, or password-protected.
    // Through the API, as the owner would (it also refreshes the scan cache).
    await request(app).patch(`/api/qr/${id}/toggle`).set(as(user)).expect(200)
    await request(app).get(`/api/public/qr/${slug}/calendar.ics`).expect(404)
    await request(app).patch(`/api/qr/${id}/toggle`).set(as(user)).expect(200)
    await request(app).put(`/api/qr/${id}`).set(as(user)).send({ settings: { password: "secret1" } }).expect(200)
    await request(app).get(`/api/public/qr/${slug}/calendar.ics`).expect(404)
  })

  it("should validate a form's questions", async () => {
    const user = await proUser()
    await create(user, "FORM", { title: "x", fields: [] }).expect(422)
    await create(user, "FORM", { title: "x", fields: [{ id: "a", label: "A", type: "text" }, { id: "a", label: "B", type: "text" }] }).expect(422)
    await create(user, "FORM", { title: "x", fields: [{ id: "a", label: "A", type: "select", options: ["only one"] }] }).expect(422)
    await create(user, "FORM", { title: "x", fields: [{ id: "a", label: "A", type: "script" }] }).expect(422)
    await create(user, "FORM", FORM).expect(201)
  })

  it("should accept only answers that fit the form, and show them only to the owner", async () => {
    const owner = await proUser()
    const { id, slug } = (await create(owner, "FORM", FORM).expect(201)).body.data as { id: string; slug: string }
    const answer = (answers: Record<string, unknown>) => request(app).post(`/api/public/qr/${slug}/responses`).send({ answers })

    await answer({ email: "a@b.co", rating: "5" }).expect(422) // name is required
    await answer({ name: "Asha", rating: "6" }).expect(422)
    await answer({ name: "Asha", rating: "4", email: "not-an-email" }).expect(422)
    await answer({ name: "Asha", rating: "4", visit: "Delivery" }).expect(422)
    await answer({ name: "=HYPERLINK(\"x\")", rating: "4", visit: "Dine-in", extra: "dropped" }).expect(201)

    const list = await request(app).get(`/api/qr/${id}/responses`).set(as(owner)).expect(200)
    expect(list.body.pagination.total).toBe(1)
    const data = list.body.data[0].data as Array<{ id: string; value: string }>
    expect(data.map((a) => a.id)).toEqual(["name", "email", "rating", "visit"])

    const csv = await request(app).get(`/api/qr/${id}/responses/csv`).set(as(owner)).expect(200)
    expect(csv.text).toContain('"\'=HYPERLINK(""x"")"') // formula neutralised

    const other = await proUser()
    await request(app).get(`/api/qr/${id}/responses`).set(as(other)).expect(404)
    await request(app).get(`/api/qr/${id}/responses/csv`).set(as(other)).expect(404)
    await request(app).delete(`/api/qr/${id}/responses/${list.body.data[0].id}`).set(as(other)).expect(404)
    await request(app).delete(`/api/qr/${id}/responses/${list.body.data[0].id}`).set(as(owner)).expect(200)
    expect(await prisma.formResponse.count({ where: { qrId: id } })).toBe(0)
  })

  it("should not take answers for a code that is off or is not a form", async () => {
    const owner = await proUser()
    const form = (await create(owner, "FORM", FORM).expect(201)).body.data as { id: string; slug: string }
    await request(app).patch(`/api/qr/${form.id}/toggle`).set(as(owner)).expect(200)
    await request(app).post(`/api/public/qr/${form.slug}/responses`).send({ answers: { name: "A", rating: "3" } }).expect(404)
    const event = (await create(owner, "EVENT", EVENT).expect(201)).body.data as { slug: string }
    await request(app).post(`/api/public/qr/${event.slug}/responses`).send({ answers: { name: "A", rating: "3" } }).expect(404)
    expect(await prisma.formResponse.count({ where: { qrId: form.id } })).toBe(0)
  })
})
