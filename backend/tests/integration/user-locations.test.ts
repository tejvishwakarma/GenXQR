import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { fillMissingUserLocations, usableClientIp } from "../../src/services/user-location.service.js"
import { createAdmin, createSuperAdmin, createUser, giveSubscription, seedPlans } from "../helpers/factories.js"

/**
 * Where users sign up and sign in from, for the admin panel (24 Oct 2026).
 * GeoLite is mocked: CI has no database, and the point here is what is stored
 * and who sees it, not MaxMind's answers.
 */

const geo = vi.hoisted(() => ({
  ready: true,
  places: {
    "49.36.10.20": { country: "India", countryCode: "IN", region: "Maharashtra", city: "Mumbai" },
    "8.8.8.8": { country: "United States", countryCode: "US", region: "California", city: "Mountain View" },
    "81.2.69.160": { country: "United Kingdom", countryCode: "GB", region: "England", city: "London" },
  } as Record<string, { country: string; countryCode: string; region: string; city: string }>,
  looked: [] as string[],
}))

vi.mock("../../src/services/geo.service.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../src/services/geo.service.js")>()
  return {
    ...real,
    isGeoReady: async () => geo.ready,
    lookupGeo: async (ip: string) => {
      geo.looked.push(ip)
      const p = geo.places[ip]
      return p ? { ...p, lat: null, lng: null } : { country: null, countryCode: null, region: null, city: null, lat: null, lng: null }
    },
  }
})

const CLOUDFLARE_EDGE = "172.64.10.20"

beforeAll(async () => {
  await seedPlans()
})

beforeEach(() => {
  geo.ready = true
  geo.looked = []
})

afterEach(() => {
  vi.restoreAllMocks()
})

const login = (email: string, password: string, ip: string) =>
  request(app).post("/api/auth/login").set("X-Forwarded-For", ip).send({ email, password })

describe("recording where users are", () => {
  it("should record the sign-up location from the client's IP", async () => {
    const email = `where.${Date.now()}@test.local`
    await request(app)
      .post("/api/auth/register")
      .set("X-Forwarded-For", "49.36.10.20")
      .send({ name: "Mumbai User", email, password: "TestPass123!" })
      .expect(201)

    const u = await prisma.user.findUniqueOrThrow({ where: { email } })
    expect(u).toMatchObject({ signupIp: "49.36.10.20", signupCountryCode: "IN", signupCountry: "India", signupRegion: "Maharashtra", signupCity: "Mumbai" })
  })

  it("should record the last sign-in location on every sign-in", async () => {
    const user = await createUser()
    await login(user.email, user.password, "8.8.8.8").expect(200)
    await login(user.email, user.password, "81.2.69.160").expect(200)

    const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(u).toMatchObject({ lastLoginIp: "81.2.69.160", lastLoginCountryCode: "GB", lastLoginCity: "London" })
  })

  it("should never store or locate a Cloudflare edge as the user's address", async () => {
    const user = await createUser()
    // Only trusted hops: req.ip ends up being the Cloudflare edge itself.
    await login(user.email, user.password, CLOUDFLARE_EDGE).expect(200)

    const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(u.lastLoginIp).toBeNull()
    expect(u.lastLoginCountryCode).toBe("ZZ")
    expect(geo.looked).not.toContain(CLOUDFLARE_EDGE)
  })

  it("should tell which addresses can be a user's own", () => {
    expect(usableClientIp("::ffff:8.8.8.8")).toBe("8.8.8.8")
    expect(usableClientIp(CLOUDFLARE_EDGE)).toBeNull()
    expect(usableClientIp("2606:4700::1111")).toBeNull() // Cloudflare IPv6
    expect(usableClientIp("10.1.2.3")).toBeNull()
    expect(usableClientIp("::1")).toBeNull()
    expect(usableClientIp("not an ip")).toBeNull()
    expect(usableClientIp("2001:4860:4860::8888")).toBe("2001:4860:4860::8888")
  })

  it("should leave the location for later, not 'unknown', when the database is not loaded", async () => {
    geo.ready = false
    const user = await createUser()
    await login(user.email, user.password, "8.8.8.8").expect(200)

    let u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(u.lastLoginIp).toBe("8.8.8.8")
    expect(u.lastLoginCountryCode).toBeNull()

    expect(await fillMissingUserLocations()).toBe(0) // still not loaded: nothing guessed
    geo.ready = true
    await fillMissingUserLocations()
    u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(u).toMatchObject({ lastLoginIp: "8.8.8.8", lastLoginCountryCode: "US" })
  })
})

