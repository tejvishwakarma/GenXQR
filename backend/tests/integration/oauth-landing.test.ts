import { describe, expect, it } from "vitest"
import { oauthLandingUrl } from "../../src/routes/auth.routes.js"

/**
 * Google sign-in used to land on the page it started from with ?oauth_code=,
 * but only the dashboard exchanges that code — so accepting a team invite with
 * Google looped back to "sign in to accept" (security audit, 23 Oct 2026).
 */
describe("Google sign-in landing URL", () => {
  it("should always land on the dashboard, carrying where to go next", () => {
    const url = new URL(oauthLandingUrl("https://genxqr.com", "abc123", "/invite/tok_1"))
    expect(url.origin + url.pathname).toBe("https://genxqr.com/app/dashboard")
    expect(url.searchParams.get("oauth_code")).toBe("abc123")
    expect(url.searchParams.get("next")).toBe("/invite/tok_1")
  })

  it("should keep a next path that has its own query string intact", () => {
    const url = new URL(oauthLandingUrl("https://genxqr.com", "abc", "/app/billing?plan=PRO&cycle=yearly"))
    expect(url.searchParams.get("next")).toBe("/app/billing?plan=PRO&cycle=yearly")
    expect(url.searchParams.get("oauth_code")).toBe("abc")
  })

  it("should not add next for the dashboard itself", () => {
    expect(new URL(oauthLandingUrl("https://genxqr.com", "abc", "/app/dashboard")).searchParams.has("next")).toBe(false)
  })
})
