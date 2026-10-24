import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { createUser, giveSubscription, seedPlans } from "../helpers/factories.js"

/**
 * The tracking-pixel trampoline served by GET /r/:slug when a code has a GA,
 * GTM or Facebook pixel ID.
 *
 * Its scripts are inline, and the site-wide CSP (nginx: script-src 'self')
 * blocks inline scripts — so in production the page used to load blank and
 * never redirect. The page now sends its own CSP with a per-response nonce and
 * carries the nonce on every script; nginx's /r/<slug> location adds no CSP of
 * its own (see deploy/*.conf).
 */

async function makePixelCode(pixels: { gaId?: string; gtmId?: string; fbPixelId?: string }) {
  const user = await createUser()
  await giveSubscription(user.id, "PRO")
  const slug = `px${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`.slice(0, 12)
  await prisma.qRCode.create({
    data: {
      userId: user.id,
      name: "Pixel code",
      slug,
      type: "WHATSAPP",
      category: "DYNAMIC",
      isActive: true,
      ...pixels,
      content: { create: { data: { phone: "919876543210", message: "hi & 'bye'" } } },
    },
  })
  return slug
}

describe("pixel redirect page", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should allow its own inline scripts with a nonce CSP", async () => {
    const slug = await makePixelCode({ gaId: "G-ABC123XYZ", fbPixelId: "123456789012345" })
    const res = await request(app).get(`/r/${slug}`).expect(200)

    const csp = res.headers["content-security-policy"] as string
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1]
    expect(nonce, csp).toBeTruthy()
    expect(csp).not.toContain("'unsafe-inline'")
    expect(csp).toContain("https://connect.facebook.net")

    // Every <script> on the page carries this response's nonce.
    const scripts = res.text.match(/<script\b[^>]*>/g) ?? []
    expect(scripts.length).toBeGreaterThanOrEqual(3)
    for (const tag of scripts) expect(tag).toContain(`nonce="${nonce}"`)
  })

  it("should use a fresh nonce on every response", async () => {
    const slug = await makePixelCode({ gtmId: "GTM-ABC1234" })
    const a = (await request(app).get(`/r/${slug}`)).headers["content-security-policy"] as string
    const b = (await request(app).get(`/r/${slug}`).set("User-Agent", "other")).headers["content-security-policy"] as string
    expect(a).not.toBe(b)
  })

  it("should still reach the destination when scripts are blocked", async () => {
    const slug = await makePixelCode({ gaId: "G-ABC123XYZ" })
    const res = await request(app).get(`/r/${slug}`).expect(200)
    const dest = "https://wa.me/919876543210?text=hi%20%26%20'bye'"
    const htmlDest = dest.replace(/&/g, "&amp;").replace(/'/g, "&#39;")
    expect(res.text).toContain(`<meta http-equiv="refresh" content="2;url=${htmlDest}">`)
    expect(res.text).toContain(`<noscript><a href="${htmlDest}">`)
  })
})