describe("filling in existing accounts from the audit log", () => {
  it("should use the first and latest usable IPs, skipping Cloudflare's", async () => {
    const user = await createUser()
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    const at = (min: number) => new Date(Date.now() - min * 60_000)
    await prisma.auditLog.createMany({
      data: [
        { userId: user.id, action: "auth.register", ip: CLOUDFLARE_EDGE, createdAt: at(300) }, // before the trust-proxy fix
        { userId: user.id, action: "auth.login", ip: "::ffff:49.36.10.20", createdAt: at(200) },
        { userId: user.id, action: "auth.login.google", ip: "8.8.8.8", createdAt: at(100) },
        { userId: user.id, action: "auth.login", ip: CLOUDFLARE_EDGE, createdAt: at(50) },
        { userId: user.id, action: "qr.create", ip: "81.2.69.160", createdAt: at(10) }, // not a sign-in
      ],
    })

    await fillMissingUserLocations()

    const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(u).toMatchObject({ signupIp: "49.36.10.20", signupCountryCode: "IN", lastLoginIp: "8.8.8.8", lastLoginCountryCode: "US" })
  })

  it("should mark an account whose only IPs were Cloudflare's as unknown, once", async () => {
    const user = await createUser()
    await prisma.auditLog.create({ data: { userId: user.id, action: "auth.register", ip: CLOUDFLARE_EDGE } })

    await fillMissingUserLocations()
    const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(u.signupIp).toBeNull()
    expect(u.signupCountryCode).toBe("ZZ")
    // Nothing left to do: the next run does not revisit it.
    expect(await fillMissingUserLocations()).toBe(0)
  })
})

