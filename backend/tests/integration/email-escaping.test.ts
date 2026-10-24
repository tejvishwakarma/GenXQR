import { describe, expect, it } from "vitest"
import {
  buildPasswordResetEmail,
  buildRenewalReminderEmail,
  buildSupportTicketAdminEmail,
  buildTicketReplyEmail,
  buildVerificationEmail,
} from "../../src/services/email.service.js"

/**
 * Account names and subjects are user text, and these emails go out from our
 * own domain, DKIM-signed. Unescaped, anyone could register a victim's address
 * with a "name" such as `<a href=evil>Your account is locked</a>` and have
 * GenXQR deliver that link to them (security audit, 23 Oct 2026).
 */
const EVIL = `<a href="https://evil.example">Your account is locked — sign in</a>`

describe("email escaping", () => {
  it("should escape the name in account emails", () => {
    for (const html of [
      buildVerificationEmail(EVIL, "https://genxqr.com/verify"),
      buildPasswordResetEmail(EVIL, "https://genxqr.com/reset"),
      buildRenewalReminderEmail(EVIL, 3, "PRO", "1 Nov 2026", "https://genxqr.com/app/billing"),
    ]) {
      expect(html).not.toContain(`<a href="https://evil.example">`)
      expect(html).toContain("&lt;a href=&quot;https://evil.example&quot;&gt;")
    }
  })

  it("should escape user text that reaches the subject line in <title> and the preheader", () => {
    const html = buildTicketReplyEmail({ userName: "A", subject: `<img src=x onerror=alert(1)>`, reply: "hi", shortId: "AB12", ticketUrl: "https://genxqr.com" })
    expect(html).not.toContain("<img src=x")
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;")
  })

  it("should escape a support subject exactly once", () => {
    const html = buildSupportTicketAdminEmail({
      userName: "A", userEmail: "a@b.com", ticketId: "t1", subject: "Tom & Jerry", category: "other", message: "m", adminUrl: "https://genxqr.com",
    })
    expect(html).toContain("<title>[Support] Tom &amp; Jerry — GenXQR</title>")
    expect(html).not.toContain("&amp;amp;")
  })
})
