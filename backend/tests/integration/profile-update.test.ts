import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { createUser, seedPlans } from "../helpers/factories.js"

/**
 * PATCH /api/auth/me — the profile fields a user owns.
 *
 * This endpoint did not exist: the settings page rendered a form with
 * uncontrolled inputs and a Save button with no handler, so editing the profile
 * silently did nothing. The mobile number matters most — checkout stores one on
 * first payment and reuses it on every later order, so a typo was permanent.
 */
describe("PATCH /api/auth/me", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should update the display name", async () => {
    const user = await createUser({ name: "Old Name" })

    const res = await request(app)
      .patch("/api/auth/me")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ name: "New Name" })

    expect(res.status).toBe(200)
    expect(res.body.data.name).toBe("New Name")
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe("New Name")
  })

  it("should store a mobile number in the bare 10-digit form the gateway needs", async () => {
    const user = await createUser()

    const res = await request(app)
      .patch("/api/auth/me")
      .set("Authorization", `Bearer ${user.token}`)
      // Typed the way a person actually types it.
      .send({ phone: "+91 98765 43210" })

    expect(res.status).toBe(200)
    // Normalised on the way in, so it is immediately usable at checkout and
    // cannot differ in format from a number captured there.
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).phone).toBe("9876543210")
  })

  it("should reject an implausible mobile number", async () => {
    const user = await createUser()

    const res = await request(app)
      .patch("/api/auth/me")
      .set("Authorization", `Bearer ${user.token}`)
      // Indian mobile numbers start 6-9; this is the classic junk value.
      .send({ phone: "1234567890" })

    // 422 is this app's status for every validation failure (see error.middleware).
    expect(res.status).toBe(422)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).phone).toBeNull()
  })

  it("should let a stored number be cleared", async () => {
    const user = await createUser()
    await prisma.user.update({ where: { id: user.id }, data: { phone: "9876543210" } })

    const res = await request(app)
      .patch("/api/auth/me")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ phone: null })

    expect(res.status).toBe(200)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).phone).toBeNull()
  })

  it("should ignore an attempt to change the email address", async () => {
    const user = await createUser()
    const original = user.email

    const res = await request(app)
      .patch("/api/auth/me")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ name: "Someone", email: "attacker@evil.test" })

    expect(res.status).toBe(200)
    // Email is not in the schema, so Zod strips it. Changing it would need
    // re-verification and a uniqueness check, and it is the key trial
    // eligibility is built on — so it must not be settable here.
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email).toBe(original)
  })

  it("should ignore an attempt to escalate role", async () => {
    const user = await createUser()

    const res = await request(app)
      .patch("/api/auth/me")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ name: "Someone", role: "SUPER_ADMIN" })

    expect(res.status).toBe(200)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe("USER")
  })

  it("should reject an empty name", async () => {
    const user = await createUser({ name: "Original" })

    const res = await request(app)
      .patch("/api/auth/me")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ name: "   " })

    expect(res.status).toBe(422)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe("Original")
  })

  it("should require authentication", async () => {
    const user = await createUser({ name: "Original" })

    const res = await request(app).patch("/api/auth/me").send({ name: "Hacked" })

    expect(res.status).toBe(401)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe("Original")
  })

  it("should expose the stored phone via GET /me so the UI can prefill it", async () => {
    const user = await createUser()
    await prisma.user.update({ where: { id: user.id }, data: { phone: "9876543210" } })

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${user.token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.phone).toBe("9876543210")
  })
})
