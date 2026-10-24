import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { createQRCode, createUser, seedPlans } from "../helpers/factories.js"

/**
 * Auth rate limits (security audit, 23 Oct 2026). One 10-per-15-min counter per
 * IP used to cover login, sign-up, password reset, QR passwords and /refresh —
 * which every open tab calls — so a shared office/carrier IP logged people out,
 * while guessing one account's password from many IPs was not slowed at all.
 */

/** A request from a given visitor IP (through Cloudflare + nginx). */
const from = (ip: string) => ({ "X-Forwarded-For": `${ip}, 162.158.0.1` })

describe("auth rate limits", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should not let QR-password guesses use up the address's sign-in attempts", async () => {
    const user = await createUser()
    const qr = await createQRCode(user.id)
    for (let i = 0; i < 12; i++) {
      await request(app).post(`/r/${qr.slug}/password`).set(from("203.0.113.40")).send({ password: "wrong" })
    }
    const login = await request(app).post("/api/auth/login").set(from("203.0.113.40")).send({ email: user.email, password: user.password })
    expect(login.status).toBe(200)
  })

  it("should not throttle session refreshes at the sign-in limit", async () => {
    for (let i = 0; i < 25; i++) {
      const res = await request(app).post("/api/auth/refresh").set(from("203.0.113.41"))
      expect(res.status, `refresh #${i + 1}`).not.toBe(429)
    }
  })

  it("should limit attempts on one account even when they come from many addresses", async () => {
    const user = await createUser()
    let last = 0
    for (let i = 0; i < 11; i++) {
      last = (await request(app).post("/api/auth/login").set(from(`198.51.100.${i + 1}`)).send({ email: user.email, password: "wrong" })).status
    }
    expect(last).toBe(429)
    // A different account from those same addresses is unaffected.
    const other = await createUser()
    expect((await request(app).post("/api/auth/login").set(from("198.51.100.1")).send({ email: other.email, password: other.password })).status).toBe(200)
  })

  it("should still limit sign-in attempts per address", async () => {
    let last = 0
    for (let i = 0; i < 11; i++) {
      last = (await request(app).post("/api/auth/login").set(from("203.0.113.42")).send({ email: `nobody${i}@test.local`, password: "x" })).status
    }
    expect(last).toBe(429)
  })
})
