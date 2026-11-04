import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { processScanJob } from "../../src/workers/scan.worker.js"
import { createApiKey } from "../../src/services/apikeys.service.js"
import { PLAN_LIMITS } from "../../src/services/billing.service.js"
import { createQRCode, createUser, giveSubscription, seedPlans, type TestUser } from "../helpers/factories.js"

/**
 * Places (4 Nov 2026): a code is printed for a place, every scan records the
 * code's place AT scan time, and analytics can be read per place.
 */
const as = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` })

async function proUser() {
  const user = await createUser()
  await giveSubscription(user.id, "PRO")
  return user
}

async function addPlace(user: TestUser, body: Record<string, unknown>) {
  const res = await request(app).post("/api/places").set(as(user)).send(body)
  expect(res.status, JSON.stringify(res.body)).toBe(201)
  return res.body.data as { id: string; name: string; code: string | null }
}

const scan = (qrId: string, at = new Date()) =>
  processScanJob({ data: { qrId, ip: "203.0.113.9", userAgent: "test", referrer: undefined, scannedAt: at.toISOString(), isUnique: true } } as never)

describe("places", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should keep names and location IDs unique per account, ignoring case", async () => {
    const user = await proUser()
    await addPlace(user, { name: "Millennium City Centre Metro", code: "DEL-MCC-01", city: "Gurugram", lat: 28.459, lng: 77.072 })
    await request(app).post("/api/places").set(as(user)).send({ name: "millennium city centre metro" }).expect(409)
    await request(app).post("/api/places").set(as(user)).send({ name: "Other", code: "del-mcc-01" }).expect(409)
    // Half a map pin is refused.
    await request(app).post("/api/places").set(as(user)).send({ name: "Pinless", lat: 28.4 }).expect(422)
    // Another account may use the same name.
    await addPlace(await proUser(), { name: "Millennium City Centre Metro" })
  })

  it("should not let one account use, see or change another's place", async () => {
    const owner = await proUser()
    const other = await proUser()
    const place = await addPlace(owner, { name: "Cyber Hub" })

    await request(app).post("/api/qr").set(as(other))
      .send({ name: "x", type: "URL", placeId: place.id, content: { data: { url: "https://example.com" } } })
      .expect(422)
    const mine = await createQRCode(other.id)
    await request(app).put(`/api/qr/${mine.id}`).set(as(other)).send({ placeId: place.id }).expect(422)
    await request(app).patch(`/api/places/${place.id}`).set(as(other)).send({ name: "Mine now" }).expect(404)
    await request(app).delete(`/api/places/${place.id}`).set(as(other)).expect(404)
    await request(app).get(`/api/analytics/global?placeId=${place.id}`).set(as(other)).expect(404)
    const list = await request(app).get("/api/places").set(as(other)).expect(200)
    expect(list.body.data).toEqual([])
  })

  it("should record the code's place on each scan, and keep it when the code moves", async () => {
    const user = await proUser()
    const metro = await addPlace(user, { name: "MCC Metro" })
    const hub = await addPlace(user, { name: "Cyber Hub" })
    const created = await request(app).post("/api/qr").set(as(user))
      .send({ name: "Poster", type: "URL", placeId: metro.id, content: { data: { url: "https://example.com" } } })
      .expect(201)
    const qrId = created.body.data.id as string
    expect(created.body.data.place).toMatchObject({ id: metro.id, name: "MCC Metro" })

    await scan(qrId)
    await scan(qrId)
    await request(app).put(`/api/qr/${qrId}`).set(as(user)).send({ placeId: hub.id }).expect(200)
    await scan(qrId)

    expect(await prisma.qRScan.count({ where: { qrId, placeId: metro.id } })).toBe(2)
    expect(await prisma.qRScan.count({ where: { qrId, placeId: hub.id } })).toBe(1)

    const places = await request(app).get("/api/places").set(as(user)).expect(200)
    const byName = Object.fromEntries((places.body.data as Array<{ name: string; totalScans: number; codeCount: number }>).map((p) => [p.name, p]))
    expect(byName["MCC Metro"]).toMatchObject({ totalScans: 2, codeCount: 0 })
    expect(byName["Cyber Hub"]).toMatchObject({ totalScans: 1, codeCount: 1 })
  })

  it("should give a code's earlier scans to the first place it is put at", async () => {
    const user = await proUser()
    const qr = await createQRCode(user.id)
    await scan(qr.id)
    const metro = await addPlace(user, { name: "MCC Metro" })
    await request(app).put(`/api/qr/${qr.id}`).set(as(user)).send({ placeId: metro.id }).expect(200)
    expect(await prisma.qRScan.count({ where: { qrId: qr.id, placeId: metro.id } })).toBe(1)
  })

  it("should report analytics for one place across its codes", async () => {
    const user = await proUser()
    const metro = await addPlace(user, { name: "MCC Metro" })
    const hub = await addPlace(user, { name: "Cyber Hub" })
    const make = (name: string, placeId: string) =>
      request(app).post("/api/qr").set(as(user)).send({ name, type: "URL", placeId, content: { data: { url: "https://example.com" } } }).expect(201)
    const a = (await make("A", metro.id)).body.data.id as string
    const b = (await make("B", metro.id)).body.data.id as string
    const c = (await make("C", hub.id)).body.data.id as string
    await scan(a); await scan(a); await scan(b); await scan(c)

    const one = await request(app).get(`/api/analytics/global?placeId=${metro.id}&days=7`).set(as(user)).expect(200)
    expect(one.body.data).toMatchObject({ totalScans: 3, totalQRs: 2, place: { id: metro.id, name: "MCC Metro" } })
    expect(one.body.data.topQRs.map((q: { name: string; scanCount: number }) => [q.name, q.scanCount])).toEqual([["A", 2], ["B", 1]])
    const today = new Date().toISOString().slice(0, 10)
    expect(one.body.data.timeline.find((p: { date: string }) => p.date === today)?.count).toBe(3)

    const all = await request(app).get("/api/analytics/global?days=7").set(as(user)).expect(200)
    expect(all.body.data.byPlace.map((p: { name: string; count: number }) => [p.name, p.count])).toEqual([["MCC Metro", 3], ["Cyber Hub", 1]])
  })

  it("should filter and search codes by place", async () => {
    const user = await proUser()
    const metro = await addPlace(user, { name: "MCC Metro", code: "DEL-MCC-01" })
    await request(app).post("/api/qr").set(as(user)).send({ name: "Placed", type: "URL", placeId: metro.id, content: { data: { url: "https://example.com" } } }).expect(201)
    await createQRCode(user.id, { name: "Unplaced" })
    const names = async (q: string) =>
      ((await request(app).get(`/api/qr?${q}`).set(as(user)).expect(200)).body.data as Array<{ name: string }>).map((x) => x.name)
    expect(await names(`placeId=${metro.id}`)).toEqual(["Placed"])
    expect(await names("placeId=none")).toEqual(["Unplaced"])
    expect(await names("search=mcc")).toEqual(["Placed"])
    expect(await names("search=del-mcc-01")).toEqual(["Placed"])
  })

  it("should page the scan log with exact times and a date range", async () => {
    const user = await proUser()
    const qr = await createQRCode(user.id)
    const base = Date.UTC(2026, 9, 10, 8, 30)
    for (let i = 0; i < 5; i++) await scan(qr.id, new Date(base + i * 86_400_000))

    const page1 = await request(app).get(`/api/analytics/${qr.id}/scans?limit=2`).set(as(user)).expect(200)
    expect(page1.body.pagination).toMatchObject({ total: 5, totalPages: 3 })
    expect(page1.body.data[0].scannedAt).toBe(new Date(base + 4 * 86_400_000).toISOString())
    expect(page1.body.data[0].ip).not.toBe("203.0.113.9")

    const from = new Date(base + 86_400_000).toISOString()
    const to = new Date(base + 3 * 86_400_000).toISOString()
    const ranged = await request(app).get(`/api/analytics/${qr.id}/scans?from=${from}&to=${to}`).set(as(user)).expect(200)
    expect(ranged.body.data.map((s: { scannedAt: string }) => s.scannedAt)).toEqual([
      new Date(base + 2 * 86_400_000).toISOString(),
      new Date(base + 86_400_000).toISOString(),
    ])

    await request(app).get(`/api/analytics/${qr.id}/scans`).set(as(await proUser())).expect(404)
  })

  it("should match or create places from bulk CSV rows", async () => {
    const user = await proUser()
    const existing = await addPlace(user, { name: "MCC Metro", code: "DEL-MCC-01" })
    const csv = [
      "name,url,place,location_id,place_city",
      "By ID,https://example.com/1,,del-mcc-01,",
      "By name,https://example.com/2,mcc metro,,",
      "New,https://example.com/3,Cyber Hub,DEL-CH-01,Gurugram",
      "Again,https://example.com/4,Cyber Hub,,",
      "None,https://example.com/5,,,",
    ].join("\n")
    const res = await request(app).post("/api/bulk/csv").set(as(user)).attach("file", Buffer.from(csv), "codes.csv")
    expect(res.status, JSON.stringify(res.body)).toBe(201)

    const codes = await prisma.qRCode.findMany({ where: { userId: user.id }, select: { name: true, place: { select: { name: true, code: true, city: true } } } })
    const placeOf = Object.fromEntries(codes.map((c) => [c.name, c.place]))
    expect(placeOf["By ID"]?.name).toBe("MCC Metro")
    expect(placeOf["By name"]?.name).toBe("MCC Metro")
    expect(placeOf["New"]).toEqual({ name: "Cyber Hub", code: "DEL-CH-01", city: "Gurugram" })
    expect(placeOf["Again"]?.name).toBe("Cyber Hub")
    expect(placeOf["None"]).toBeNull()
    expect(await prisma.place.count({ where: { userId: user.id } })).toBe(2)
    expect((await prisma.place.findUniqueOrThrow({ where: { id: existing.id } })).name).toBe("MCC Metro")
  })

  it("should copy a code to other places, one active copy each, within the plan limit", async () => {
    const user = await createUser()
    await giveSubscription(user.id, "STARTER")
    const places = await Promise.all(["P1", "P2", "P3"].map((name) => addPlace(user, { name })))
    const original = await request(app).post("/api/qr").set(as(user))
      .send({ name: "Menu", type: "URL", placeId: places[0]!.id, content: { data: { url: "https://example.com/menu" } } })
      .expect(201)

    const res = await request(app).post(`/api/qr/${original.body.data.id}/copy-to-places`).set(as(user))
      .send({ placeIds: [places[1]!.id, places[2]!.id] })
      .expect(201)
    expect(res.body.data.created.map((q: { name: string; isActive: boolean; place: { name: string } }) => [q.name, q.isActive, q.place.name]))
      .toEqual([["Menu — P2", true, "P2"], ["Menu — P3", true, "P3"]])
    const copy = await prisma.qRCode.findFirstOrThrow({ where: { name: "Menu — P2" }, include: { content: true } })
    expect(copy.content?.data).toEqual({ url: "https://example.com/menu" })

    // A place on another account is refused outright.
    const foreign = await addPlace(await proUser(), { name: "Theirs" })
    await request(app).post(`/api/qr/${original.body.data.id}/copy-to-places`).set(as(user)).send({ placeIds: [foreign.id] }).expect(422)

    // At the limit, the rest come back as failed rather than overshooting.
    const limit = PLAN_LIMITS.STARTER.dynamicQRLimit
    const have = await prisma.qRCode.count({ where: { userId: user.id } })
    await prisma.qRCode.createMany({
      data: Array.from({ length: limit - have - 1 }, (_, i) => ({
        userId: user.id, name: `fill ${i}`, slug: `pf${i}${Date.now().toString(36)}`.slice(0, 16), type: "URL" as const, category: "DYNAMIC" as const,
      })),
    })
    const capped = await request(app).post(`/api/qr/${original.body.data.id}/copy-to-places`).set(as(user))
      .send({ placeIds: [places[1]!.id, places[2]!.id] })
      .expect(201)
    expect(capped.body.data.created).toHaveLength(1)
    expect(capped.body.data.failed).toHaveLength(1)
    expect(await prisma.qRCode.count({ where: { userId: user.id } })).toBe(limit)
  })

  it("should carry the place on /v1 scans and list places there", async () => {
    const user = await proUser()
    const { rawKey } = await createApiKey(user.id, "test key")
    const metro = await addPlace(user, { name: "MCC Metro", code: "DEL-MCC-01" })
    const qr = await request(app).post("/v1/qr").set("Authorization", `Bearer ${rawKey}`)
      .send({ name: "Api", type: "URL", placeId: metro.id, content: { data: { url: "https://example.com" } } })
      .expect(201)
    await scan(qr.body.data.id)
    const scans = await request(app).get(`/v1/qr/${qr.body.data.id}/scans`).set("Authorization", `Bearer ${rawKey}`).expect(200)
    expect(scans.body.data[0]).toMatchObject({ placeId: metro.id, placeName: "MCC Metro", placeCode: "DEL-MCC-01" })
    expect(scans.body.data[0]).not.toHaveProperty("place")
    const list = await request(app).get("/v1/places").set("Authorization", `Bearer ${rawKey}`).expect(200)
    expect(list.body.data).toEqual([expect.objectContaining({ id: metro.id, codeCount: 1, totalScans: 1 })])
  })

  it("should keep codes and scan counts when a place is deleted", async () => {
    const user = await proUser()
    const metro = await addPlace(user, { name: "MCC Metro" })
    const created = await request(app).post("/api/qr").set(as(user))
      .send({ name: "Poster", type: "URL", placeId: metro.id, content: { data: { url: "https://example.com" } } })
      .expect(201)
    await scan(created.body.data.id)
    await request(app).delete(`/api/places/${metro.id}`).set(as(user)).expect(200)
    const qr = await prisma.qRCode.findUniqueOrThrow({ where: { id: created.body.data.id } })
    expect(qr).toMatchObject({ placeId: null, scanCount: 1 })
    expect(await prisma.qRScan.count({ where: { qrId: qr.id } })).toBe(1)
  })

  it("should assign codes to a place and take them off it, only the account's own", async () => {
    const user = await proUser()
    const other = await proUser()
    const metro = await addPlace(user, { name: "Metro" })
    const mall = await addPlace(user, { name: "Mall" })
    const unplaced = await createQRCode(user.id, { name: "Unplaced" })
    const atMall = await createQRCode(user.id, { name: "At mall" })
    await prisma.qRCode.update({ where: { id: atMall.id }, data: { placeId: mall.id } })
    const theirs = await createQRCode(other.id, { name: "Theirs" })
    await scan(unplaced.id)
    await scan(atMall.id)

    const res = await request(app)
      .put(`/api/places/${metro.id}/codes`)
      .set(as(user))
      .send({ add: [unplaced.id, atMall.id, theirs.id] })
      .expect(200)
    expect(res.body.data.added.sort()).toEqual([unplaced.id, atMall.id].sort())

    // Another account's code is never touched.
    expect((await prisma.qRCode.findUnique({ where: { id: theirs.id } }))!.placeId).toBeNull()
    // The unplaced code's earlier scan comes along; the mall code's stays at the mall.
    const scans = await prisma.qRScan.findMany({ where: { qrId: { in: [unplaced.id, atMall.id] } }, select: { qrId: true, placeId: true } })
    expect(scans.find((s) => s.qrId === unplaced.id)!.placeId).toBe(metro.id)
    expect(scans.find((s) => s.qrId === atMall.id)!.placeId).toBe(mall.id)

    // Removing only takes codes off THIS place.
    await request(app).put(`/api/places/${mall.id}/codes`).set(as(user)).send({ remove: [unplaced.id] }).expect(200)
    expect((await prisma.qRCode.findUnique({ where: { id: unplaced.id } }))!.placeId).toBe(metro.id)
    const off = await request(app).put(`/api/places/${metro.id}/codes`).set(as(user)).send({ remove: [unplaced.id] }).expect(200)
    expect(off.body.data.removed).toEqual([unplaced.id])
    expect((await prisma.qRCode.findUnique({ where: { id: unplaced.id } }))!.placeId).toBeNull()

    // Someone else's place can't be used.
    await request(app).put(`/api/places/${metro.id}/codes`).set(as(other)).send({ add: [theirs.id] }).expect(404)
    await request(app).put(`/api/places/${metro.id}/codes`).set(as(user)).send({}).expect(422)
  })
})
