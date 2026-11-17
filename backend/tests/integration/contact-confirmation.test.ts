import { describe, expect, it, vi } from "vitest"

const sent: Array<{ to: string; subject: string; html: string }> = []
vi.mock("../../src/services/email.service.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../src/services/email.service.js")>()
  return { ...orig, sendEmail: vi.fn(async (o: { to: string; subject: string; html: string }) => { sent.push(o) }) }
})

const { default: app } = await import("../../src/app.js")
const { default: request } = await import("supertest")

/**
 * The public contact form is anonymous, so whoever fills it in picks the
 * recipient of the confirmation email. It used to echo their name and subject,
 * letting anyone send GenXQR-branded email with their own words to any
 * address (security audit, 24 Oct 2026).
 */
describe("contact form confirmation", () => {
  it("should not put anything the visitor typed into the confirmation", async () => {
    const res = await request(app).post("/api/support/contact").send({
      firstName: "Your account is locked",
      lastName: "call +91 99999 99999",
      email: "victim@example.com",
      subject: "Verify at evil.example now",
      category: "general",
      message: "This is the message body, long enough to pass validation.",
    })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    const confirmation = sent.find((m) => m.to === "victim@example.com")
    expect(confirmation).toBeTruthy()
    expect(confirmation!.html).not.toContain("account is locked")
    expect(confirmation!.html).not.toContain("evil.example")
    expect(confirmation!.html).not.toContain("+91")
  })

  it("should tell support it is a contact message to reply to, not a ticket in the admin panel", async () => {
    const res = await request(app).post("/api/support/contact").send({
      firstName: "Sunil",
      lastName: "Hegde \"&<b>",
      email: "sunil@example.com",
      subject: "Is Pro ad-free?",
      category: "sales",
      message: "I want to understand if the PRO plan is ads free.",
    })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    const toSupport = sent.find((m) => m.subject.startsWith("[Contact]") && m.subject.includes("Sunil"))
    expect(toSupport).toBeTruthy()
    // The contact form creates no ticket: no "ticket" wording, no admin link.
    expect(toSupport!.html).toContain("Contact form message")
    expect(toSupport!.html).not.toContain("View Ticket in Admin")
    expect(toSupport!.html).not.toContain("/admin/support")
    expect(toSupport!.html).toContain('href="mailto:sunil%40example.com?subject=Re%3A%20')
    // The sender's name is escaped wherever it appears.
    expect(toSupport!.html).not.toContain("<b>")
  })
})
