import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { redis } from "../../src/redis/client.js"
import { MAX_RESPONSES_PER_CODE_PER_HOUR } from "../../src/services/form-response.service.js"
import { ipRateKey } from "../../src/utils/rate-key.util.js"
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

  it("should not let a bare carriage return start a new line in the calendar file", async () => {
    const owner = await proUser()
    const { slug } = (await create(owner, "EVENT", { ...EVENT, description: "Bring ID\rATTENDEE:mailto:evil@example.com" }).expect(201)).body.data as { slug: string }
    const ics = await request(app).get(`/api/public/qr/${slug}/calendar.ics`).expect(200)
    expect(ics.text, "REAL BUG: owner text injected a calendar property").not.toMatch(/^ATTENDEE:/m)
    expect(ics.text.split(/\r\n|\n|\r/).filter((l: string) => l.startsWith("ATTENDEE"))).toHaveLength(0)
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

  it("should key per-IP limits on the /64 for IPv6 and the address for IPv4", () => {
    expect(ipRateKey("203.0.113.7")).toBe("203.0.113.7")
    expect(ipRateKey("::ffff:203.0.113.7")).toBe("203.0.113.7")
    expect(ipRateKey("2001:db8:abcd:12::1")).toBe("2001:db8:abcd:12::/64")
    expect(ipRateKey("2001:0db8:abcd:0012:ffff:ffff:ffff:ffff")).toBe("2001:db8:abcd:12::/64")
    expect(ipRateKey("2001:db8:abcd:13::1")).not.toBe(ipRateKey("2001:db8:abcd:12::1"))
    expect(ipRateKey("::1")).toBe("0:0:0:0::/64")
    expect(ipRateKey("fe80::1%eth0")).toBe("fe80:0:0:0::/64")
    expect(ipRateKey(undefined)).toBe("unknown")
  })

  it("should limit answers per network (IPv6 per /64) and per form per hour", async () => {
    const owner = await proUser()
    const { id, slug } = (await create(owner, "FORM", FORM).expect(201)).body.data as { id: string; slug: string }
    const from = (ip: string) => request(app).post(`/api/public/qr/${slug}/responses`).set("X-Forwarded-For", `${ip}, 162.158.0.1`).send({ answers: { name: "A", rating: "3" } })

    // 60 per 15 minutes per network: a client rotating through its own /64 is one network.
    const statuses: number[] = []
    for (let i = 0; i < 62; i++) statuses.push((await from(`2001:db8:f0f0:1:${(i + 1).toString(16)}::1`)).status)
    expect(statuses.filter((c) => c === 201).length, "REAL BUG: each IPv6 address got its own allowance").toBe(60)
    expect(statuses.at(-1)).toBe(429)
    await from("2001:db8:f0f0:2::1").expect(201)

    // And a ceiling per form per hour, whoever is sending.
    const hourKey = `form:rate:${id}:${Math.floor(Date.now() / 3_600_000)}`
    await redis.set(hourKey, String(MAX_RESPONSES_PER_CODE_PER_HOUR), "EX", 600)
    const res = await from("198.51.100.44")
    expect(res.status, "REAL BUG: nothing caps answers per form per hour").toBe(429)
    expect(await prisma.formResponse.count({ where: { qrId: id } })).toBe(61)
  })

  it("should check the stored content when only the type changes", async () => {
    // Content is validated for its type. Changing the type alone kept content
    // checked against the old type: a URL code became a "form" with no rules.
    const owner = await proUser()
    const url = (await create(owner, "URL", { url: "https://example.com", fields: [{ id: "x", label: "Anything", type: "essay" }] }).expect(201)).body.data as { id: string }
    const put = (body: Record<string, unknown>) => request(app).put(`/api/qr/${url.id}`).set(as(owner)).send(body)
    expect((await put({ type: "FORM" })).status, "REAL BUG: a type change skipped the content rules").toBe(422)
    expect((await put({ type: "EVENT" })).status).toBe(422)
    expect((await put({ type: "UPI" })).status).toBe(422)
    await put({ type: "FORM", content: { data: FORM } }).expect(200)
    // Away from a typed kind needs nothing special.
    await put({ type: "URL", content: { data: { url: "https://example.com" } } }).expect(200)
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
