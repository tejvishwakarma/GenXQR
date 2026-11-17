import { beforeEach, describe, expect, it, vi } from "vitest"

const sent: Array<{ to: string; subject: string; html: string; replyTo?: string }> = []
let failNext = false
vi.mock("../../src/services/email.service.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../src/services/email.service.js")>()
  return {
    ...orig,
    sendEmail: vi.fn(async (o: { to: string; subject: string; html: string; replyTo?: string }) => {
      if (failNext) {
        failNext = false
        throw new Error("provider down")
      }
      sent.push(o)
    }),
  }
})

const { default: app } = await import("../../src/app.js")
const { default: request } = await import("supertest")
const { prisma } = await import("../../src/db/prisma.js")
const { createAdmin, createSuperAdmin, createUser } = await import("../helpers/factories.js")

const auth = (t: { token: string }) => ({ Authorization: `Bearer ${t.token}` })

async function submit(overrides: Record<string, string> = {}) {
  const res = await request(app).post("/api/support/contact").send({
    firstName: "Sunil",
    lastName: "Hegde",
    email: "sunil@example.com",
    category: "sales",
    message: "I want to understand if the PRO plan is ads free.",
    ...overrides,
  })
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  return prisma.contactMessage.findFirst({ where: { email: overrides.email ?? "sunil@example.com" }, orderBy: { createdAt: "desc" } })
}

beforeEach(() => {
  sent.length = 0
  failNext = false
})

/**
 * Contact-form messages in the admin panel (17 Nov 2026). They used to exist
 * only as an email to support, while the email pointed at an admin list where
 * they never appeared.
 */
describe("contact messages in admin", () => {
  it("should save a contact-form message, but not a honeypot submission", async () => {
    const msg = await submit()
    expect(msg).toMatchObject({ name: "Sunil Hegde", category: "sales", status: "NEW", subject: "Sales & Enterprise — Sunil Hegde" })
    await request(app).post("/api/support/contact").send({
      firstName: "Bot", email: "bot@example.com", category: "general",
      message: "Buy cheap followers now, best prices guaranteed!!", company: "Spam Inc",
    }).expect(200)
    expect(await prisma.contactMessage.count({ where: { email: "bot@example.com" } })).toBe(0)
  })

  it("should be visible to admins only", async () => {
    await submit()
    const user = await createUser()
    await request(app).get("/admin-api/support/contact").set(auth(user)).expect(403)
    const admin = await createAdmin()
    const list = await request(app).get("/admin-api/support/contact").set(auth(admin)).expect(200)
    expect(list.body.data).toHaveLength(1)
    const count = await request(app).get("/admin-api/support/contact/count").set(auth(admin)).expect(200)
    expect(count.body.data.count).toBe(1)
  })

  it("should email a reply to the sender with Reply-To support, record it and mark the message replied", async () => {
    const msg = await submit()
    const admin = await createAdmin()
    sent.length = 0
    const res = await request(app).post(`/admin-api/support/contact/${msg!.id}/replies`).set(auth(admin))
      .send({ body: "Yes — no plan shows ads. <script>x</script>" })
      .expect(201)
    expect(res.body.data.body).toContain("no plan shows ads")
    const mail = sent.find((m) => m.to === "sunil@example.com")!
    expect(mail.replyTo).toBe("support@genxqr.com")
    expect(mail.subject).toBe(`Re: your message to GenXQR [${msg!.id.slice(0, 8).toUpperCase()}]`)
    expect(mail.html).not.toContain("<script>x")
    expect(mail.html).toContain("I want to understand if the PRO plan is ads free.")
    const after = await prisma.contactMessage.findUniqueOrThrow({ where: { id: msg!.id }, include: { replies: true } })
    expect(after.status).toBe("REPLIED")
    expect(after.repliedAt).not.toBeNull()
    expect(after.replies).toHaveLength(1)
  })

  it("should not record a reply whose email failed", async () => {
    const msg = await submit()
    const admin = await createAdmin()
    failNext = true
    await request(app).post(`/admin-api/support/contact/${msg!.id}/replies`).set(auth(admin))
      .send({ body: "Hello there" })
      .expect(502)
    const after = await prisma.contactMessage.findUniqueOrThrow({ where: { id: msg!.id }, include: { replies: true } })
    expect(after.replies).toHaveLength(0)
    expect(after.status).toBe("NEW")
  })

  it("should let an admin mark a message replied after answering from the inbox", async () => {
    const msg = await submit()
    const admin = await createAdmin()
    await request(app).patch(`/admin-api/support/contact/${msg!.id}`).set(auth(admin)).send({ status: "DONE" }).expect(422)
    await request(app).patch(`/admin-api/support/contact/${msg!.id}`).set(auth(admin))
      .send({ status: "REPLIED", adminNotes: "Answered from Gmail" })
      .expect(200)
    const after = await prisma.contactMessage.findUniqueOrThrow({ where: { id: msg!.id } })
    expect(after.status).toBe("REPLIED")
    expect(after.repliedAt).not.toBeNull()
    expect(after.adminNotes).toBe("Answered from Gmail")
  })

  it("should let only a super admin delete a message, with its replies", async () => {
    const msg = await submit()
    const admin = await createAdmin()
    await request(app).post(`/admin-api/support/contact/${msg!.id}/replies`).set(auth(admin)).send({ body: "Hello there" }).expect(201)
    await request(app).delete(`/admin-api/support/contact/${msg!.id}`).set(auth(admin)).expect(403)
    const superAdmin = await createSuperAdmin()
    await request(app).delete(`/admin-api/support/contact/${msg!.id}`).set(auth(superAdmin)).expect(200)
    expect(await prisma.contactMessage.count({ where: { id: msg!.id } })).toBe(0)
    expect(await prisma.contactReply.count({ where: { contactMessageId: msg!.id } })).toBe(0)
  })
})
