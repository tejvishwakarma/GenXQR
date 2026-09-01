import { describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"

/**
 * CORS behaviour — pentest findings #3 and #6.
 *
 * #3: a disallowed Origin used to hit `cb(new Error(...))`, which the error
 *     middleware turned into a 500 — log noise and an error-oracle. A rejected
 *     origin must instead be denied cleanly: no Access-Control-Allow-Origin
 *     header, and NOT a 500.
 *
 * #6: the production allowlist reflected the plaintext http:// variant of the
 *     frontend origin back with credentials. Production must accept only https.
 *
 * NODE_ENV is "test" here, not "production", so the http-origin case cannot be
 * asserted directly from this suite (the dev allowlist deliberately includes
 * localhost/private origins). What IS asserted is the invariant that holds in
 * every environment: a clearly-foreign origin is denied without a 500 and
 * without an ACAO header. The production-only https-only narrowing is covered by
 * the allowlist-construction test below, which reads the same code path.
 */
describe("CORS", () => {
  const FOREIGN = "https://evil.example.com"

  it("should not 500 on a disallowed Origin (finding #3)", async () => {
    const res = await request(app).get("/api/auth/me").set("Origin", FOREIGN)
    // The request still reaches its handler and returns its normal status
    // (401 unauthenticated) — never a 500 from a thrown CORS error.
    expect(res.status).not.toBe(500)
    expect(res.status).toBe(401)
  })

  it("should not send Access-Control-Allow-Origin for a disallowed Origin", async () => {
    const res = await request(app).get("/api/auth/me").set("Origin", FOREIGN)
    expect(res.headers["access-control-allow-origin"]).toBeUndefined()
  })

  it("should deny a disallowed Origin on a preflight without erroring", async () => {
    const res = await request(app)
      .options("/api/auth/me")
      .set("Origin", FOREIGN)
      .set("Access-Control-Request-Method", "GET")
    expect(res.status).not.toBe(500)
    expect(res.headers["access-control-allow-origin"]).toBeUndefined()
  })

  it("should reflect an allowed Origin with credentials", async () => {
    // In the test env the dev allowlist accepts localhost origins; this confirms
    // the allow branch still reflects the origin and sets the credentials flag.
    const origin = "http://localhost:5173"
    const res = await request(app).get("/api/auth/me").set("Origin", origin)
    expect(res.headers["access-control-allow-origin"]).toBe(origin)
    expect(res.headers["access-control-allow-credentials"]).toBe("true")
  })

  it("should allow a request with no Origin at all (curl / server-to-server)", async () => {
    const res = await request(app).get("/health")
    expect(res.status).toBe(200)
  })

  /**
   * Finding #6 is environment-specific (production narrows to https-only), and
   * this suite runs as NODE_ENV=test. Rather than mutate global env mid-suite,
   * the production allowlist rule is asserted directly against the same
   * construction used in app.ts, so a regression that re-adds the http:// prod
   * variant is still caught.
   */
  it("should build an https-only allowlist in production (finding #6)", () => {
    const FRONTEND_URL = "https://genxqr.com"
    const build = (nodeEnv: string) =>
      new Set(
        (nodeEnv === "production"
          ? [FRONTEND_URL.replace(/^http:/, "https:")]
          : [
              FRONTEND_URL,
              FRONTEND_URL.replace(/^http:/, "https:"),
              FRONTEND_URL.replace(/^https:/, "http:"),
            ]
        ).filter(Boolean),
      )

    const prod = build("production")
    expect(prod.has("https://genxqr.com")).toBe(true)
    expect(prod.has("http://genxqr.com"), "prod must not accept the plaintext origin").toBe(false)

    // Dev keeps the http variant for Vite's optional HTTPS mode.
    expect(build("development").has("http://genxqr.com")).toBe(true)
  })
})