describe("admin views", () => {
  async function locatedUser(signup: string | null, lastLogin: string | null) {
    const user = await createUser()
    const place = (ip: string | null) => (ip ? geo.places[ip]! : null)
    const s = place(signup), l = place(lastLogin)
    await prisma.user.update({
      where: { id: user.id },
      data: {
        signupIp: signup, signupCountryCode: s?.countryCode ?? "ZZ", signupCountry: s?.country ?? null, signupRegion: s?.region ?? null, signupCity: s?.city ?? null,
        lastLoginIp: lastLogin, lastLoginCountryCode: l?.countryCode ?? (lastLogin === null ? null : "ZZ"), lastLoginCountry: l?.country ?? null,
        lastLoginRegion: l?.region ?? null, lastLoginCity: l?.city ?? null, lastLoginAt: lastLogin ? new Date() : null,
      },
    })
    return user
  }

  it("should show the IP address to a super-admin only, and the location to every admin", async () => {
    const target = await locatedUser("49.36.10.20", "8.8.8.8")
    const superAdmin = await createSuperAdmin()
    const admin = await createAdmin()

    const asSuper = await request(app).get(`/admin-api/users/${target.id}`).set("Authorization", `Bearer ${superAdmin.token}`).expect(200)
    expect(asSuper.body.data.location.signup).toMatchObject({ ip: "49.36.10.20", countryCode: "IN", city: "Mumbai" })
    expect(asSuper.body.data.location.lastLogin).toMatchObject({ ip: "8.8.8.8", countryCode: "US" })

    const asAdmin = await request(app).get(`/admin-api/users/${target.id}`).set("Authorization", `Bearer ${admin.token}`).expect(200)
    expect(asAdmin.body.data.location.signup).toMatchObject({ countryCode: "IN", city: "Mumbai" })
    expect(JSON.stringify(asAdmin.body), "REAL BUG: an ADMIN received a user's IP address").not.toMatch(/49\.36\.10\.20|8\.8\.8\.8/)
  })

  it("should keep every audit-log IP but show and search it for super-admins only", async () => {
    const user = await createUser()
    await prisma.auditLog.create({ data: { userId: user.id, action: "auth.login", category: "auth", ip: "49.36.10.20" } })
    const superAdmin = await createSuperAdmin()
    const admin = await createAdmin()

    const asSuper = await request(app).get("/admin-api/audit?limit=50&ip=49.36").set("Authorization", `Bearer ${superAdmin.token}`).expect(200)
    expect(asSuper.body.data.map((e: { ip: string }) => e.ip)).toContain("49.36.10.20")

    const asAdmin = await request(app).get("/admin-api/audit?limit=50").set("Authorization", `Bearer ${admin.token}`).expect(200)
    expect(asAdmin.body.data.some((e: { action: string }) => e.action === "auth.login"), "the entry itself is still listed").toBe(true)
    expect(JSON.stringify(asAdmin.body), "REAL BUG: an ADMIN received a user's IP from the audit log").not.toMatch(/49\.36\.10\.20/)
    // Searching by IP would reveal it too.
    await request(app).get("/admin-api/audit?ip=49.36").set("Authorization", `Bearer ${admin.token}`).expect(403)
    // Nothing was deleted: the row still has its IP.
    expect(await prisma.auditLog.count({ where: { userId: user.id, ip: "49.36.10.20" } })).toBe(1)
  })

  it("should filter the users list by country, falling back to the last sign-in country", async () => {
    const admin = await createAdmin()
    const indian = await locatedUser("49.36.10.20", null)
    const usOnLogin = await locatedUser(null, "8.8.8.8") // sign-up unknown → last sign-in decides
    const unknown = await locatedUser(null, null)

    const ids = async (country: string) => {
      const res = await request(app).get(`/admin-api/users?limit=100&country=${country}`).set("Authorization", `Bearer ${admin.token}`).expect(200)
      return res.body.data.map((u: { id: string }) => u.id)
    }
    expect(await ids("IN")).toEqual([indian.id])
    expect(await ids("US")).toEqual([usOnLogin.id])
    expect(await ids("ZZ")).toContain(unknown.id)
    expect(await ids("ZZ")).not.toContain(indian.id)

    const list = await request(app).get("/admin-api/users?limit=100").set("Authorization", `Bearer ${admin.token}`).expect(200)
    const row = list.body.data.find((u: { id: string }) => u.id === usOnLogin.id)
    expect(row.country).toEqual({ code: "US", name: "United States" })
    expect(JSON.stringify(list.body)).not.toMatch(/8\.8\.8\.8/)
    await request(app).get("/admin-api/users?country=india").set("Authorization", `Bearer ${admin.token}`).expect(422)
  })

  it("should report users, trials, paid customers and revenue per country", async () => {
    const admin = await createAdmin()
    const paying = await locatedUser("49.36.10.20", null)
    const sub = await giveSubscription(paying.id, "PRO")
    await prisma.invoice.create({ data: { userId: paying.id, subscriptionId: sub.id, cashfreeOrderId: `geo_${Date.now()}`, amount: 79900, currency: "INR", status: "paid", planName: "PRO", billingCycle: "monthly", periodStart: new Date(), periodEnd: new Date() } })
    const trialing = await locatedUser("49.36.10.20", null)
    const pro = await prisma.plan.findUniqueOrThrow({ where: { name: "PRO" } })
    await prisma.subscription.create({ data: { userId: trialing.id, planId: pro.id, status: "TRIALING", trialEndsAt: new Date(Date.now() + 86_400_000), currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 86_400_000) } })
    await locatedUser("8.8.8.8", null)
    await locatedUser(null, null)

    const res = await request(app).get("/admin-api/analytics/user-countries?days=30").set("Authorization", `Bearer ${admin.token}`).expect(200)
    const byCode = Object.fromEntries(res.body.data.rows.map((r: { countryCode: string }) => [r.countryCode, r]))
    expect(byCode["IN"]).toMatchObject({ country: "India", users: 2, trialing: 1, paidUsers: 1, revenue: 799 })
    expect(byCode["US"]).toMatchObject({ users: 1, paidUsers: 0 })
    expect(byCode["ZZ"].users).toBeGreaterThanOrEqual(1)
    expect(res.body.data.cities[0]).toMatchObject({ city: "Mumbai", countryCode: "IN", users: 2 })

    const trend = await request(app).get("/admin-api/analytics/signups-by-country?days=7").set("Authorization", `Bearer ${admin.token}`).expect(200)
    expect(trend.body.data.countries.map((c: { code: string }) => c.code)).toEqual(["IN", "US"])
    const today = trend.body.data.series.at(-1)
    expect(today).toMatchObject({ IN: 2, US: 1, OTHER: 0 })
    expect(trend.body.data.series.length).toBeGreaterThanOrEqual(7) // every day, zeros included
  })
})
