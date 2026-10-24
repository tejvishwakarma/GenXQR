import { gzipSync } from "node:zlib"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"

/**
 * One unauthenticated request must not be able to kill the server process
 * (dependency advisories, 24 Oct 2026). Both of these threw where nothing could
 * catch them; PM2 restarts the worker, so repeating the request kept the site down.
 *
 * - body-parser < 1.20.9 (GHSA-27r3-jxmh-p828): a compressed body followed by
 *   trailing bytes. The response is sent normally, then the trailing bytes reach
 *   the finished decoder and its error is thrown. Runs before routing, so every
 *   route — no login, no matching path needed.
 * - multer < 2.3.0 (GHSA-wc9g-mqfw-jrwm): field `a[4294967294]` builds an array of
 *   the maximum length, then `a[]` pushes past it — RangeError inside multer's field
 *   parsing. Reachable on the public CV upload (/api/careers/apply).
 *
 * A crash here is an uncaught exception after (or instead of) the response, so
 * the tests listen for one rather than only checking the status.
 */

let crashes: unknown[] = []
const onCrash = (err: unknown) => { crashes.push(err) }

beforeEach(() => {
  crashes = []
  process.on("uncaughtException", onCrash)
})

afterEach(() => {
  process.off("uncaughtException", onCrash)
})

/** Lets anything the request left running (decoder, parser) finish and throw. */
const settle = () => new Promise((r) => setTimeout(r, 300))

describe("requests that used to crash the process", () => {
  it("should survive a gzip body with trailing bytes", async () => {
    const body = Buffer.concat([
      gzipSync(JSON.stringify({ email: "nobody@test.local", password: "irrelevant" })),
      Buffer.from("trailing bytes after the gzip frame"),
    ])
    await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .set("Content-Encoding", "gzip")
      .send(body)
      .catch(() => undefined)
    await settle()

    expect(crashes.map(String), "REAL BUG: one request crashed the server process").toEqual([])
    // And the app still answers.
    await request(app).get("/health").expect(200)
  })

  it("should survive a compressed body with an unsupported charset", async () => {
    // express.json has a `verify` (the webhook's raw body), and with one, 1.20.x
    // created the decoder BEFORE refusing the charset: the 415 left it piped
    // with no error listener, and our error handler (unlike Express's default)
    // does not unpipe the request — so the invalid gzip bytes threw.
    await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json; charset=utf-bogus")
      .set("Content-Encoding", "gzip")
      .send(Buffer.from("this is not gzip data at all"))
      .catch(() => undefined)
    await settle()

    expect(crashes.map(String), "REAL BUG: one request crashed the server process").toEqual([])
    await request(app).get("/health").expect(200)
  })

  it("should refuse bracketed field names on the public CV upload before they are parsed", async () => {
    // The real attack uses index 4294967294 and blocks the event loop for over
    // 30 s; a smaller index shows the same thing without hanging the suite if
    // the limits are ever removed (it would then be ACCEPTED, and this fails).
    const t0 = Date.now()
    const res = await request(app)
      .post("/api/careers/apply")
      .field("a[20000000]", "x")
      .field("a[b]", "y")
      .timeout(10_000)

    expect(res.status).toBe(400)
    expect(res.body.error, `REAL BUG: bracketed field names reach multer's parser (${Date.now() - t0} ms): ${JSON.stringify(res.body)}`)
      .toMatch(/nesting too deep|array index too large/i)
    expect(crashes.map(String)).toEqual([])
  })

  it("should still accept the careers form's ordinary flat fields", async () => {
    const res = await request(app)
      .post("/api/careers/apply")
      .field("name", "Test Applicant")
      .field("email", "applicant@test.local")
      .field("jobTitle", "Engineer")
      .timeout(10_000)

    // Refused for the missing CV or job, but NOT by the field limits.
    expect(res.body.error ?? "").not.toMatch(/nesting|array index|too many fields/i)
  })
})
