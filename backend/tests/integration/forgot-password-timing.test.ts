import { describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { createUser } from "../helpers/factories.js"

/**
 * forgot-password must not reveal which emails have accounts — not in the
 * answer, and not in how long the answer takes (security audit, 24 Oct 2026).
 */
async function timeIt(email: string) {
  const started = performance.now()
  const res = await request(app).post("/api/auth/forgot-password").send({ email })
  return { ms: performance.now() - started, status: res.status, body: res.body }
}

describe("forgot-password", () => {
  it("should answer the same way, without waiting for the reset work", async () => {
    const user = await createUser()
    const real = await timeIt(user.email)
    const fake = await timeIt(`nobody.${Date.now()}@test.local`)
    expect(real.status).toBe(fake.status)
    expect(real.body).toEqual(fake.body)
    // The token is written after the response.
    let tokens = 0
    for (let i = 0; i < 40 && tokens === 0; i++) {
      tokens = await prisma.passwordResetToken.count({ where: { userId: user.id } })
      if (!tokens) await new Promise((r) => setTimeout(r, 25))
    }
    expect(tokens).toBe(1)
  })

  it("should not take measurably longer for a real account", async () => {
    const user = await createUser()
    const real: number[] = []
    const fake: number[] = []
    for (let i = 0; i < 5; i++) {
      real.push((await timeIt(user.email)).ms)
      fake.push((await timeIt(`nobody${i}.${Date.now()}@test.local`)).ms)
    }
    const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]!
    // The old code awaited two token writes and an email send for real accounts only.
    expect(median(real) - median(fake)).toBeLessThan(15)
  })
})
