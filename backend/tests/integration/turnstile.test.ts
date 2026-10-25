import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { env } from "../../src/config/env.js"
import { createUser, seedPlans } from "../helpers/factories.js"

/**
 * Cloudflare Turnstile on register/login/contact (25 Oct 2026). Verified
 * through the real routes: enforced when a secret key is set, skipped when not.
 * Cloudflare's siteverify is stubbed — this checks the gate, not Cloudflare.
 */

const SITEVERIFY = "challenges.cloudflare.com/turnstile/v0/siteverify"

/** Stubs siteverify to accept/reject; any other fetch (geo) passes through-ish. */
function stubSiteverify(ok: boolean) {
  const real = globalThis.fetch
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).includes(SITEVERIFY)) {
      return new Response(JSON.stringify({ success: ok, "error-codes": ok ? [] : ["invalid-input-response"] }), {
        status: 200, headers: { "Content-Type": "application/json" },
      })
    }
    return real(input, init)
  })
}

function enableTurnstile() {
  ;(env as Record<string, unknown>).TURNSTILE_SECRET_KEY = "test-secret"
  return () => { (env as Record<string, unknown>).TURNSTILE_SECRET_KEY = undefined }
}

let restore: (() => void) | null = null

beforeAll(async () => {
  await seedPlans()
})

afterEach(() => {
  vi.unstubAllGlobals()
  restore?.()
  restore = null
})

const newEmail = () => `ts.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@test.local`

describe("Turnstile challenge", () => {
  it("should let register/login/contact through WITHOUT a token when not configured", async () => {
    // TURNSTILE_SECRET_KEY unset in the test env → no-op.
    await request(app).post("/api/auth/register")
      .send({ name: "No Turnstile", email: newEmail(), password: "TestPass123!" })
      .expect(201)
    const user = await createUser()
    await request(app).post("/api/auth/login")
      .send({ email: user.email, password: user.password })
      .expect(200)
    // Contact uses the same requireTurnstile middleware as register/login; it is
    // not re-checked here because the test env has no email transport (it would
    // 502 inside the handler, after the gate this file is testing).
  })

  it("should REFUSE register when configured and no token is supplied", async () => {
    restore = enableTurnstile()
    stubSiteverify(true)
    const res = await request(app).post("/api/auth/register")
      .send({ name: "Needs Token", email: newEmail(), password: "TestPass123!" })
    expect(res.status, "REAL BUG: signup bypassed the challenge").toBe(403)
    expect(res.body.error).toMatch(/verification/i)
  })

  it("should REFUSE when the token is rejected by Cloudflare", async () => {
    restore = enableTurnstile()
    stubSiteverify(false)
    const res = await request(app).post("/api/auth/login")
      .send({ email: "x@test.local", password: "whatever", turnstileToken: "bot-token" })
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/challenge failed/i)
  })

  it("should PASS a valid token through to the handler (accepts body field or header)", async () => {
    restore = enableTurnstile()
    stubSiteverify(true)
    const user = await createUser()
    // body field
    await request(app).post("/api/auth/login")
      .send({ email: user.email, password: user.password, turnstileToken: "good" })
      .expect(200)
    // header form
    await request(app).post("/api/auth/login")
      .set("cf-turnstile-response", "good")
      .send({ email: user.email, password: user.password })
      .expect(200)
  })

  it("should FAIL OPEN when Cloudflare siteverify is unreachable (availability over strictness)", async () => {
    restore = enableTurnstile()
    const real = globalThis.fetch
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes(SITEVERIFY)) throw new Error("network down")
      return real(input, init)
    })
    const user = await createUser()
    await request(app).post("/api/auth/login")
      .send({ email: user.email, password: user.password, turnstileToken: "anything" })
      .expect(200)
  })
})
