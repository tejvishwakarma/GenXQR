import { describe, expect, it } from "vitest"
import app from "../../src/app.js"

/**
 * Which address Express treats as the visitor (req.ip), behind
 * visitor → Cloudflare → nginx (loopback) → Node. See config/trusted-proxies.ts.
 *
 * With `trust proxy 1` it was the Cloudflare edge for everyone, so every per-IP
 * limit and scan location was shared across unrelated visitors.
 */
function ipFor(xForwardedFor: string | undefined, socketAddress = "127.0.0.1"): string | undefined {
  // Express's own request prototype for this app (typed out of Application's .d.ts).
  const req = Object.create((app as unknown as { request: object }).request) as { app: unknown; headers: Record<string, string>; connection: unknown; socket: unknown; ip?: string }
  req.app = app
  req.headers = xForwardedFor ? { "x-forwarded-for": xForwardedFor } : {}
  req.connection = req.socket = { remoteAddress: socketAddress }
  return req.ip
}

describe("client IP behind Cloudflare and nginx", () => {
  it("should be the visitor, not the Cloudflare edge nginx saw", () => {
    // Cloudflare sets "visitor"; nginx appends the edge that connected to it.
    expect(ipFor("203.0.113.7, 162.158.10.20")).toBe("203.0.113.7")
    expect(ipFor("2001:db8::7, 2606:4700::1")).toBe("2001:db8::7")
  })

  it("should still be the visitor if nginx already restores the real IP", () => {
    expect(ipFor("203.0.113.7, 203.0.113.7")).toBe("203.0.113.7")
  })

  it("should ignore a forged header sent straight to the origin", () => {
    // Bypassing Cloudflare: nginx appends the attacker's real address.
    expect(ipFor("1.2.3.4, 198.51.100.9")).toBe("198.51.100.9")
    expect(ipFor("1.2.3.4, 162.158.0.1, 198.51.100.9")).toBe("198.51.100.9")
  })

  it("should not trust a header on a connection that did not come through nginx", () => {
    expect(ipFor("203.0.113.7", "198.51.100.50")).toBe("198.51.100.50")
  })
})
